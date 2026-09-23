"""Synthetic NASA TLX (workload forecast) from simulated sessions.

Follows the Synthetic TLX pattern: score workload from a human-persona profile
plus active simulation artifacts (steps, notes, outcomes), not from a real
human questionnaire.

Produces Raw TLX-style subscale scores on a 0-100 scale where higher means
more demand / worse load. ``performance`` follows NASA convention: higher
means poorer perceived success. ``overall`` is the unweighted mean of the six
subscales (classic Raw TLX average).

The MVP is rule-based so it stays deterministic and cheap. Shape matches what
an LLM-augmented version could emit later.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable, Mapping, Optional

from scripts.heuristic_signals import (
    NOTE_BACKTRACK,
    NOTE_HESITATION,
    NOTE_LOOP_TO_PRIOR,
    NOTE_MISCLICK,
    NOTE_NO_CHANGE,
    NOTE_STEP_ERROR,
)

SUBSCALES: list[dict[str, str]] = [
    {
        "id": "mental_demand",
        "name": "Mental demand",
        "prompt": "How much thinking, deciding, or remembering did this flow seem to require?",
    },
    {
        "id": "physical_demand",
        "name": "Physical demand",
        "prompt": "How much clicking, typing, or repetitive interaction did this flow require?",
    },
    {
        "id": "temporal_demand",
        "name": "Temporal demand",
        "prompt": "How time-pressured or rushed did the walkthrough feel?",
    },
    {
        "id": "performance",
        "name": "Performance",
        "prompt": "How unsuccessful did the walker seem at completing the task? (Higher is worse.)",
    },
    {
        "id": "effort",
        "name": "Effort",
        "prompt": "How hard did the walker have to work to get through the flow?",
    },
    {
        "id": "frustration",
        "name": "Frustration",
        "prompt": "How irritating, confusing, or discouraging did the flow feel?",
    },
]

SUBSCALE_IDS = [item["id"] for item in SUBSCALES]


def _clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    return max(lower, min(upper, value))


def _round_score(value: float) -> int:
    return int(round(_clamp(value)))


def _confidence(num_steps: int) -> float:
    if num_steps <= 0:
        return 0.3
    return round(min(0.9, 0.35 + 0.03 * num_steps), 2)


def _count_notes(artifacts: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for artifact in artifacts:
        for note in artifact.get("notes") or []:
            counts[str(note)] += 1
    return dict(counts)


def _session_status(artifacts: list[dict[str, Any]], metrics: Mapping[str, Any]) -> str:
    status = str(metrics.get("status") or "").strip().lower()
    if status in {"completed", "abandoned", "error"}:
        return status
    if metrics.get("abandoned") in {True, "true", "True", 1, "1"}:
        return "abandoned"
    nav_path = str(metrics.get("nav_path") or "")
    if nav_path.startswith("error:"):
        return "error"
    if artifacts:
        last_status = str(artifacts[-1].get("status") or "").strip().lower()
        if last_status in {"completed", "abandoned", "error"}:
            return last_status
    return "completed"


def _persona_modifiers(persona_profile: Optional[Mapping[str, Any]]) -> dict[str, float]:
    """Map legacy behavior floats into mild TLX biases.

    Low patience / attention and high error_rate nudge scores upward so the
    persona still shapes the forecast without dominating artifact evidence.
    """
    if not persona_profile:
        return {
            "mental": 0.0,
            "physical": 0.0,
            "temporal": 0.0,
            "performance": 0.0,
            "effort": 0.0,
            "frustration": 0.0,
        }

    def _f(key: str, default: float) -> float:
        try:
            return float(persona_profile.get(key, default))
        except (TypeError, ValueError):
            return default

    patience = _clamp(_f("patience", 0.5), 0.0, 1.0)
    attention = _clamp(_f("attention", 0.5), 0.0, 1.0)
    exploration = _clamp(_f("exploration", 0.5), 0.0, 1.0)
    error_rate = _clamp(_f("error_rate", 0.1), 0.0, 1.0)

    return {
        "mental": (1.0 - attention) * 12.0 + exploration * 4.0,
        "physical": exploration * 6.0,
        "temporal": (1.0 - patience) * 16.0,
        "performance": error_rate * 10.0 + (1.0 - patience) * 4.0,
        "effort": (1.0 - patience) * 8.0 + (1.0 - attention) * 6.0,
        "frustration": error_rate * 14.0 + (1.0 - patience) * 6.0,
    }


def _rationale(subscale_id: str, score: int, drivers: list[str]) -> str:
    if not drivers:
        bases = {
            "mental_demand": "Little extra thinking load showed up in this walkthrough.",
            "physical_demand": "Interaction looked light for a desktop walkthrough.",
            "temporal_demand": "The pace looked steady with little time pressure.",
            "performance": "The walker looked successful on this try.",
            "effort": "The walker did not appear to work especially hard.",
            "frustration": "Frustration signals stayed low.",
        }
        return bases.get(subscale_id, "No strong workload signals.")
    joined = "; ".join(drivers[:3])
    return f"Score {score}/100. Driven by: {joined}."


def score_session(
    persona: str,
    artifacts: list[dict[str, Any]],
    session_metrics: Optional[Mapping[str, Any]] = None,
    persona_profile: Optional[Mapping[str, Any]] = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """Forecast NASA TLX subscales for one persona session."""

    metrics = dict(session_metrics or {})
    notes = _count_notes(artifacts)
    steps = int(metrics.get("steps") or len(artifacts) or 0)
    hesitation = int(metrics.get("hesitation") or notes.get(NOTE_HESITATION, 0) or 0)
    misclick = int(metrics.get("misclick") or notes.get(NOTE_MISCLICK, 0) or 0)
    backtrack = int(
        metrics.get("backtrack")
        or (notes.get(NOTE_BACKTRACK, 0) + notes.get(NOTE_LOOP_TO_PRIOR, 0))
        or 0
    )
    status = _session_status(artifacts, metrics)
    distinct_urls = {
        str(artifact.get("url") or "")
        for artifact in artifacts
        if artifact.get("url")
    }
    type_actions = sum(
        1
        for artifact in artifacts
        if str(artifact.get("action") or "").startswith("type[")
    )
    click_actions = sum(
        1
        for artifact in artifacts
        if str(artifact.get("action") or "").startswith("click[")
    )
    step_errors = notes.get(NOTE_STEP_ERROR, 0)
    no_change = notes.get(NOTE_NO_CHANGE, 0)
    mods = _persona_modifiers(persona_profile)
    confidence = _confidence(steps)

    # Mental demand: memory load, hesitation, opaque feedback.
    mental_drivers: list[str] = []
    mental = 18.0 + mods["mental"]
    mental += min(28.0, hesitation * 7.0)
    mental += min(18.0, max(0, steps - 8) * 1.5)
    mental += min(16.0, max(0, len(distinct_urls) - 3) * 3.5)
    mental += min(12.0, no_change * 4.0)
    if hesitation:
        mental_drivers.append(f"{hesitation} hesitation pause{'s' if hesitation != 1 else ''}")
    if len(distinct_urls) >= 4:
        mental_drivers.append(f"{len(distinct_urls)} pages to keep track of")
    if no_change:
        mental_drivers.append("actions with no clear feedback")
    if steps >= 12:
        mental_drivers.append(f"long path ({steps} steps)")

    # Physical demand: mostly light on desktop; rises with clicks/typing/misclicks.
    physical_drivers: list[str] = []
    physical = 8.0 + mods["physical"]
    physical += min(30.0, click_actions * 1.2)
    physical += min(20.0, type_actions * 3.0)
    physical += min(16.0, misclick * 4.0)
    if click_actions >= 8:
        physical_drivers.append(f"{click_actions} clicks")
    if type_actions:
        physical_drivers.append(f"{type_actions} form fill{'s' if type_actions != 1 else ''}")
    if misclick:
        physical_drivers.append(f"{misclick} misclick{'s' if misclick != 1 else ''}")
    if not physical_drivers:
        physical_drivers.append("light desktop interaction")

    # Temporal demand: abandonment, loops, low patience personas, dense steps.
    temporal_drivers: list[str] = []
    temporal = 16.0 + mods["temporal"]
    temporal += min(22.0, backtrack * 6.0)
    temporal += min(18.0, hesitation * 3.0)
    if status == "abandoned":
        temporal += 22.0
        temporal_drivers.append("session timed out or was abandoned")
    elif status == "error":
        temporal += 12.0
        temporal_drivers.append("session ended in an error")
    if backtrack:
        temporal_drivers.append(f"{backtrack} backtrack{'s' if backtrack != 1 else ''}")
    if mods["temporal"] >= 8:
        temporal_drivers.append("persona tends to feel time pressure")

    # Performance: NASA-style (higher = worse success).
    performance_drivers: list[str] = []
    performance = 12.0 + mods["performance"]
    if status == "completed":
        performance += min(18.0, (hesitation + misclick + backtrack) * 2.5)
        if hesitation + misclick + backtrack == 0:
            performance_drivers.append("completed cleanly")
        else:
            performance_drivers.append("completed, but with friction along the way")
    elif status == "abandoned":
        performance += 55.0
        performance_drivers.append("did not finish the task")
    else:
        performance += 70.0
        performance_drivers.append("ended in an error state")
    performance += min(20.0, step_errors * 10.0)
    if step_errors:
        performance_drivers.append(f"{step_errors} failed step{'s' if step_errors != 1 else ''}")

    # Effort: work invested regardless of outcome.
    effort_drivers: list[str] = []
    effort = 20.0 + mods["effort"]
    effort += min(30.0, max(0, steps - 5) * 2.0)
    effort += min(20.0, (hesitation + backtrack) * 4.0)
    effort += min(12.0, misclick * 3.0)
    if status in {"abandoned", "error"}:
        effort += 10.0
    if steps:
        effort_drivers.append(f"{steps} step{'s' if steps != 1 else ''}")
    if hesitation or backtrack:
        effort_drivers.append("extra work from pauses and course-corrections")
    if status in {"abandoned", "error"}:
        effort_drivers.append("unfinished session still burned effort")

    # Frustration: errors, loops, opaque UI, abandonment.
    frustration_drivers: list[str] = []
    frustration = 10.0 + mods["frustration"]
    frustration += min(24.0, misclick * 6.0)
    frustration += min(20.0, backtrack * 5.0)
    frustration += min(18.0, step_errors * 9.0)
    frustration += min(12.0, no_change * 4.0)
    if status == "abandoned":
        frustration += 28.0
        frustration_drivers.append("gave up before finishing")
    elif status == "error":
        frustration += 32.0
        frustration_drivers.append("hard stop on an error")
    if misclick:
        frustration_drivers.append(f"{misclick} wrong click{'s' if misclick != 1 else ''}")
    if notes.get(NOTE_LOOP_TO_PRIOR, 0):
        frustration += 10.0
        frustration_drivers.append("looped back to a prior page")
    if no_change:
        frustration_drivers.append("unclear feedback after clicks")

    scored = {
        "mental_demand": (_round_score(mental), mental_drivers),
        "physical_demand": (_round_score(physical), physical_drivers),
        "temporal_demand": (_round_score(temporal), temporal_drivers),
        "performance": (_round_score(performance), performance_drivers),
        "effort": (_round_score(effort), effort_drivers),
        "frustration": (_round_score(frustration), frustration_drivers),
    }

    subscales: list[dict[str, Any]] = []
    for meta in SUBSCALES:
        sid = meta["id"]
        value, drivers = scored[sid]
        subscales.append(
            {
                "id": sid,
                "name": meta["name"],
                "score": value,
                "rationale": _rationale(sid, value, drivers),
            }
        )

    overall = round(sum(item["score"] for item in subscales) / len(subscales), 1)

    return {
        "session_id": session_id or persona,
        "persona": persona,
        "overall": overall,
        "confidence": confidence,
        "subscales": subscales,
        "mental_demand": scored["mental_demand"][0],
        "physical_demand": scored["physical_demand"][0],
        "temporal_demand": scored["temporal_demand"][0],
        "performance": scored["performance"][0],
        "effort": scored["effort"][0],
        "frustration": scored["frustration"][0],
    }


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def aggregate_review(session_reviews: list[dict[str, Any]]) -> dict[str, Any]:
    """Roll session TLX forecasts into flow-level + per-persona aggregates."""

    if not session_reviews:
        return {
            "overall": None,
            "confidence": None,
            "disclaimer": (
                "Directional agent workload forecast (Synthetic TLX). "
                "Not a human NASA TLX questionnaire."
            ),
            "subscales": [],
            "session_reviews": [],
            "persona_reviews": [],
        }

    subscale_bucket: dict[str, list[float]] = defaultdict(list)
    for review in session_reviews:
        for subscale in review.get("subscales") or []:
            subscale_bucket[subscale["id"]].append(float(subscale["score"]))

    aggregate_subscales: list[dict[str, Any]] = []
    for meta in SUBSCALES:
        sid = meta["id"]
        values = subscale_bucket.get(sid, [])
        if not values:
            continue
        avg = round(_mean(values), 1)
        aggregate_subscales.append(
            {
                "id": sid,
                "name": meta["name"],
                "score": avg,
                "rationale": (
                    f"Average {avg}/100 across {len(values)} session"
                    f"{'' if len(values) == 1 else 's'}."
                ),
            }
        )

    overall = (
        round(_mean([s["score"] for s in aggregate_subscales]), 1)
        if aggregate_subscales
        else None
    )
    confidence = round(_mean([float(r.get("confidence") or 0.3) for r in session_reviews]), 2)

    # Per-persona roll-up (mean across that persona's sessions).
    by_persona: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for review in session_reviews:
        by_persona[str(review.get("persona") or "persona")].append(review)

    persona_reviews: list[dict[str, Any]] = []
    for persona, reviews in by_persona.items():
        persona_subs: list[dict[str, Any]] = []
        for meta in SUBSCALES:
            sid = meta["id"]
            values = [
                float(s["score"])
                for review in reviews
                for s in (review.get("subscales") or [])
                if s.get("id") == sid
            ]
            if not values:
                continue
            avg = round(_mean(values), 1)
            persona_subs.append(
                {
                    "id": sid,
                    "name": meta["name"],
                    "score": avg,
                    "rationale": (
                        f"Average {avg}/100 for {persona} across {len(values)} session"
                        f"{'' if len(values) == 1 else 's'}."
                    ),
                }
            )
        persona_overall = (
            round(_mean([s["score"] for s in persona_subs]), 1) if persona_subs else None
        )
        persona_reviews.append(
            {
                "persona": persona,
                "overall": persona_overall,
                "confidence": round(
                    _mean([float(r.get("confidence") or 0.3) for r in reviews]), 2
                ),
                "subscales": persona_subs,
                "session_count": len(reviews),
            }
        )

    persona_reviews.sort(key=lambda item: (-(item["overall"] or 0), item["persona"]))

    return {
        "overall": overall,
        "confidence": confidence,
        "disclaimer": (
            "Directional agent workload forecast (Synthetic TLX). "
            "Not a human NASA TLX questionnaire."
        ),
        "subscales": aggregate_subscales,
        "session_reviews": session_reviews,
        "persona_reviews": persona_reviews,
    }


def review_flow(
    sessions: Iterable[tuple[str, list[dict[str, Any]]]],
    session_metrics: Optional[Iterable[Optional[Mapping[str, Any]]]] = None,
    persona_profiles: Optional[Mapping[str, Mapping[str, Any]]] = None,
) -> dict[str, Any]:
    """High-level entry point for a multi-persona flow.

    ``sessions`` is an iterable of ``(persona, artifacts)`` tuples.
    Optional ``session_metrics`` aligns 1:1 with sessions (steps, hesitation, …).
    Optional ``persona_profiles`` maps persona name -> behavior floats.
    """
    metrics_list = list(session_metrics) if session_metrics is not None else None
    profiles = persona_profiles or {}
    session_reviews: list[dict[str, Any]] = []

    for index, (persona, artifacts) in enumerate(sessions):
        metrics = None
        if metrics_list is not None and index < len(metrics_list):
            metrics = metrics_list[index]
        session_reviews.append(
            score_session(
                persona,
                artifacts,
                session_metrics=metrics,
                persona_profile=profiles.get(persona),
                session_id=f"{persona}_{index + 1}",
            )
        )
    return aggregate_review(session_reviews)
