# Cursor Handoff

Current state of the EG UXR design and site review tool (simulated usability runner).

## What this project is

Internal exploratory workflow for a quick flow + heuristic + optional Synthetic TLX check on a live experience or prototype using:

- Playwright
- research-backed segment profiles (LOB-scoped)
- tunable behavioral levers
- FastAPI backend (`app/main.py`)
- React frontend (`frontend/`), also on GitHub Pages

It surfaces friction, pathing issues, and heuristic weak spots quickly. It does not replace human research.

**Hosted UI:** https://kmann11.github.io/simulated-usability-runner/  
**UI only until API is connected.** See `HOSTING.md`. Do not invent `VITE_API_BASE` / Render URLs.

## Current repo path

`/Users/kmann/Documents/Playground/simulated-usability-runner`

## Current repo shape

```text
simulated-usability-runner/
├─ .github/workflows/
├─ app/
│  └─ main.py
├─ configs/
├─ frontend/
│  └─ src/
│     ├─ App.tsx
│     ├─ api/client.ts
│     ├─ components/   (ConfigForm, StudySharePanel, TlxScorecard, …)
│     ├─ defaultConfig.ts
│     ├─ segments.ts
│     └─ styles.css
├─ notebooks/          (advanced / local Jupyter alternate)
├─ output/
├─ scripts/
│  ├─ generic_usability_runner.py
│  ├─ heuristic_review.py
│  ├─ tlx_review.py
│  └─ persona_segments.py
├─ Dockerfile
├─ render.yaml
├─ HOSTING.md
├─ CURSOR_HANDOFF.md
├─ README.md
└─ requirements.txt
```

## What already exists

### Backend (`app/main.py`)

- `GET /`, `GET /healthz` (includes `interactive_auth_available`, `headless`)
- `GET /personas/levers`, `GET /personas/segments` (LOB-aware)
- `POST /validate`
- **`POST /runs`** (async jobs; primary UI path), `GET /runs/{job_id}`, cancel + auth-complete
- `POST /run` (legacy sync)
- `POST /heuristics/review`, `POST /stress`
- `GET /artifacts/{path}`

### Runner / reviews

- Playwright walkthrough with segment levers and screenshots
- Heuristic review scorecard
- **Synthetic TLX** (`scripts/tlx_review.py`): directional workload forecast; **not** human NASA TLX
- CSV + artifact output under `output/`

### Segment / LOB system

- Backend source of truth: `scripts/persona_segments.py`
- Frontend mirror: `frontend/src/segments.ts` + catalog from API
- **LOB selector** exists in the UI (Expedia, Vrbo, Hotels.com, Partner Central)
- First-run defaults: blank `start_url`, 1–2 traveler types, 1 try each

### Frontend

Vite + React app with:

- prototype link + tasks + LOB / personas
- heuristics + Synthetic TLX + screenshot toggles
- async run progress, stop, optional local interactive auth
- results dashboard, evidence gallery, study library
- **Study share panel**: shares **setup only** (not results); teammate still needs a connected runner
- truth banner when `/healthz` fails: UI-only messaging + CTA hard-disabled; `interactiveAuthAvailable` forced false (no “Chrome opens on this computer” on Pages/cloud)

### Hosting

- Pages workflow deploys `frontend/dist`
- API: Docker + Render Blueprint; wire via Actions variable `VITE_API_BASE` (see `HOSTING.md`)

## Important current truth

- Conceptually aligned with the Glean synthetic walkthrough prompt; contract still has gaps (see `RESULTS_AND_SEGMENTS_MAPPING.md`).
- LOB filtering and a larger segment library **do** exist now; some lever taxonomy / DUET / overlay gaps may remain.
- Interactive Figma/GitHub sign-in needs a **local** backend with a display; cloud/headless reports `interactive_auth_available: false`.

## Best files to read first

- `HOSTING.md`
- `README.md`
- `app/main.py`
- `frontend/src/App.tsx`
- `frontend/src/defaultConfig.ts`
- `frontend/src/components/ConfigForm.tsx`
- `frontend/src/components/StudySharePanel.tsx`
- `scripts/persona_segments.py`
- `scripts/generic_usability_runner.py`
- `RESULTS_AND_SEGMENTS_MAPPING.md`

## Local run

```bash
# backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000

# frontend
cd frontend && npm install && npm run dev
```

## Notes for Cursor

- Do not start over; extend existing structures.
- Prefer async `/runs` in UI docs and clients.
- Never invent `VITE_API_BASE` or a fake Render hostname.
- Keep user-facing copy plain (no em dashes); CTA string: **Open link & run test**.
