# Simulated Usability Runner — Frontend

A small Vite + React + TypeScript UI for the FastAPI backend in `app/main.py`.

It is intentionally internal-tool quality: a single page with two tabs ("Run experiment" and "Stress benchmark") that posts to the existing endpoints. The Python Playwright runner stays untouched.

## What it does

- Edits an experiment config in a form (mirrors `configs/generic_usability_experiment.example.json`)
- Imports / exports the config as JSON
- Calls `POST /validate` and renders errors + warnings + a config preview
- Calls `POST /run` and renders the summary stats returned by the backend
- Calls `POST /stress` and renders the per-fixture summary table
- Polls `GET /healthz` every 15 seconds and shows a status badge

## Prerequisites

- Node 18+ (Node 20 LTS recommended)
- The FastAPI backend running locally (defaults to `http://localhost:8000`)

## Install

```bash
cd frontend
npm install
```

## Run the dev server

In a separate terminal, start the backend first:

```bash
# from repo root
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then start the frontend:

```bash
cd frontend
npm run dev
```

The dev server runs on [http://localhost:5273](http://localhost:5273) by default. Override with `VITE_PORT` (in `.env.local` or inline, e.g. `VITE_PORT=5374 npm run dev`) if 5273 is taken too. The port is intentionally not the Vite default of 5173 so this app can run alongside other Vite projects without colliding. Requests to `/api/*` are proxied to the FastAPI backend (path rewrite `/api/run` → `/run`), so the browser does not need CORS in dev.

## Configuration

Copy `.env.example` to `.env.local` to override defaults:

| Variable                  | Purpose                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_PORT`               | Dev-server port. Default `5273` (chosen so this app does not collide with other Vite projects on `5173`).                                                          |
| `VITE_API_PROXY_TARGET`   | Target URL the Vite dev proxy forwards `/api/*` to. Default `http://localhost:8000`.                                                                               |
| `VITE_API_BASE`           | Optional. If set, the browser fetches directly from this URL (no proxy). Use for production-style deployments where the backend is reachable from the browser. |

## Build

```bash
npm run build
```

Outputs static assets in `frontend/dist/`. You can serve them from any static host or behind the FastAPI server.

## Notes

- `POST /run` is synchronous on the backend; the UI shows a "Running…" banner until the response returns. Long runs may take minutes — that is expected.
- `output_file` paths are resolved relative to the repo root by the backend; e.g. `output/foo.csv` lands in `<repo>/output/foo.csv`.
- The stress benchmark runs against the bundled local HTML fixtures, so it does not touch any live URL and is safe to run anytime to sanity-check the runner.
