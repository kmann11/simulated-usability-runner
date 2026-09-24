# Simulated Usability Runner - Frontend

Vite + React + TypeScript UI for the FastAPI backend in `app/main.py`.

Single-page configure / run / results experience for researchers and PMs. The Python Playwright runner stays in `scripts/`.

**Live Pages URL:** [https://kmann11.github.io/simulated-usability-runner/](https://kmann11.github.io/simulated-usability-runner/)

That URL is **UI only** until an API is connected. See **[HOSTING.md](../HOSTING.md)**.

## What it does

- Edits an experiment config (LOB, tasks, traveler types, success signals)
- Starts runs with **`POST /runs`**, polls **`GET /runs/{job_id}`**, and can cancel or complete interactive auth
- Validates with `POST /validate`
- Optional design scorecard (heuristics) and **Synthetic TLX** (not human NASA TLX)
- Study share links copy **setup only** (not results); teammate still needs a connected runner
- Polls `GET /healthz` every 15s; on failure, shows a truth banner, hard-disables the primary CTA, and never promises desktop Chrome login
- Stress benchmark via `POST /stress` (local fixtures)

Legacy sync `POST /run` remains on the backend for non-UI callers.

## Prerequisites

- Node 18+ (Node 20 LTS recommended)
- FastAPI backend reachable (local default `http://localhost:8000`, or a hosted API after `VITE_API_BASE` is set)

## Install

```bash
cd frontend
npm install
```

## Run the dev server

Start the backend first (repo root):

```bash
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then:

```bash
cd frontend
npm run dev
```

Dev server: [http://localhost:5273](http://localhost:5273) (`VITE_PORT` to override). `/api/*` proxies to FastAPI.

## Configuration

Copy `.env.example` to `.env.local` if needed:

| Variable                | Purpose |
| ----------------------- | ------- |
| `VITE_PORT`             | Dev-server port (default `5273`) |
| `VITE_API_PROXY_TARGET` | Proxy target for `/api/*` (default `http://localhost:8000`) |
| `VITE_API_BASE`         | Optional absolute API origin (no trailing slash). Used for production Pages builds after Render deploy. **Do not invent a URL.** |

## Build

```bash
npm run build
```

GitHub Pages–shaped build:

```bash
GITHUB_PAGES=true npm run build
```

## Hosted UI + API

Full steps: **[HOSTING.md](../HOSTING.md)**.

1. Deploy API (Render Blueprint / Docker).
2. Set Actions variable `VITE_API_BASE` to that HTTPS origin.
3. Redeploy Pages.

Until then, health and runs fail on github.io by design. The UI explains this and disables **Open link & run test**.

**Auth:** Figma/GitHub interactive login popups do not work on cloud headless hosts. Use public links or a local backend.

## Notes

- Primary path is async `/runs`. Long runs may take minutes.
- `output_file` is mostly for local/API CSV paths; safe to leave alone in the hosted UI.
- Jupyter notebook under `notebooks/` is an advanced local alternate, not the primary team UI.
