# Simulated Usability Runner

**What it is:** a Playwright-based tool that runs automated walkthroughs on a link you provide (Figma, GitHub preview, staging, or live). It simulates different traveler types trying your tasks and surfaces hesitation, misclicks, backtracks, and abandon patterns. It is a lightweight pre-test layer before human usability sessions, not a replacement for talking to real people.

**Hosted UI (GitHub Pages):** [https://kmann11.github.io/simulated-usability-runner/](https://kmann11.github.io/simulated-usability-runner/)

**That URL is UI only until an API is connected.** Pages cannot run FastAPI or Playwright. Health checks and runs fail until you deploy the backend and set `VITE_API_BASE`. See **[HOSTING.md](HOSTING.md)** (do not invent a Render URL).

| For | Not for |
| --- | --- |
| Researchers and PMs exploring a flow before human sessions | Treating output as human truth |
| Checking whether a task setup is clear | Replacing moderated usability testing |
| Catching brittle paths or obvious label/path friction | Running against third-party production without permission |

## Quick start (recommended)

1. **UI:** open the Pages URL above, or run the React app locally (`frontend/`).
2. **API:** run FastAPI locally, or deploy with Docker / Render Blueprint ([HOSTING.md](HOSTING.md)).
3. Paste a real prototype link (or click **Try a sample public page** for a no-login TodoMVC demo), keep 1–2 traveler types for a first pass, then **Open link & run test**.

Primary run path is **async**: `POST /runs` then poll `GET /runs/{job_id}`. Legacy sync `POST /run` still exists for callers that need it.

**Hosted tip:** free-tier APIs sleep when idle. If health fails, wait up to a minute or use **Retry**; the UI keeps polling. Figma/GitHub Chrome login only works with a local backend (see [HOSTING.md](HOSTING.md)).

### Local full stack

```bash
# API (repo root)
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
uvicorn app.main:app --host 0.0.0.0 --port 8000

# UI (separate terminal)
cd frontend && npm install && npm run dev
```

Open [http://localhost:5273](http://localhost:5273). Dev proxy sends `/api/*` to the backend.

## Repo layout

```text
app/                 FastAPI backend (validate, async /runs, healthz, stress)
frontend/            Vite + React UI (also published to GitHub Pages)
configs/             Example and active experiment JSON
scripts/             Playwright runner, heuristics, TLX, segments, Jupyter shell
notebooks/           Optional Jupyter form (advanced / local alternate)
output/              Run CSV and session artifacts
Dockerfile           API container image
render.yaml          Render Blueprint for the API
HOSTING.md           Pages + API wiring (VITE_API_BASE)
requirements.txt
README.md
```

## Advanced / local alternate: Jupyter

The team-facing path is the React UI. The notebook remains available for local exploratory runs:

```text
notebooks/generic_usability_runner.ipynb
```

```python
from scripts.generic_usability_shell import build_generic_jupyter_form

build_generic_jupyter_form("configs/generic_usability_experiment.json")
```

## Setup (Python)

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate

python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
```

## Validate With GitHub Actions

Workflow: `.github/workflows/validation.yml` (push, PR, and manual).

What it validates:

- installs dependencies and Playwright Chromium
- checks configs and notebook JSON
- compiles Python modules and imports the runner
- runs the local fixture smoke benchmark
- uploads validation CSVs as an artifact

This validates the runner in batch mode. Interactive configuration is via the React UI (or the Jupyter form as an alternate).

## Configure a Study

Active config (CLI / notebook):

```text
configs/generic_usability_experiment.json
```

Template:

```text
configs/generic_usability_experiment.example.json
```

Current config fields include:

- `experiment_name`
- `start_url`
- `lob`
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

Persona fields include segment id, levers, and derived behavior floats (`exploration`, `patience`, `attention`, `error_rate`).

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

The runner writes one row per simulated session.

Default output:

```text
output/generic_usability_results.csv
```

Columns include experiment name, URL, persona, steps, hesitation, misclick, backtrack, abandoned, nav/semantic path, and timestamp.

**Synthetic TLX** (optional in the UI) is a directional workload forecast from the simulation. It is **not** a human NASA TLX questionnaire.

## FastAPI

```text
app/main.py
```

Notable endpoints:

- `GET /healthz`
- `POST /validate`
- `POST /runs` (async; primary)
- `GET /runs/{job_id}`
- `POST /runs/{job_id}/cancel`
- `POST /runs/{job_id}/auth-complete`
- `POST /run` (legacy sync)
- `POST /stress`
- `GET /personas/segments`, `GET /personas/levers`

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Cloud: root `Dockerfile` + `render.yaml` ([HOSTING.md](HOSTING.md)). Frontend: `frontend/` (local `npm run dev`; hosted Pages URL above).

## Stress Benchmark

```text
scripts/generic_usability_stress.py
```

Checks runner behavior against controlled HTML fixtures. Not the same as validating a product flow with people.

## Safety

- Use this as a pre-test and exploration layer.
- Do not treat simulated output as human truth.
- Prefer staging or controlled test environments.
- Avoid production flows that create real orders, submit real user data, or interact with sensitive information unless safeguards are in place.
- Do not run against non-EG third-party sites without permission.
