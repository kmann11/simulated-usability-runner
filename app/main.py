from __future__ import annotations

import asyncio
import copy
import csv
import datetime as dt
import sys
import threading
from pathlib import Path
from statistics import mean
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.generic_usability_runner import (  # noqa: E402
    DEFAULT_GENERIC_CONFIG,
    recursive_merge,
    run_experiment,
)
from scripts.generic_usability_stress import run_stress_benchmark  # noqa: E402

RUN_LOCK = threading.Lock()

app = FastAPI(
    title="AI Usability Research App",
    version="0.1.0",
    description="Minimal API wrapper for the generic Playwright usability runner.",
)


class ConfigPayload(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)


class StressPayload(BaseModel):
    output_prefix: str = "generic_usability_benchmark"
    runs_per_persona: int = 1


def build_config(override: dict[str, Any]) -> dict[str, Any]:
    config = copy.deepcopy(DEFAULT_GENERIC_CONFIG)
    recursive_merge(config, override)
    return config


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
    if not config["tasks"]:
        errors.append("Add at least one task.")
    if not config["output_file"]:
        errors.append("Output CSV path is required.")
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


@app.post("/run")
def run(payload: ConfigPayload) -> dict[str, Any]:
    config = build_config(payload.config)
    errors, warnings = validate_config(config)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors, "warnings": warnings})

    config["output_file"] = normalize_output_path(config["output_file"])
    with RUN_LOCK:
        rows = asyncio.run(run_experiment(config))

    return {
        "status": "completed",
        "warnings": warnings,
        "output_file": config["output_file"],
        "summary": summarize_rows(rows),
    }


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
