# Simulated Usability Runner

This repo houses the current Playwright-based simulated usability workflow.

The goal is to give researchers and PMs a lightweight pre-testing layer for structured product flows before human usability sessions. It is not intended to replace human usability testing.

Use it to:

- explore a live or staging flow before human sessions
- check whether a task setup is clear
- see where simulated users loop, hesitate, misclick, backtrack, or abandon
- catch brittle paths or obvious label/path friction
- identify behavior patterns worth validating with people

## Current Housing

The team-facing experience is a Jupyter notebook form.

Open:

```text
notebooks/generic_usability_runner.ipynb
```

Run the launcher cell:

```python
from scripts.generic_usability_shell import build_generic_jupyter_form

build_generic_jupyter_form("configs/generic_usability_experiment.json")
```

That opens the form inside Jupyter.

## Repo Layout

```text
app/
├─ __init__.py
└─ main.py

configs/
├─ generic_usability_experiment.example.json
└─ generic_usability_experiment.json

notebooks/
└─ generic_usability_runner.ipynb

scripts/
├─ __init__.py
├─ generic_usability_runner.py
├─ generic_usability_shell.py
└─ generic_usability_stress.py

output/
└─ .gitkeep

requirements.txt
README.md
.gitignore
```

## Setup

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate

python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
```

If the team is running this in EGAP JupyterHub, use the standard environment if one is provided. Otherwise, the venv setup above works.

## Validate With GitHub Actions

This repo includes an Actions workflow at:

```text
.github/workflows/validation.yml
```

GitHub runs it on every push, every pull request, and any manual run from the Actions tab.

What it validates:

- installs the repo dependencies
- installs Playwright Chromium
- checks the active config, example config, and notebook JSON
- compiles the Python modules
- imports the runner and Jupyter form shell
- launches a real headless Chromium browser through Playwright
- runs the local fixture smoke benchmark
- uploads the validation CSVs as a workflow artifact

To run it manually in GitHub:

1. Open the repo in GitHub.
2. Click **Actions**.
3. Select **Validate simulated usability runner**.
4. Click **Run workflow**.
5. Open the finished run and download the **validation-output** artifact if you want the CSVs.

This validates the runner in batch mode. It does not replace the Jupyter form, which is still the cleanest team-facing way to configure and launch a study interactively.

## Configure a Study

The active config is:

```text
configs/generic_usability_experiment.json
```

The template copy is:

```text
configs/generic_usability_experiment.example.json
```

Current config fields include:

- `experiment_name`
- `start_url`
- `tasks`
- `success_criteria.url_contains`
- `success_criteria.text_contains`
- `max_steps`
- `click_timeout_ms`
- `runs_per_persona`
- `output_file`
- `model`
- `run_timeout_s`
- `sleep_scale`
- `hydrate_timeout_ms`
- `observation_char_limit`
- `candidate_limits`
- `test_data`
- `task_search_hint`
- `site_hints.prefer_labels`
- `site_hints.avoid_labels`
- `personas`

Persona fields are:

- `name`
- `exploration`
- `patience`
- `attention`
- `error_rate`

## Run Through Jupyter

Open JupyterLab, then open:

```text
notebooks/generic_usability_runner.ipynb
```

Run the form cell. The form supports:

- study name
- start URL
- task list
- success criteria
- preferred labels
- avoided labels
- personas
- run settings
- config save/load/reset
- JSON preview
- environment checks
- Chromium install helper
- experiment run
- stress benchmark run
- CSV result summary

## Run From Terminal

```bash
python3 scripts/generic_usability_runner.py --config configs/generic_usability_experiment.json
```

If model-backed decisions are needed:

```bash
export OPENAI_API_KEY="..."
python3 scripts/generic_usability_runner.py --config configs/generic_usability_experiment.json
```

If `OPENAI_API_KEY` is not present, the runner uses the fallback policy.

## Output

The current runner writes one row per simulated session.

Default output:

```text
output/generic_usability_results.csv
```

Columns:

- `experiment_name`
- `start_url`
- `persona`
- `steps`
- `hesitation`
- `misclick`
- `backtrack`
- `abandoned`
- `nav_path`
- `semantic_path`
- `timestamp`

The path details are stored in `nav_path` and `semantic_path`.

## Hosted UI URL (GitHub Pages)

The React frontend is published to GitHub Pages:

**https://kmann11.github.io/simulated-usability-runner/**

That URL is the **UI only**. GitHub Pages cannot run FastAPI or Playwright. To run experiments from the hosted UI, point it at a separately hosted API via the Actions variable `VITE_API_BASE` (see `frontend/README.md`). Local full-stack use remains: Vite on port 5273 + `uvicorn` on 8000.

## Optional FastAPI Wrapper

The FastAPI wrapper exists at:

```text
app/main.py
```

Endpoints:

- `GET /`
- `GET /healthz`
- `POST /validate`
- `POST /run`
- `POST /stress`

Run it with:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

A React UI for this API lives in `frontend/` (local: `npm run dev`; hosted: GitHub Pages above). The Jupyter form remains available for notebook-based runs.

## Stress Benchmark

The stress benchmark lives at:

```text
scripts/generic_usability_stress.py
```

It is for checking runner behavior against controlled fixtures. It is not the same as validating a product flow with human participants.

## Safety

- Use this as a pre-test and exploration layer.
- Do not treat simulated output as human truth.
- Prefer staging or controlled test environments.
- Avoid production flows that create real orders, submit real user data, or interact with sensitive information unless safeguards are in place.
- Do not run against non-EG third-party sites without permission.
