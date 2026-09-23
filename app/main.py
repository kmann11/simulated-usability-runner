from __future__ import annotations

import asyncio
import copy
import csv
import datetime as dt
import sys
import threading
import time
import uuid
from collections import Counter
from pathlib import Path
from statistics import mean
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Literal, Optional

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.generic_usability_runner import (  # noqa: E402
    DEFAULT_GENERIC_CONFIG,
    recursive_merge,
    run_experiment,
)
from scripts.generic_usability_stress import run_stress_benchmark  # noqa: E402
from scripts.heuristic_review import review_flow  # noqa: E402
from scripts.persona_segments import (  # noqa: E402
    LEVER_DEFINITIONS,
    LEVER_GROUPS,
    LOBS,
    SEGMENT_PRESETS,
    get_segments_for_lob,
    get_segment_preset,
    normalize_persona,
)
from scripts.tlx_review import review_flow as review_tlx_flow  # noqa: E402

RUN_LOCK = threading.Lock()
RUN_JOBS_LOCK = threading.Lock()
RUN_JOBS: dict[str, dict[str, Any]] = {}
AUTH_RESUME_LOCK = threading.Lock()
AUTH_RESUME_EVENTS: dict[str, threading.Event] = {}

app = FastAPI(
    title="AI Usability Research App",
    version="0.1.0",
    description="Minimal API wrapper for the generic Playwright usability runner.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


Severity = Literal["low", "medium", "high"]
RunStatus = Literal["completed", "abandoned", "error"]


class StepArtifact(BaseModel):
    step_index: int
    persona: str
    url: str
    action: str
    status: RunStatus
    screenshot_path: Optional[str] = None
    dom_summary: str = ""
    visible_labels: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class EvidenceRef(BaseModel):
    step_index: int
    persona: str
    url: str
    screenshot_path: Optional[str] = None
    signal_type: str
    note: str


class HeuristicScore(BaseModel):
    heuristic_id: str
    heuristic_name: str
    score: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0, le=1)
    severity: Severity
    summary: str
    recommendation: str
    evidence: list[EvidenceRef] = Field(default_factory=list)


class SessionHeuristicReview(BaseModel):
    session_id: str
    persona: str
    scores: list[HeuristicScore]


class FlowHeuristicReview(BaseModel):
    overall_score: Optional[float] = None
    top_risks: list[str] = Field(default_factory=list)
    aggregate_scores: list[HeuristicScore] = Field(default_factory=list)
    session_reviews: list[SessionHeuristicReview] = Field(default_factory=list)


class TlxSubscaleScore(BaseModel):
    id: str
    name: str
    score: float = Field(ge=0, le=100)
    rationale: str = ""


class SessionTlxReview(BaseModel):
    session_id: str
    persona: str
    overall: float
    confidence: float = Field(ge=0, le=1)
    subscales: list[TlxSubscaleScore] = Field(default_factory=list)
    mental_demand: int = Field(ge=0, le=100)
    physical_demand: int = Field(ge=0, le=100)
    temporal_demand: int = Field(ge=0, le=100)
    performance: int = Field(ge=0, le=100)
    effort: int = Field(ge=0, le=100)
    frustration: int = Field(ge=0, le=100)


class PersonaTlxReview(BaseModel):
    persona: str
    overall: Optional[float] = None
    confidence: float = Field(ge=0, le=1)
    subscales: list[TlxSubscaleScore] = Field(default_factory=list)
    session_count: int = 0


class FlowTlxReview(BaseModel):
    overall: Optional[float] = None
    confidence: Optional[float] = None
    disclaimer: str = (
        "Directional agent workload forecast (Synthetic TLX). "
        "Not a human NASA TLX questionnaire."
    )
    subscales: list[TlxSubscaleScore] = Field(default_factory=list)
    session_reviews: list[SessionTlxReview] = Field(default_factory=list)
    persona_reviews: list[PersonaTlxReview] = Field(default_factory=list)


class LeverOption(BaseModel):
    value: str
    label: str


class LeverDefinition(BaseModel):
    id: str
    name: str
    summary: str
    group: str = ""
    options: list[LeverOption]


class SegmentPreset(BaseModel):
    id: str
    name: str
    lob: str = ""
    brand: str = ""
    # Whether this is the brand's "headpin" (primary) segment. Surfaced in the
    # UI with a Primary badge; also used to seed default testers when a LOB
    # pill is picked.
    is_primary: bool = False
    # "brand" (owned by one LOB) or "cross_brand" (Gen Z, High Value — visible
    # under every LOB pill). Cross-brand rows have lob="".
    scope: str = "brand"
    # Reflects Marketing/UXR/Analytics alignment and, for agent-drafted lever
    # mappings, the trust level the values should be read at.
    confidence: str = "medium"
    summary: str = ""
    research_notes: str = ""
    levers: dict[str, str] = Field(default_factory=dict)
    derived_behavior: dict[str, float] = Field(default_factory=dict)


class Lob(BaseModel):
    id: str
    name: str
    summary: str = ""


class LeverGroup(BaseModel):
    id: str
    name: str
    summary: str = ""


class ConfigPayload(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)
    include_heuristics: bool = False
    include_tlx: bool = True
    capture_screenshots: bool = False


class HeuristicReviewPayload(BaseModel):
    """Run heuristic scoring against pre-captured artifacts.

    Useful if you already have step artifacts (e.g. saved from a prior run) and
    want to re-score them without re-running Playwright.
    """

    sessions: list[SessionHeuristicReview] = Field(default_factory=list)
    raw_sessions: list[dict[str, Any]] = Field(default_factory=list)


class TlxReviewPayload(BaseModel):
    """Run Synthetic TLX scoring against pre-captured artifacts."""

    raw_sessions: list[dict[str, Any]] = Field(default_factory=list)
    persona_profiles: dict[str, dict[str, Any]] = Field(default_factory=dict)


class StressPayload(BaseModel):
    output_prefix: str = "generic_usability_benchmark"
    runs_per_persona: int = 1


SIGNAL_LABELS = {
    "hesitation_wait": "Hesitation",
    "misclick": "Misclick",
    "step_error": "Step error",
    "navigated_back": "Backtracking",
    "loop_to_prior_state": "Looping",
    "no_visible_change_after_click": "No visible change",
}


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def utcnow_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def estimate_run_duration_seconds(
    config: dict[str, Any],
    include_heuristics: bool,
    capture_screenshots: bool,
    include_tlx: bool = True,
) -> int:
    session_count = max(1, len(config.get("personas", [])) * int(config.get("runs_per_persona", 1)))
    base_per_session = int(clamp(round(int(config.get("run_timeout_s", 120)) * 0.28), 25, 55))
    screenshot_penalty = 6 if capture_screenshots else 0
    heuristic_penalty = 2 if include_heuristics else 0
    tlx_penalty = 1 if include_tlx else 0
    base_overhead = 20
    return base_overhead + session_count * (
        base_per_session + screenshot_penalty + heuristic_penalty + tlx_penalty
    )


def _bool_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() == "true"


def _int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _split_actions(path_value: Any) -> list[str]:
    parts = [part.strip() for part in str(path_value or "").split("->")]
    return [part for part in parts if part]


def _status_for_row(row: dict[str, Any]) -> str:
    nav_path = str(row.get("nav_path") or "")
    if nav_path.startswith("error:"):
        return "error"
    if _bool_value(row.get("abandoned")):
        return "abandoned"
    return "completed"


def _download_path(path_value: str) -> str | None:
    if not path_value:
        return None
    candidate = Path(path_value).resolve()
    output_root = (WORKSPACE_ROOT / "output").resolve()
    try:
        relative = candidate.relative_to(output_root)
    except ValueError:
        return None
    return str(Path("output") / relative)


def _artifact_signals(artifacts: list[dict[str, Any]]) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for artifact in artifacts:
        for note in artifact.get("notes", []) or []:
            label = SIGNAL_LABELS.get(note, note.replace("_", " ").strip().title())
            if not label or label in seen:
                continue
            seen.add(label)
            labels.append(label)
    return labels


def _persona_meta_index(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for persona in config.get("personas", []):
        name = str(persona.get("name") or "").strip()
        if not name:
            continue
        segment_id = persona.get("segment")
        preset = get_segment_preset(segment_id) if segment_id else None
        index[name] = {
            "segment_id": preset.get("id") if preset else segment_id,
            "segment_name": preset.get("name") if preset else None,
            "brand": preset.get("brand") if preset else None,
        }
    return index


def build_session_rows(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    persona_meta = _persona_meta_index(config)
    persona_counts: Counter[str] = Counter()
    sessions: list[dict[str, Any]] = []

    for row in rows:
        persona = str(row.get("persona") or "").strip() or "persona"
        persona_counts[persona] += 1
        meta = persona_meta.get(persona, {})
        artifacts = list(row.get("_artifacts") or [])
        screenshot_count = sum(1 for artifact in artifacts if artifact.get("screenshot_path"))
        final_url = next(
            (artifact.get("url") for artifact in reversed(artifacts) if artifact.get("url")),
            str(row.get("start_url") or config.get("start_url") or ""),
        )

        sessions.append(
            {
                "session_id": f"{persona}-{persona_counts[persona]:02d}",
                "persona": persona,
                "segment_id": meta.get("segment_id"),
                "segment_name": meta.get("segment_name"),
                "brand": meta.get("brand"),
                "status": _status_for_row(row),
                "steps": _int_value(row.get("steps")),
                "hesitation": _int_value(row.get("hesitation")),
                "misclick": _int_value(row.get("misclick")),
                "backtrack": _int_value(row.get("backtrack")),
                "nav_path": str(row.get("nav_path") or ""),
                "semantic_path": str(row.get("semantic_path") or row.get("nav_path") or ""),
                "actions": _split_actions(row.get("semantic_path") or row.get("nav_path")),
                "timestamp": str(row.get("timestamp") or ""),
                "artifact_count": len(artifacts),
                "screenshot_count": screenshot_count,
                "final_url": final_url,
                "signals": _artifact_signals(artifacts),
            }
        )

    return sessions


def build_persona_summaries(session_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for session in session_rows:
        grouped.setdefault(session["persona"], []).append(session)

    summaries: list[dict[str, Any]] = []
    for persona, items in grouped.items():
        runs = len(items)
        completed = sum(item["status"] == "completed" for item in items)
        error_runs = sum(item["status"] == "error" for item in items)
        abandoned_runs = sum(item["status"] == "abandoned" for item in items)
        signal_counts = Counter(
            signal for item in items for signal in item.get("signals", []) if signal
        )
        top_signal = signal_counts.most_common(1)[0][0] if signal_counts else None
        first = items[0]

        summaries.append(
            {
                "persona": persona,
                "segment_id": first.get("segment_id"),
                "segment_name": first.get("segment_name"),
                "brand": first.get("brand"),
                "runs": runs,
                "completion_rate": round(completed / runs, 3) if runs else 0.0,
                "avg_steps": round(mean(item["steps"] for item in items), 2) if items else 0.0,
                "avg_hesitation": round(mean(item["hesitation"] for item in items), 2) if items else 0.0,
                "avg_misclick": round(mean(item["misclick"] for item in items), 2) if items else 0.0,
                "avg_backtrack": round(mean(item["backtrack"] for item in items), 2) if items else 0.0,
                "error_runs": error_runs,
                "abandoned_runs": abandoned_runs,
                "top_signal": top_signal,
            }
        )

    return summaries


def _persona_profile_index(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for persona in config.get("personas", []) or []:
        name = str(persona.get("name") or "").strip()
        if not name:
            continue
        index[name] = {
            "exploration": persona.get("exploration"),
            "patience": persona.get("patience"),
            "attention": persona.get("attention"),
            "error_rate": persona.get("error_rate"),
            "segment": persona.get("segment"),
            "levers": persona.get("levers") or {},
        }
    return index


def build_run_response(
    config: dict[str, Any],
    rows: list[dict[str, Any]],
    warnings: list[str],
    include_heuristics: bool,
    response_status: str = "completed",
    include_tlx: bool = True,
) -> dict[str, Any]:
    session_rows = build_session_rows(rows, config)
    output_file_value = str(config.get("output_file") or "")
    response: dict[str, Any] = {
        "status": response_status,
        "experiment_name": config["experiment_name"],
        "start_url": config["start_url"],
        "warnings": warnings,
        # output_file is now informational only. The API does not auto-save
        # the CSV; the UI builds it on demand from the rows above.
        "output_file": output_file_value,
        "download_path": _download_path(output_file_value),
        "summary": summarize_rows(rows),
        "sessions": session_rows,
        "persona_summaries": build_persona_summaries(session_rows),
    }

    sessions: list[tuple[str, list[dict[str, Any]]]] = []
    session_metrics: list[dict[str, Any]] = []
    for row in rows:
        artifacts = row.get("_artifacts") or []
        persona = row.get("persona") or ""
        sessions.append((persona, artifacts))
        session_metrics.append(
            {
                "steps": row.get("steps"),
                "hesitation": row.get("hesitation"),
                "misclick": row.get("misclick"),
                "backtrack": row.get("backtrack"),
                "abandoned": row.get("abandoned"),
                "nav_path": row.get("nav_path"),
                "status": _status_for_row(row),
            }
        )

    if include_heuristics:
        response["heuristic_review"] = review_flow(sessions)

    if include_tlx:
        response["tlx_review"] = review_tlx_flow(
            sessions,
            session_metrics=session_metrics,
            persona_profiles=_persona_profile_index(config),
        )

    return response


def _job_percent(phase: str, total_sessions: int, completed_sessions: int) -> float:
    total = max(1, total_sessions)
    completed = clamp(completed_sessions, 0, total)
    if phase == "queued":
        return 0.0
    if phase == "starting":
        return 0.04
    if phase == "waiting_for_login":
        return 0.06
    if phase == "browser_ready":
        return 0.08
    if phase == "cancelling":
        return min(0.98, 0.08 + (completed / total) * 0.86)
    if phase == "session_started":
        return min(0.9, 0.08 + ((completed + 0.2) / total) * 0.84)
    if phase == "session_completed":
        return min(0.94, 0.08 + (completed / total) * 0.86)
    if phase == "heuristics":
        return 0.96
    if phase == "finishing":
        return 0.98
    if phase == "completed":
        return 1.0
    if phase == "cancelled":
        return 1.0
    return 0.0


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "warnings": list(job.get("warnings", [])),
        "error": job.get("error"),
        "progress": copy.deepcopy(job.get("progress")),
        "result": copy.deepcopy(job.get("result")),
    }


def _update_job_progress(job_id: str, **event: Any) -> None:
    with RUN_JOBS_LOCK:
        job = RUN_JOBS.get(job_id)
        if job is None:
            return

        if job["status"] == "queued":
            job["status"] = "running"

        started_monotonic = job.get("_started_monotonic")
        if started_monotonic is None:
            started_monotonic = time.monotonic()
            job["_started_monotonic"] = started_monotonic
            job["progress"]["started_at"] = utcnow_iso()

        phase = str(event.get("phase") or job["progress"].get("phase") or "running")
        if phase == "cancelling" and job["status"] not in {"completed", "failed", "cancelled"}:
            job["status"] = "cancelling"
        elif job["status"] == "cancelling" and phase not in {"completed", "failed", "cancelled"}:
            phase = "cancelling"
        total_sessions = int(event.get("total_sessions") or job["progress"].get("total_sessions") or 1)
        completed_sessions = int(event.get("completed_sessions") or 0)
        elapsed_seconds = int(max(0, time.monotonic() - started_monotonic))
        estimated_total = int(job.get("estimated_total_seconds") or 0)

        if completed_sessions > 0 and total_sessions > 0 and elapsed_seconds > 0:
            observed_total = int(round((elapsed_seconds / completed_sessions) * total_sessions))
            estimated_total = max(estimated_total, observed_total)
        if phase in {"heuristics", "finishing"}:
            estimated_total = max(estimated_total, elapsed_seconds + 8)

        job["progress"] = {
            "phase": phase,
            "message": event.get("message") or job["progress"].get("message") or "",
            "percent": round(_job_percent(phase, total_sessions, completed_sessions), 3),
            "elapsed_seconds": elapsed_seconds,
            "estimated_total_seconds": estimated_total,
            "estimated_remaining_seconds": max(0, estimated_total - elapsed_seconds),
            "total_sessions": total_sessions,
            "completed_sessions": completed_sessions,
            "current_session": event.get("current_session"),
            "current_persona": event.get("current_persona"),
            "current_run_number": event.get("current_run_number"),
            "started_at": job["progress"].get("started_at"),
            "updated_at": utcnow_iso(),
        }


def _complete_job(job_id: str, result: dict[str, Any]) -> None:
    with RUN_JOBS_LOCK:
        job = RUN_JOBS.get(job_id)
        if job is None:
            return

        started_monotonic = job.get("_started_monotonic") or time.monotonic()
        elapsed_seconds = int(max(0, time.monotonic() - started_monotonic))
        total_sessions = int(job["progress"].get("total_sessions") or 1)
        job["status"] = "completed"
        job["result"] = result
        job["progress"] = {
            **job["progress"],
            "phase": "completed",
            "message": "Results are ready.",
            "percent": 1.0,
            "elapsed_seconds": elapsed_seconds,
            "estimated_total_seconds": elapsed_seconds or int(job.get("estimated_total_seconds") or 0),
            "estimated_remaining_seconds": 0,
            "completed_sessions": total_sessions,
            "current_session": total_sessions,
            "updated_at": utcnow_iso(),
        }


def _cancel_job(job_id: str, result: dict[str, Any]) -> None:
    with RUN_JOBS_LOCK:
        job = RUN_JOBS.get(job_id)
        if job is None:
            return

        started_monotonic = job.get("_started_monotonic") or time.monotonic()
        elapsed_seconds = int(max(0, time.monotonic() - started_monotonic))
        completed_sessions = int(job["progress"].get("completed_sessions") or 0)
        job["status"] = "cancelled"
        job["result"] = result
        job["progress"] = {
            **job["progress"],
            "phase": "cancelled",
            "message": "Run stopped. Partial results are ready.",
            "percent": 1.0,
            "elapsed_seconds": elapsed_seconds,
            "estimated_total_seconds": elapsed_seconds or int(job.get("estimated_total_seconds") or 0),
            "estimated_remaining_seconds": 0,
            "completed_sessions": completed_sessions,
            "current_session": completed_sessions,
            "updated_at": utcnow_iso(),
        }


def _fail_job(job_id: str, error: Exception) -> None:
    with RUN_JOBS_LOCK:
        job = RUN_JOBS.get(job_id)
        if job is None:
            return

        started_monotonic = job.get("_started_monotonic")
        elapsed_seconds = int(max(0, time.monotonic() - started_monotonic)) if started_monotonic else 0
        job["status"] = "failed"
        job["error"] = str(error)
        job["progress"] = {
            **job["progress"],
            "phase": "failed",
            "message": "The run stopped before results could be generated.",
            "elapsed_seconds": elapsed_seconds,
            "estimated_remaining_seconds": 0,
            "updated_at": utcnow_iso(),
        }


def _run_job(job_id: str, config: dict[str, Any], warnings: list[str], payload: ConfigPayload) -> None:
    browser_conf = config.get("browser") or {}
    auth_resume_event: threading.Event | None = None
    if bool(browser_conf.get("interactive_auth")):
        auth_resume_event = threading.Event()
        with AUTH_RESUME_LOCK:
            AUTH_RESUME_EVENTS[job_id] = auth_resume_event

    try:
        with RUN_JOBS_LOCK:
            job = RUN_JOBS.get(job_id)
            cancel_event = job.get("_cancel_event") if job is not None else None

        with RUN_LOCK:
            rows = asyncio.run(
                run_experiment(
                    config,
                    progress_callback=lambda event: _update_job_progress(job_id, **event),
                    should_cancel=(lambda: bool(cancel_event and cancel_event.is_set())),
                    auth_resume_event=auth_resume_event,
                )
            )
            total_sessions = max(1, len(config["personas"]) * int(config["runs_per_persona"]))
            was_cancelled = bool(cancel_event and cancel_event.is_set())
            scoring = payload.include_heuristics or payload.include_tlx
            if scoring and rows:
                if payload.include_heuristics and payload.include_tlx:
                    score_message = (
                        "Scoring heuristic signals and Synthetic TLX for the completed sessions."
                        if was_cancelled
                        else "Scoring heuristic signals, Synthetic TLX, and packaging the dashboard."
                    )
                elif payload.include_tlx:
                    score_message = (
                        "Scoring Synthetic TLX for the completed sessions."
                        if was_cancelled
                        else "Scoring Synthetic TLX and packaging the dashboard."
                    )
                else:
                    score_message = (
                        "Scoring heuristic signals for the completed sessions."
                        if was_cancelled
                        else "Scoring heuristic signals and packaging the dashboard."
                    )
                _update_job_progress(
                    job_id,
                    phase="cancelling" if was_cancelled else "heuristics",
                    total_sessions=total_sessions,
                    completed_sessions=len(rows),
                    message=score_message,
                )
            else:
                _update_job_progress(
                    job_id,
                    phase="cancelling" if was_cancelled else "finishing",
                    total_sessions=total_sessions,
                    completed_sessions=len(rows),
                    message=(
                        "Stopping the run and compiling the completed sessions."
                        if was_cancelled
                        else "Compiling the results dashboard."
                    ),
                )

            result = build_run_response(
                config,
                rows,
                warnings,
                payload.include_heuristics,
                response_status="cancelled" if was_cancelled else "completed",
                include_tlx=bool(payload.include_tlx),
            )

        if was_cancelled:
            _cancel_job(job_id, result)
        else:
            _complete_job(job_id, result)
    except Exception as exc:  # pragma: no cover - server-side safety net
        _fail_job(job_id, exc)
    finally:
        with AUTH_RESUME_LOCK:
            AUTH_RESUME_EVENTS.pop(job_id, None)


def build_config(override: dict[str, Any]) -> dict[str, Any]:
    config = copy.deepcopy(DEFAULT_GENERIC_CONFIG)
    recursive_merge(config, override)
    # Personas may arrive with lever data (and a segment id) but no explicit
    # behavior floats. Fill the legacy 4-float model in so the runner is happy.
    config["personas"] = [normalize_persona(persona) for persona in config.get("personas", [])]
    return config


def _url_needs_interactive_auth(start_url: str) -> bool:
    lower = start_url.lower()
    if "figma.com" in lower:
        return True
    try:
        host = (urlparse(start_url).hostname or "").lower()
    except Exception:
        host = ""
    if not host and ("github.com" in lower or "github.io" in lower):
        return True
    return host == "github.com" or host.endswith(".github.com") or host.endswith(".github.io")


def validate_config(config: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not config["experiment_name"]:
        errors.append("Experiment name is required.")
    if not config["start_url"]:
        errors.append("Start URL is required.")
    else:
        parsed = urlparse(config["start_url"])
        if parsed.scheme not in {"http", "https", "file"}:
            warnings.append("Start URL does not use http, https, or file.")
        if _url_needs_interactive_auth(config["start_url"]):
            browser_conf = config.get("browser") or {}
            if not browser_conf.get("interactive_auth"):
                warnings.append(
                    "This link usually requires you to sign in first. Run from the web app so we "
                    "can open a browser window for one-time login."
                )
    if not config["tasks"]:
        errors.append("Add at least one task.")
    # output_file is optional for API runs (the UI builds the CSV on demand
    # via a Download button). CLI / notebook runs still pass a real path.
    if not config["personas"]:
        errors.append("At least one persona is required.")
    if not config["success_criteria"]["url_contains"] and not config["success_criteria"]["text_contains"]:
        warnings.append("Success criteria are blank; completion quality will be harder to interpret.")
    if int(config["run_timeout_s"]) < 45:
        warnings.append("Run timeout is short and may create false abandonments on slow sites.")
    if not config["task_search_hint"]:
        warnings.append("Search hint is blank; discovery tasks may be less stable.")

    for persona in config["personas"]:
        name = persona.get("name", "").strip() or "<unnamed>"
        for field in ("exploration", "patience", "attention", "error_rate"):
            value = float(persona[field])
            if value < 0 or value > 1:
                errors.append(f"Persona '{name}' has {field} outside the 0-1 range.")

    return errors, warnings


def normalize_output_path(path_value: str) -> str:
    path = Path(path_value)
    if not path.is_absolute():
        path = WORKSPACE_ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return str(path)


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "runs": 0,
            "success_rate": 0.0,
            "avg_steps": 0.0,
            "avg_hesitation": 0.0,
            "avg_misclick": 0.0,
            "avg_backtrack": 0.0,
        }

    completed = sum(row["abandoned"] != "True" for row in rows)
    return {
        "runs": len(rows),
        "success_rate": round(completed / len(rows), 3),
        "avg_steps": round(mean(int(row["steps"]) for row in rows), 2),
        "avg_hesitation": round(mean(int(row["hesitation"]) for row in rows), 2),
        "avg_misclick": round(mean(int(row["misclick"]) for row in rows), 2),
        "avg_backtrack": round(mean(int(row["backtrack"]) for row in rows), 2),
        "error_runs": sum(str(row["nav_path"]).startswith("error:") for row in rows),
    }


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "ai-usability-research",
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"status": "ok", "timestamp": dt.datetime.now().isoformat()}


@app.get("/personas/levers")
def list_levers() -> list[LeverDefinition]:
    """Return the catalog of persona levers (lever id, copy, options).

    Each lever carries a ``group`` id matching one of the entries returned
    from ``GET /personas/lever-groups``. UIs use that to render the editor
    in the same four buckets users already see.
    """
    return [LeverDefinition.model_validate(lever) for lever in LEVER_DEFINITIONS]


@app.get("/personas/lever-groups")
def list_lever_groups() -> list[LeverGroup]:
    """Return the catalog of lever groups.

    The UI uses these to render the persona editor in four buckets
    (Mindset / Pressure / Risk & trust / Context). Each lever carries a
    ``group`` id that points into this list.
    """
    return [LeverGroup.model_validate(group) for group in LEVER_GROUPS]


@app.get("/personas/lobs")
def list_lobs_endpoint() -> list[Lob]:
    """Return the catalog of lines of business (LOBs).

    LOB is the structural axis the Glean prompt expects every segment to live
    under. The frontend uses this to scope the segment dropdown.
    """
    return [Lob.model_validate(lob) for lob in LOBS]


@app.get("/personas/segments")
def list_segments(lob: Optional[str] = None) -> list[SegmentPreset]:
    """Return research-backed segment presets with both lever values and the
    derived behavior floats the runner consumes.

    Pass ``?lob=<lob_id>`` to scope the result to one line of business.
    Returns ``[]`` for a known LOB with no segments yet (e.g. ``b2b_network``,
    ``partner_central``) and for unknown LOB ids.
    """
    from scripts.persona_segments import derive_behavior_floats

    presets = get_segments_for_lob(lob) if lob else SEGMENT_PRESETS

    return [
        SegmentPreset.model_validate(
            {
                **preset,
                "derived_behavior": derive_behavior_floats(preset["levers"]),
            }
        )
        for preset in presets
    ]


@app.post("/validate")
def validate(payload: ConfigPayload) -> dict[str, Any]:
    config = build_config(payload.config)
    errors, warnings = validate_config(config)
    return {
        "errors": errors,
        "warnings": warnings,
        "config_preview": {
            "experiment_name": config["experiment_name"],
            "start_url": config["start_url"],
            "runs_per_persona": config["runs_per_persona"],
            "personas": [persona["name"] for persona in config["personas"]],
            "output_file": config["output_file"],
        },
    }


@app.post("/runs")
def create_run(payload: ConfigPayload) -> dict[str, Any]:
    config = build_config(payload.config)
    errors, warnings = validate_config(config)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors, "warnings": warnings})

    # API runs no longer auto-save the CSV; the UI offers a Download button
    # that builds the CSV from the response in the browser.
    config["output_file"] = ""
    config["capture_screenshots"] = bool(payload.capture_screenshots)
    total_sessions = max(1, len(config["personas"]) * int(config["runs_per_persona"]))
    estimated_total_seconds = estimate_run_duration_seconds(
        config,
        include_heuristics=bool(payload.include_heuristics),
        capture_screenshots=bool(payload.capture_screenshots),
        include_tlx=bool(payload.include_tlx),
    )
    created_at = utcnow_iso()
    job_id = uuid.uuid4().hex
    cancel_event = threading.Event()
    job = {
        "job_id": job_id,
        "status": "queued",
        "warnings": warnings,
        "error": None,
        "result": None,
        "estimated_total_seconds": estimated_total_seconds,
        "_cancel_event": cancel_event,
        "_started_monotonic": None,
        "progress": {
            "phase": "queued",
            "message": "Queued and ready to start.",
            "percent": 0.0,
            "elapsed_seconds": 0,
            "estimated_total_seconds": estimated_total_seconds,
            "estimated_remaining_seconds": estimated_total_seconds,
            "total_sessions": total_sessions,
            "completed_sessions": 0,
            "current_session": 0,
            "current_persona": None,
            "current_run_number": None,
            "started_at": None,
            "updated_at": created_at,
        },
    }

    with RUN_JOBS_LOCK:
        RUN_JOBS[job_id] = job

    thread = threading.Thread(
        target=_run_job,
        args=(job_id, config, warnings, payload),
        daemon=True,
    )
    thread.start()
    return _public_job(job)


@app.get("/runs/{job_id}")
def get_run(job_id: str) -> dict[str, Any]:
    with RUN_JOBS_LOCK:
        job = RUN_JOBS.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        return _public_job(job)


@app.post("/runs/{job_id}/cancel")
def cancel_run(job_id: str) -> dict[str, Any]:
    with RUN_JOBS_LOCK:
        job = RUN_JOBS.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Run not found.")

        if job["status"] in {"completed", "failed", "cancelled"}:
            return _public_job(job)

        cancel_event = job.get("_cancel_event")
        if cancel_event is not None:
            cancel_event.set()

        job["status"] = "cancelling"
        job["progress"] = {
            **job["progress"],
            "phase": "cancelling",
            "message": "Stopping the run after the current step wraps up.",
            "updated_at": utcnow_iso(),
        }
        return _public_job(job)


@app.post("/runs/{job_id}/auth-complete")
def complete_run_auth(job_id: str) -> dict[str, Any]:
    with AUTH_RESUME_LOCK:
        resume_event = AUTH_RESUME_EVENTS.get(job_id)
    if resume_event is None:
        raise HTTPException(
            status_code=404,
            detail="No sign-in window is waiting for this run. It may have already continued.",
        )

    resume_event.set()

    with RUN_JOBS_LOCK:
        job = RUN_JOBS.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        job["progress"] = {
            **job["progress"],
            "phase": "starting",
            "message": "Signed in — saving your session and starting the walkthrough.",
            "updated_at": utcnow_iso(),
        }
        return _public_job(job)


@app.post("/run")
def run(payload: ConfigPayload) -> dict[str, Any]:
    config = build_config(payload.config)
    errors, warnings = validate_config(config)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors, "warnings": warnings})

    # API runs no longer auto-save the CSV; the UI offers a Download button
    # that builds the CSV from the response in the browser.
    config["output_file"] = ""
    config["capture_screenshots"] = bool(payload.capture_screenshots)

    with RUN_LOCK:
        rows = asyncio.run(run_experiment(config))
    return build_run_response(
        config,
        rows,
        warnings,
        payload.include_heuristics,
        include_tlx=bool(payload.include_tlx),
    )


@app.post("/heuristics/review")
def heuristics_review(payload: HeuristicReviewPayload) -> FlowHeuristicReview:
    """Score (or re-score) a flow from raw step artifacts.

    Accepts ``raw_sessions`` shaped like::

        [
          {"persona": "busy_commuter", "artifacts": [<StepArtifact dicts>]},
          ...
        ]
    """
    if not payload.raw_sessions and not payload.sessions:
        raise HTTPException(status_code=400, detail="No sessions supplied.")

    if payload.raw_sessions:
        sessions = [
            (
                str(entry.get("persona", "")),
                list(entry.get("artifacts") or []),
            )
            for entry in payload.raw_sessions
        ]
    else:
        # Re-aggregate already-scored sessions (no rescoring of artifacts).
        from scripts.heuristic_review import aggregate_review

        return FlowHeuristicReview.model_validate(
            aggregate_review([s.model_dump() for s in payload.sessions])
        )

    return FlowHeuristicReview.model_validate(review_flow(sessions))


@app.post("/tlx/review")
def tlx_review(payload: TlxReviewPayload) -> FlowTlxReview:
    """Score Synthetic TLX from raw step artifacts without re-running Playwright."""
    if not payload.raw_sessions:
        raise HTTPException(status_code=400, detail="No sessions supplied.")

    sessions = [
        (
            str(entry.get("persona", "")),
            list(entry.get("artifacts") or []),
        )
        for entry in payload.raw_sessions
    ]
    session_metrics = [
        {
            "steps": entry.get("steps"),
            "hesitation": entry.get("hesitation"),
            "misclick": entry.get("misclick"),
            "backtrack": entry.get("backtrack"),
            "abandoned": entry.get("abandoned"),
            "nav_path": entry.get("nav_path"),
            "status": entry.get("status"),
        }
        for entry in payload.raw_sessions
    ]
    return FlowTlxReview.model_validate(
        review_tlx_flow(
            sessions,
            session_metrics=session_metrics,
            persona_profiles=payload.persona_profiles,
        )
    )


@app.get("/artifacts/{path:path}")
def artifact(path: str) -> FileResponse:
    """Serve a captured screenshot or other artifact under ``output/``.

    Path-traversal-safe: the resolved path must live inside ``output/``.
    """
    candidate = (WORKSPACE_ROOT / path).resolve()
    output_root = (WORKSPACE_ROOT / "output").resolve()
    try:
        candidate.relative_to(output_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Path is outside the output directory.") from exc

    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found.")

    return FileResponse(str(candidate))


@app.post("/stress")
def stress(payload: StressPayload) -> dict[str, Any]:
    with RUN_LOCK:
        raw_path, summary_path = asyncio.run(
            run_stress_benchmark(payload.output_prefix, payload.runs_per_persona)
        )

    summary_rows: list[dict[str, Any]] = []
    with Path(summary_path).open() as handle:
        summary_rows = list(csv.DictReader(handle))

    return {
        "status": "completed",
        "raw_output": str(Path(raw_path).resolve()),
        "summary_output": str(Path(summary_path).resolve()),
        "fixtures": summary_rows,
    }
