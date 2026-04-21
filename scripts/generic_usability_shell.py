from __future__ import annotations

import copy
import csv
import html
import importlib.util
import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from statistics import mean
from typing import Any
from urllib.parse import urlparse

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.generic_usability_runner import DEFAULT_GENERIC_CONFIG, load_config

TEXT_WIDTH = "840px"
HALF_WIDTH = "410px"


def default_generic_config() -> dict[str, Any]:
    return copy.deepcopy(DEFAULT_GENERIC_CONFIG)


def save_generic_config(config: dict[str, Any], output_path: str | Path) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))
    return path


def _safe_mean(values: list[int | float]) -> float:
    return mean(values) if values else 0.0


def summarize_results_csv(results_path: str | Path) -> dict[str, Any] | None:
    path = Path(results_path)
    if not path.exists():
        return None

    with path.open() as handle:
        rows = list(csv.DictReader(handle))

    if not rows:
        return None

    overall = {
        "runs": len(rows),
        "completed_runs": sum(row["abandoned"] != "True" for row in rows),
        "abandoned_runs": sum(row["abandoned"] == "True" for row in rows),
        "error_runs": sum(str(row["nav_path"]).startswith("error:") for row in rows),
        "avg_steps": round(_safe_mean([int(row["steps"]) for row in rows]), 2),
        "avg_hesitation": round(_safe_mean([int(row["hesitation"]) for row in rows]), 2),
        "avg_misclick": round(_safe_mean([int(row["misclick"]) for row in rows]), 2),
        "avg_backtrack": round(_safe_mean([int(row["backtrack"]) for row in rows]), 2),
    }
    overall["success_rate"] = round(overall["completed_runs"] / overall["runs"], 3)

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["persona"], []).append(row)

    by_persona: list[dict[str, Any]] = []
    for persona, persona_rows in grouped.items():
        completed = sum(row["abandoned"] != "True" for row in persona_rows)
        by_persona.append(
            {
                "persona": persona,
                "runs": len(persona_rows),
                "success_rate": round(completed / len(persona_rows), 3),
                "avg_steps": round(_safe_mean([int(row["steps"]) for row in persona_rows]), 2),
                "avg_hesitation": round(_safe_mean([int(row["hesitation"]) for row in persona_rows]), 2),
                "avg_misclick": round(_safe_mean([int(row["misclick"]) for row in persona_rows]), 2),
                "avg_backtrack": round(_safe_mean([int(row["backtrack"]) for row in persona_rows]), 2),
            }
        )

    by_persona.sort(key=lambda row: row["persona"])
    return {"path": path, "overall": overall, "by_persona": by_persona}


def _table_html(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "<p>No rows available.</p>"

    headers = list(rows[0].keys())
    header_cells = "".join(
        f"<th style='text-align:left;padding:6px 8px;border-bottom:1px solid #d9d9d9'>{html.escape(str(header))}</th>"
        for header in headers
    )
    body_rows = []
    for row in rows:
        cells = "".join(
            f"<td style='padding:6px 8px;border-bottom:1px solid #efefef'>{html.escape(str(row.get(header, '')))}</td>"
            for header in headers
        )
        body_rows.append(f"<tr>{cells}</tr>")
    return (
        "<table style='border-collapse:collapse;width:100%;font-size:13px'>"
        f"<thead><tr>{header_cells}</tr></thead>"
        f"<tbody>{''.join(body_rows)}</tbody></table>"
    )


class GenericUsabilityShellApp:
    def __init__(self, output_config_path: str | Path) -> None:
        try:
            import ipywidgets as widgets
            from IPython.display import display
        except ImportError as exc:  # pragma: no cover - notebook environment dependent
            raise ImportError(
                "ipywidgets is required for the generic form. Install it in the JupyterHub environment."
            ) from exc

        self.widgets = widgets
        self.display = display
        self.default_output_config_path = Path(output_config_path)
        self.persona_controls: list[dict[str, Any]] = []
        self.command_thread: threading.Thread | None = None
        self.command_running = False
        self.log_lines: list[str] = []
        self.config = default_generic_config()
        self._build_widgets()
        self.apply_config(self.config)
        self.preview_json.value = json.dumps(self.build_config(), indent=2)
        self._refresh_study_meta()
        self._set_results_html("<p>No run has been executed yet.</p>")

    def _build_widgets(self) -> None:
        widgets = self.widgets

        self.config_path = widgets.Text(
            value=str(self.default_output_config_path),
            description="Config Path",
            layout=widgets.Layout(width=TEXT_WIDTH),
        )
        self.experiment_name = widgets.Text(description="Experiment", layout=widgets.Layout(width=TEXT_WIDTH))
        self.start_url = widgets.Text(description="Start URL", layout=widgets.Layout(width=TEXT_WIDTH))
        self.output_file = widgets.Text(description="Output CSV", layout=widgets.Layout(width=TEXT_WIDTH))
        self.tasks = widgets.Textarea(
            description="Tasks",
            layout=widgets.Layout(width=TEXT_WIDTH, height="150px"),
        )
        self.task_search_hint = widgets.Text(description="Search Hint", layout=widgets.Layout(width=TEXT_WIDTH))

        self.success_url_tokens = widgets.Textarea(
            description="Success URL",
            layout=widgets.Layout(width=TEXT_WIDTH, height="100px"),
        )
        self.success_text_tokens = widgets.Textarea(
            description="Success Text",
            layout=widgets.Layout(width=TEXT_WIDTH, height="100px"),
        )
        self.prefer_labels = widgets.Textarea(
            description="Prefer Labels",
            layout=widgets.Layout(width=TEXT_WIDTH, height="110px"),
        )
        self.avoid_labels = widgets.Textarea(
            description="Avoid Labels",
            layout=widgets.Layout(width=TEXT_WIDTH, height="130px"),
        )

        self.runs_per_persona = widgets.IntSlider(
            value=4,
            min=1,
            max=12,
            step=1,
            description="Runs",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.max_steps = widgets.IntSlider(
            value=25,
            min=5,
            max=80,
            step=1,
            description="Max Steps",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.click_timeout_ms = widgets.IntSlider(
            value=5000,
            min=1000,
            max=20000,
            step=500,
            description="Click ms",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.run_timeout_s = widgets.IntSlider(
            value=120,
            min=30,
            max=300,
            step=5,
            description="Run Timeout",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.sleep_scale = widgets.FloatSlider(
            value=0.6,
            min=0.1,
            max=1.5,
            step=0.05,
            description="Sleep Scale",
            readout_format=".2f",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.hydrate_timeout_ms = widgets.IntSlider(
            value=45000,
            min=5000,
            max=120000,
            step=5000,
            description="Hydrate ms",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.model = widgets.Text(description="Model", layout=widgets.Layout(width=HALF_WIDTH))
        self.random_seed = widgets.Text(description="Seed", layout=widgets.Layout(width=HALF_WIDTH))
        self.observation_char_limit = widgets.IntSlider(
            value=2500,
            min=500,
            max=6000,
            step=100,
            description="Obs chars",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.click_candidates = widgets.IntSlider(
            value=12,
            min=3,
            max=30,
            step=1,
            description="Click cand",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.input_candidates = widgets.IntSlider(
            value=8,
            min=1,
            max=20,
            step=1,
            description="Input cand",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.select_candidates = widgets.IntSlider(
            value=4,
            min=1,
            max=12,
            step=1,
            description="Select cand",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )

        self.full_name = widgets.Text(description="Full Name", layout=widgets.Layout(width=HALF_WIDTH))
        self.first_name = widgets.Text(description="First", layout=widgets.Layout(width=HALF_WIDTH))
        self.last_name = widgets.Text(description="Last", layout=widgets.Layout(width=HALF_WIDTH))
        self.email = widgets.Text(description="Email", layout=widgets.Layout(width=HALF_WIDTH))
        self.phone = widgets.Text(description="Phone", layout=widgets.Layout(width=HALF_WIDTH))
        self.address1 = widgets.Text(description="Address 1", layout=widgets.Layout(width=HALF_WIDTH))
        self.address2 = widgets.Text(description="Address 2", layout=widgets.Layout(width=HALF_WIDTH))
        self.city = widgets.Text(description="City", layout=widgets.Layout(width=HALF_WIDTH))
        self.state = widgets.Text(description="State", layout=widgets.Layout(width=HALF_WIDTH))
        self.postal_code = widgets.Text(description="Postal", layout=widgets.Layout(width=HALF_WIDTH))
        self.notes = widgets.Text(description="Notes", layout=widgets.Layout(width=TEXT_WIDTH))

        self.stress_output_prefix = widgets.Text(
            value="generic_usability_smoke",
            description="Stress Prefix",
            layout=widgets.Layout(width=HALF_WIDTH),
        )
        self.stress_runs_per_persona = widgets.IntSlider(
            value=1,
            min=1,
            max=5,
            step=1,
            description="Stress Runs",
            continuous_update=False,
            layout=widgets.Layout(width=HALF_WIDTH),
        )

        self.load_button = widgets.Button(description="Load Config")
        self.save_button = widgets.Button(description="Save Config", button_style="success")
        self.preview_button = widgets.Button(description="Preview JSON", button_style="info")
        self.reset_button = widgets.Button(description="Reset Defaults")
        self.add_persona_button = widgets.Button(description="Add Persona")
        self.validate_button = widgets.Button(description="Validate Setup", button_style="warning")
        self.check_env_button = widgets.Button(description="Check Environment")
        self.install_chromium_button = widgets.Button(description="Install Chromium")
        self.run_button = widgets.Button(description="Run Experiment", button_style="success")
        self.stress_button = widgets.Button(description="Run Stress Test", button_style="primary")

        self.study_meta = widgets.HTML()
        self.status_html = widgets.HTML(value="<p>Ready.</p>")
        self.validation_html = widgets.HTML(value="<p>No validation run yet.</p>")
        self.environment_html = widgets.HTML(value="<p>No environment check run yet.</p>")
        self.results_html = widgets.HTML()
        self.preview_json = widgets.Textarea(
            disabled=True,
            layout=widgets.Layout(width=TEXT_WIDTH, height="260px"),
        )
        self.run_log = widgets.Textarea(
            disabled=True,
            layout=widgets.Layout(width=TEXT_WIDTH, height="280px"),
        )

        self.personas_box = widgets.Box(
            layout=widgets.Layout(display="flex", flex_flow="row wrap", gap="12px", width=TEXT_WIDTH)
        )

        for widget in [self.runs_per_persona, self.max_steps, self.run_timeout_s, self.sleep_scale]:
            widget.observe(self._on_meta_change, names="value")

        self.load_button.on_click(self._load_clicked)
        self.save_button.on_click(self._save_clicked)
        self.preview_button.on_click(self._preview_clicked)
        self.reset_button.on_click(self._reset_clicked)
        self.add_persona_button.on_click(self._add_persona_clicked)
        self.validate_button.on_click(self._validate_clicked)
        self.check_env_button.on_click(self._check_environment_clicked)
        self.install_chromium_button.on_click(self._install_chromium_clicked)
        self.run_button.on_click(self._run_experiment_clicked)
        self.stress_button.on_click(self._run_stress_clicked)

        study_tab = widgets.VBox(
            [
                self.study_meta,
                self.experiment_name,
                self.start_url,
                self.output_file,
                self.tasks,
                self.task_search_hint,
                widgets.HBox([self.runs_per_persona, self.max_steps]),
            ]
        )
        success_tab = widgets.VBox(
            [
                widgets.HTML("<p>Use success criteria and label hints to make the agent legible and targeted.</p>"),
                self.success_url_tokens,
                self.success_text_tokens,
                self.prefer_labels,
                self.avoid_labels,
            ]
        )
        test_data_tab = widgets.VBox(
            [
                widgets.HBox([self.full_name, self.email]),
                widgets.HBox([self.first_name, self.last_name]),
                widgets.HBox([self.phone, self.postal_code]),
                widgets.HBox([self.address1, self.address2]),
                widgets.HBox([self.city, self.state]),
                self.notes,
            ]
        )
        personas_tab = widgets.VBox(
            [
                widgets.HTML("<p>Persona values stay on a 0 to 1 scale. Add cards as needed for your study.</p>"),
                self.add_persona_button,
                self.personas_box,
            ]
        )
        advanced_tab = widgets.VBox(
            [
                widgets.HBox([self.click_timeout_ms, self.run_timeout_s]),
                widgets.HBox([self.sleep_scale, self.hydrate_timeout_ms]),
                widgets.HBox([self.model, self.random_seed]),
                widgets.HBox([self.observation_char_limit, self.click_candidates]),
                widgets.HBox([self.input_candidates, self.select_candidates]),
            ]
        )
        run_tab = widgets.VBox(
            [
                self.status_html,
                widgets.HBox(
                    [
                        self.validate_button,
                        self.check_env_button,
                        self.install_chromium_button,
                        self.run_button,
                        self.stress_button,
                    ]
                ),
                widgets.HBox([self.stress_output_prefix, self.stress_runs_per_persona]),
                widgets.HTML("<b>Validation</b>"),
                self.validation_html,
                widgets.HTML("<b>Environment</b>"),
                self.environment_html,
                widgets.HTML("<b>Run Log</b>"),
                self.run_log,
                widgets.HTML("<b>Results</b>"),
                self.results_html,
            ]
        )

        self.tabs = widgets.Tab(children=[study_tab, success_tab, test_data_tab, personas_tab, advanced_tab, run_tab])
        for index, title in enumerate(["Study", "Success", "Test Data", "Personas", "Advanced", "Run"]):
            self.tabs.set_title(index, title)

        self.ui = widgets.VBox(
            [
                widgets.HTML(
                    "<h2>Generic Website Usability Shell</h2>"
                    "<p>Configure a website study, validate the setup, then save or run it directly from Jupyter.</p>"
                ),
                self.config_path,
                widgets.HBox([self.load_button, self.save_button, self.preview_button, self.reset_button]),
                self.tabs,
                widgets.HTML("<b>Config Preview</b>"),
                self.preview_json,
            ]
        )

    def show(self) -> Any:
        self.display(self.ui)
        return self.ui

    def _resolve_path(self, value: str | Path) -> Path:
        path = Path(value)
        if path.is_absolute():
            return path
        return WORKSPACE_ROOT / path

    def _command_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONPYCACHEPREFIX"] = str(WORKSPACE_ROOT / ".pycache")
        return env

    def _lines(self, value: str) -> list[str]:
        return [line.strip() for line in value.splitlines() if line.strip()]

    def _set_lines(self, widget, values: list[str]) -> None:
        widget.value = "\n".join(values)

    def _parse_seed(self, value: str) -> int | None:
        text = value.strip()
        if not text:
            return None
        return int(text)

    def _persona_template(self, index: int) -> dict[str, Any]:
        return {
            "name": f"persona_{index}",
            "exploration": 0.5,
            "patience": 0.5,
            "attention": 0.5,
            "error_rate": 0.3,
        }

    def _build_persona_controls(self, persona: dict[str, Any]) -> dict[str, Any]:
        widgets = self.widgets
        controls: dict[str, Any] = {}

        name = widgets.Text(value=persona["name"], description="Name", layout=widgets.Layout(width="290px"))
        exploration = widgets.FloatSlider(
            value=persona["exploration"],
            min=0,
            max=1,
            step=0.05,
            description="Explore",
            readout_format=".2f",
            continuous_update=False,
            layout=widgets.Layout(width="300px"),
        )
        patience = widgets.FloatSlider(
            value=persona["patience"],
            min=0,
            max=1,
            step=0.05,
            description="Patience",
            readout_format=".2f",
            continuous_update=False,
            layout=widgets.Layout(width="300px"),
        )
        attention = widgets.FloatSlider(
            value=persona["attention"],
            min=0,
            max=1,
            step=0.05,
            description="Attention",
            readout_format=".2f",
            continuous_update=False,
            layout=widgets.Layout(width="300px"),
        )
        error_rate = widgets.FloatSlider(
            value=persona["error_rate"],
            min=0,
            max=1,
            step=0.05,
            description="Error Rate",
            readout_format=".2f",
            continuous_update=False,
            layout=widgets.Layout(width="300px"),
        )
        remove_button = widgets.Button(description="Remove", button_style="danger", layout=widgets.Layout(width="90px"))

        controls.update(
            {
                "name": name,
                "exploration": exploration,
                "patience": patience,
                "attention": attention,
                "error_rate": error_rate,
                "remove_button": remove_button,
            }
        )

        def remove_clicked(_button) -> None:
            self.persona_controls = [item for item in self.persona_controls if item is not controls]
            self._render_personas()
            self._refresh_study_meta()

        remove_button.on_click(remove_clicked)
        name.observe(self._on_meta_change, names="value")

        card = widgets.VBox(
            [
                widgets.HBox([widgets.HTML("<b>Persona</b>"), remove_button]),
                name,
                exploration,
                patience,
                attention,
                error_rate,
            ],
            layout=widgets.Layout(border="1px solid #d9d9d9", padding="10px", width="330px"),
        )
        controls["card"] = card
        return controls

    def _render_personas(self) -> None:
        self.personas_box.children = tuple(control["card"] for control in self.persona_controls)

    def _refresh_study_meta(self) -> None:
        total_personas = len([control for control in self.persona_controls if control["name"].value.strip()])
        total_runs = total_personas * int(self.runs_per_persona.value)
        low_minutes, high_minutes = self.estimate_runtime_minutes(total_personas)
        model_mode = "GPT-backed" if os.getenv("OPENAI_API_KEY") else "Fallback policy"
        self.study_meta.value = (
            "<div style='padding:10px;border:1px solid #e5e5e5;background:#fafafa'>"
            f"<b>Participants:</b> {total_runs} "
            f"&nbsp; <b>Personas:</b> {total_personas} "
            f"&nbsp; <b>Estimated batch time:</b> {low_minutes:.1f}-{high_minutes:.1f} min "
            f"&nbsp; <b>Decision mode:</b> {model_mode}"
            "</div>"
        )

    def estimate_runtime_minutes(self, total_personas: int | None = None) -> tuple[float, float]:
        persona_count = total_personas if total_personas is not None else len(self.persona_controls)
        total_runs = persona_count * int(self.runs_per_persona.value)
        per_run_low = 5 + int(self.max_steps.value) * 0.22 * float(self.sleep_scale.value)
        per_run_high = min(float(self.run_timeout_s.value), 10 + int(self.max_steps.value) * 0.85 * float(self.sleep_scale.value))
        return (total_runs * per_run_low) / 60, (total_runs * per_run_high) / 60

    def apply_config(self, config: dict[str, Any]) -> None:
        merged = default_generic_config()
        merged.update(
            {
                key: value
                for key, value in config.items()
                if key not in {"success_criteria", "site_hints", "test_data", "candidate_limits", "personas"}
            }
        )
        for key in ("success_criteria", "site_hints", "test_data", "candidate_limits"):
            merged[key].update(config.get(key, {}))
        merged["personas"] = copy.deepcopy(config.get("personas", merged["personas"]))
        self.config = merged

        self.experiment_name.value = merged["experiment_name"]
        self.start_url.value = merged["start_url"]
        self.output_file.value = merged["output_file"]
        self.tasks.value = "\n".join(merged["tasks"])
        self.task_search_hint.value = merged.get("task_search_hint", "")
        self._set_lines(self.success_url_tokens, merged["success_criteria"]["url_contains"])
        self._set_lines(self.success_text_tokens, merged["success_criteria"]["text_contains"])
        self._set_lines(self.prefer_labels, merged["site_hints"]["prefer_labels"])
        self._set_lines(self.avoid_labels, merged["site_hints"]["avoid_labels"])

        self.runs_per_persona.value = int(merged["runs_per_persona"])
        self.max_steps.value = int(merged["max_steps"])
        self.click_timeout_ms.value = int(merged["click_timeout_ms"])
        self.run_timeout_s.value = int(merged["run_timeout_s"])
        self.sleep_scale.value = float(merged["sleep_scale"])
        self.hydrate_timeout_ms.value = int(merged["hydrate_timeout_ms"])
        self.model.value = merged["model"]
        self.random_seed.value = "" if merged.get("random_seed") is None else str(merged["random_seed"])
        self.observation_char_limit.value = int(merged["observation_char_limit"])
        self.click_candidates.value = int(merged["candidate_limits"]["click"])
        self.input_candidates.value = int(merged["candidate_limits"]["input"])
        self.select_candidates.value = int(merged["candidate_limits"]["select"])

        self.full_name.value = merged["test_data"]["full_name"]
        self.first_name.value = merged["test_data"]["first_name"]
        self.last_name.value = merged["test_data"]["last_name"]
        self.email.value = merged["test_data"]["email"]
        self.phone.value = merged["test_data"]["phone"]
        self.address1.value = merged["test_data"]["address1"]
        self.address2.value = merged["test_data"]["address2"]
        self.city.value = merged["test_data"]["city"]
        self.state.value = merged["test_data"]["state"]
        self.postal_code.value = merged["test_data"]["postal_code"]
        self.notes.value = merged["test_data"]["notes"]

        self.persona_controls = [self._build_persona_controls(persona) for persona in merged["personas"]]
        self._render_personas()
        self._refresh_study_meta()

    def build_config(self) -> dict[str, Any]:
        return {
            "experiment_name": self.experiment_name.value.strip(),
            "start_url": self.start_url.value.strip(),
            "tasks": self._lines(self.tasks.value),
            "success_criteria": {
                "url_contains": self._lines(self.success_url_tokens.value),
                "text_contains": self._lines(self.success_text_tokens.value),
            },
            "max_steps": int(self.max_steps.value),
            "click_timeout_ms": int(self.click_timeout_ms.value),
            "runs_per_persona": int(self.runs_per_persona.value),
            "random_seed": self._parse_seed(self.random_seed.value),
            "output_file": self.output_file.value.strip(),
            "model": self.model.value.strip(),
            "run_timeout_s": int(self.run_timeout_s.value),
            "sleep_scale": float(self.sleep_scale.value),
            "hydrate_timeout_ms": int(self.hydrate_timeout_ms.value),
            "observation_char_limit": int(self.observation_char_limit.value),
            "candidate_limits": {
                "click": int(self.click_candidates.value),
                "input": int(self.input_candidates.value),
                "select": int(self.select_candidates.value),
            },
            "task_search_hint": self.task_search_hint.value.strip(),
            "site_hints": {
                "prefer_labels": self._lines(self.prefer_labels.value),
                "avoid_labels": self._lines(self.avoid_labels.value),
            },
            "test_data": {
                "full_name": self.full_name.value.strip(),
                "first_name": self.first_name.value.strip(),
                "last_name": self.last_name.value.strip(),
                "email": self.email.value.strip(),
                "phone": self.phone.value.strip(),
                "address1": self.address1.value.strip(),
                "address2": self.address2.value.strip(),
                "city": self.city.value.strip(),
                "state": self.state.value.strip(),
                "postal_code": self.postal_code.value.strip(),
                "notes": self.notes.value.strip(),
            },
            "personas": [
                {
                    "name": control["name"].value.strip(),
                    "exploration": float(control["exploration"].value),
                    "patience": float(control["patience"].value),
                    "attention": float(control["attention"].value),
                    "error_rate": float(control["error_rate"].value),
                }
                for control in self.persona_controls
                if control["name"].value.strip()
            ],
        }

    def validate_config(self, config: dict[str, Any]) -> tuple[list[str], list[str]]:
        errors: list[str] = []
        warnings: list[str] = []

        if not config["experiment_name"]:
            errors.append("Experiment name is required.")
        if not config["start_url"]:
            errors.append("Start URL is required.")
        else:
            parsed = urlparse(config["start_url"])
            if parsed.scheme not in {"http", "https", "file"}:
                warnings.append("Start URL does not use http, https, or file. Verify that the runner can reach it.")
        if not config["tasks"]:
            errors.append("Add at least one task.")
        if not config["output_file"]:
            errors.append("Output CSV path is required.")
        elif not config["output_file"].endswith(".csv"):
            warnings.append("Output path does not end with .csv.")
        if not config["personas"]:
            errors.append("Add at least one persona.")
        if not config["success_criteria"]["url_contains"] and not config["success_criteria"]["text_contains"]:
            warnings.append("No success criteria defined. The run may complete, but success will be hard to judge consistently.")
        if not config["task_search_hint"]:
            warnings.append("Search hint is blank. Product discovery tasks may become slower or less stable.")
        if not os.getenv("OPENAI_API_KEY"):
            warnings.append("OPENAI_API_KEY is not set. The runner will use the fallback policy instead of GPT-based decisions.")
        if int(config["run_timeout_s"]) <= 45:
            warnings.append("Run timeout is short. Slow sites may register false abandonments.")

        for persona in config["personas"]:
            for field in ("exploration", "patience", "attention", "error_rate"):
                value = float(persona[field])
                if value < 0 or value > 1:
                    errors.append(f"Persona '{persona['name']}' has {field} outside the 0-1 range.")

        return errors, warnings

    def _render_message_block(self, errors: list[str], warnings: list[str]) -> str:
        parts: list[str] = []
        if errors:
            items = "".join(f"<li>{html.escape(item)}</li>" for item in errors)
            parts.append(
                "<div style='padding:10px;border:1px solid #e6b8b7;background:#fff4f4'>"
                "<b>Errors</b><ul style='margin:8px 0 0 18px'>"
                f"{items}</ul></div>"
            )
        if warnings:
            items = "".join(f"<li>{html.escape(item)}</li>" for item in warnings)
            parts.append(
                "<div style='padding:10px;border:1px solid #f3d48b;background:#fff9ea'>"
                "<b>Warnings</b><ul style='margin:8px 0 0 18px'>"
                f"{items}</ul></div>"
            )
        if not parts:
            return (
                "<div style='padding:10px;border:1px solid #b7d7b0;background:#f4fff1'>"
                "<b>Validation passed.</b> The study is structurally ready to run."
                "</div>"
            )
        return "".join(parts)

    def _set_status(self, message: str, tone: str = "neutral") -> None:
        styles = {
            "neutral": ("#f7f7f7", "#d9d9d9"),
            "success": ("#f4fff1", "#b7d7b0"),
            "warning": ("#fff9ea", "#f3d48b"),
            "error": ("#fff4f4", "#e6b8b7"),
        }
        background, border = styles[tone]
        self.status_html.value = (
            f"<div style='padding:10px;border:1px solid {border};background:{background}'>{html.escape(message)}</div>"
        )

    def _set_results_html(self, value: str) -> None:
        self.results_html.value = value

    def _append_log(self, line: str) -> None:
        self.log_lines.append(line.rstrip())
        self.log_lines = self.log_lines[-250:]
        self.run_log.value = "\n".join(self.log_lines)

    def _set_running_state(self, running: bool) -> None:
        self.command_running = running
        for button in [self.run_button, self.stress_button, self.install_chromium_button, self.check_env_button]:
            button.disabled = running

    def _preview_clicked(self, _button) -> None:
        self.preview_json.value = json.dumps(self.build_config(), indent=2)
        self._set_status("Config preview refreshed.", tone="neutral")

    def _save_clicked(self, _button) -> None:
        config = self.build_config()
        path = save_generic_config(config, self._resolve_path(self.config_path.value.strip()))
        self.preview_json.value = json.dumps(config, indent=2)
        self._set_status(f"Config saved to {path}.", tone="success")

    def _load_clicked(self, _button) -> None:
        try:
            config = load_config(str(self._resolve_path(self.config_path.value.strip())))
        except Exception as exc:
            self._set_status(f"Could not load config: {exc}", tone="error")
            return

        self.apply_config(config)
        self.preview_json.value = json.dumps(self.build_config(), indent=2)
        self._set_status("Config loaded into the form.", tone="success")

    def _reset_clicked(self, _button) -> None:
        self.apply_config(default_generic_config())
        self.preview_json.value = json.dumps(self.build_config(), indent=2)
        self._set_status("Form reset to defaults.", tone="neutral")

    def _add_persona_clicked(self, _button) -> None:
        new_persona = self._persona_template(len(self.persona_controls) + 1)
        self.persona_controls.append(self._build_persona_controls(new_persona))
        self._render_personas()
        self._refresh_study_meta()

    def _validate_clicked(self, _button) -> None:
        config = self.build_config()
        errors, warnings = self.validate_config(config)
        self.validation_html.value = self._render_message_block(errors, warnings)
        if errors:
            self._set_status("Validation found blocking issues.", tone="error")
        elif warnings:
            self._set_status("Validation passed with warnings.", tone="warning")
        else:
            self._set_status("Validation passed.", tone="success")

    def _environment_rows(self) -> list[dict[str, Any]]:
        rows = [
            {"check": "ipywidgets installed", "status": bool(importlib.util.find_spec("ipywidgets")), "detail": "Notebook UI dependency"},
            {"check": "playwright installed", "status": bool(importlib.util.find_spec("playwright")), "detail": "Browser automation dependency"},
            {"check": "openai installed", "status": bool(importlib.util.find_spec("openai")), "detail": "GPT decision dependency"},
            {"check": "OPENAI_API_KEY set", "status": bool(os.getenv("OPENAI_API_KEY")), "detail": "Missing key triggers fallback policy"},
        ]

        chromium_status = False
        chromium_detail = "Launch check not run."
        if importlib.util.find_spec("playwright"):
            try:
                result = subprocess.run(
                    [
                        sys.executable,
                        "-c",
                        (
                            "from playwright.sync_api import sync_playwright; "
                            "p=sync_playwright().start(); "
                            "browser=p.chromium.launch(headless=True); "
                            "browser.close(); "
                            "p.stop(); "
                            "print('chromium_ok')"
                        ),
                    ],
                    cwd=str(WORKSPACE_ROOT),
                    env=self._command_env(),
                    capture_output=True,
                    text=True,
                    timeout=45,
                )
                chromium_status = result.returncode == 0 and "chromium_ok" in result.stdout
                chromium_detail = (result.stdout or result.stderr or "Chromium launch failed.").strip()
            except Exception as exc:
                chromium_detail = str(exc)

        rows.append({"check": "chromium launch", "status": chromium_status, "detail": chromium_detail})
        return rows

    def _check_environment_clicked(self, _button) -> None:
        rows = self._environment_rows()
        rendered_rows = [
            {
                "check": row["check"],
                "status": "OK" if row["status"] else "Needs attention",
                "detail": row["detail"],
            }
            for row in rows
        ]
        self.environment_html.value = _table_html(rendered_rows)
        if all(row["status"] for row in rows):
            self._set_status("Environment check passed.", tone="success")
        else:
            self._set_status("Environment check completed with missing pieces.", tone="warning")

    def _run_command(
        self,
        label: str,
        command: list[str],
        on_complete,
    ) -> None:
        if self.command_running:
            self._set_status("A command is already running in this notebook session.", tone="warning")
            return

        self.log_lines = [f"$ {' '.join(command)}"]
        self.run_log.value = "\n".join(self.log_lines)
        self._set_running_state(True)
        self._set_status(f"{label} started.", tone="neutral")

        def worker() -> None:
            return_code = -1
            try:
                process = subprocess.Popen(
                    command,
                    cwd=str(WORKSPACE_ROOT),
                    env=self._command_env(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
                assert process.stdout is not None
                for line in process.stdout:
                    self._append_log(line)
                return_code = process.wait()
            except Exception as exc:
                self._append_log(f"[shell error] {exc}")
            finally:
                self._set_running_state(False)
                on_complete(return_code)

        self.command_thread = threading.Thread(target=worker, daemon=True)
        self.command_thread.start()

    def _install_chromium_clicked(self, _button) -> None:
        self._run_command(
            "Chromium install",
            [sys.executable, "-m", "playwright", "install", "chromium"],
            self._after_install,
        )

    def _after_install(self, return_code: int) -> None:
        if return_code == 0:
            self._set_status("Chromium install completed.", tone="success")
        else:
            self._set_status("Chromium install failed. Review the run log.", tone="error")

    def _run_experiment_clicked(self, _button) -> None:
        config = self.build_config()
        errors, warnings = self.validate_config(config)
        self.validation_html.value = self._render_message_block(errors, warnings)
        if errors:
            self._set_status("Experiment run blocked by validation errors.", tone="error")
            return

        config_path = save_generic_config(config, self._resolve_path(self.config_path.value.strip()))
        self.preview_json.value = json.dumps(config, indent=2)

        self._run_command(
            "Experiment run",
            [
                sys.executable,
                str(WORKSPACE_ROOT / "scripts" / "generic_usability_runner.py"),
                "--config",
                str(config_path),
            ],
            self._after_experiment,
        )

    def _after_experiment(self, return_code: int) -> None:
        results = summarize_results_csv(self._resolve_path(self.output_file.value.strip()))
        if return_code == 0 and results:
            overall = results["overall"]
            self._set_results_html(
                "<p>"
                f"<b>Results:</b> {html.escape(str(results['path']))}<br>"
                f"<b>Success rate:</b> {overall['success_rate']} "
                f"&nbsp; <b>Runs:</b> {overall['runs']} "
                f"&nbsp; <b>Avg steps:</b> {overall['avg_steps']} "
                f"&nbsp; <b>Avg misclick:</b> {overall['avg_misclick']} "
                f"&nbsp; <b>Avg backtrack:</b> {overall['avg_backtrack']}"
                "</p>"
                "<b>By persona</b>"
                f"{_table_html(results['by_persona'])}"
            )
            self._set_status("Experiment run completed.", tone="success")
        elif return_code == 0:
            self._set_results_html("<p>Run completed but no readable CSV results were found.</p>")
            self._set_status("Experiment run completed, but no results summary was generated.", tone="warning")
        else:
            self._set_status("Experiment run failed. Review the run log.", tone="error")

    def _run_stress_clicked(self, _button) -> None:
        prefix = self.stress_output_prefix.value.strip() or "generic_usability_smoke"
        self._run_command(
            "Stress test",
            [
                sys.executable,
                str(WORKSPACE_ROOT / "scripts" / "generic_usability_stress.py"),
                "--output-prefix",
                prefix,
                "--runs-per-persona",
                str(int(self.stress_runs_per_persona.value)),
            ],
            self._after_stress,
        )

    def _after_stress(self, return_code: int) -> None:
        prefix = self.stress_output_prefix.value.strip() or "generic_usability_smoke"
        summary_path = self._resolve_path(f"output/{prefix}_summary.csv")
        if return_code == 0 and summary_path.exists():
            with summary_path.open() as handle:
                rows = list(csv.DictReader(handle))
            self._set_results_html(
                "<p>"
                f"<b>Stress summary:</b> {html.escape(str(summary_path))}"
                "</p>"
                f"{_table_html(rows)}"
            )
            self._set_status("Stress test completed.", tone="success")
        elif return_code == 0:
            self._set_results_html("<p>Stress test completed but no summary CSV was found.</p>")
            self._set_status("Stress test completed, but no summary CSV was found.", tone="warning")
        else:
            self._set_status("Stress test failed. Review the run log.", tone="error")

    def _on_meta_change(self, _change) -> None:
        self._refresh_study_meta()


def build_generic_jupyter_form(
    output_config_path: str | Path = "configs/generic_usability_experiment.json",
) -> Any:
    app = GenericUsabilityShellApp(output_config_path)
    return app.show()
