# Cursor Handoff

This is the current state of the EG UXR design and site review tool.

## What this project is

This repo is an internal exploratory workflow for running a quick flow and heuristic check on a live experience or prototype using:

- Playwright
- research-backed segment profiles
- tunable behavioral levers
- a FastAPI backend
- a React frontend

It is meant to surface friction, pathing issues, and heuristic weak spots quickly.
It is not meant to replace human research.

## Current repo path

`/Users/kmann/Documents/Playground/simulated-usability-runner`

## Current repo shape

```text
simulated-usability-runner/
├─ .github/workflows/validation.yml
├─ app/
│  └─ main.py
├─ configs/
│  ├─ generic_usability_experiment.example.json
│  └─ generic_usability_experiment.json
├─ frontend/
│  ├─ package.json
│  └─ src/
│     ├─ App.tsx
│     ├─ api/client.ts
│     ├─ components/
│     │  ├─ ConfigForm.tsx
│     │  ├─ EvidenceGallery.tsx
│     │  ├─ HeuristicCard.tsx
│     │  ├─ HeuristicScorecard.tsx
│     │  ├─ PersonaList.tsx
│     │  ├─ StressPanel.tsx
│     │  └─ SummaryCard.tsx
│     ├─ defaultConfig.ts
│     ├─ segments.ts
│     ├─ styles.css
│     └─ types.ts
├─ notebooks/
│  └─ generic_usability_runner.ipynb
├─ output/
├─ scripts/
│  ├─ generic_usability_runner.py
│  ├─ generic_usability_shell.py
│  ├─ generic_usability_stress.py
│  ├─ heuristic_review.py
│  ├─ heuristic_signals.py
│  └─ persona_segments.py
├─ CURSOR_HANDOFF.md
├─ CURSOR_PROMPT.md
├─ README.md
├─ RESULTS_AND_SEGMENTS_MAPPING.md
└─ requirements.txt
```

## What already exists

### Backend

`app/main.py` currently provides:

- `GET /`
- `GET /healthz`
- `GET /personas/levers`
- `GET /personas/segments`
- `POST /validate`
- `POST /run`
- `POST /heuristics/review`
- `GET /artifacts/{path}`
- `POST /stress`

### Runner

`scripts/generic_usability_runner.py`:

- runs the Playwright walkthrough
- supports persona behavior floats
- captures step artifacts
- optionally captures screenshots
- writes CSV output
- returns per-session artifact bundles in the API path

### Heuristic layer

`scripts/heuristic_review.py` and `scripts/heuristic_signals.py`:

- score the observed flow against 5 heuristics
- produce aggregate and per-session heuristic review output

### Segment system

`scripts/persona_segments.py` is the backend source of truth for:

- segment presets
- lever definitions
- mapping levers into legacy behavior floats

`frontend/src/segments.ts` mirrors this for fast first paint.

### Frontend

`frontend/` is a real Vite + React app.

It already supports:

- task / URL form
- segment profile selection
- lever customization
- heuristic toggle
- screenshot toggle
- run + validate actions
- heuristic review tab
- evidence tab
- stress panel

### Results experience

The run results tab has already been upgraded into a dashboard.

It now includes:

- run header
- inline CSV download
- hero summary
- key metrics
- key insights
- by-segment summaries
- run-path snapshots
- warnings

### Validation

Local validation that passed:

- Python compile checks
- frontend build with `npm run build`
- backend import with repo venv

## Important current truth

This app is **aligned with the Glean synthetic walkthrough prompt in concept**, but **not yet aligned in contract**.

The current app already has:

- segment-driven behavior
- lever tuning
- heuristics
- artifacts
- results dashboard

The current app does **not** yet fully have:

- LOB-first architecture
- the full segment library from the Glean prompt
- prompt-aligned lever taxonomy and enums
- `one_key_member` overlay support
- DUET scoring
- the full prompt-level JSON output contract

## Best files to read first

- `RESULTS_AND_SEGMENTS_MAPPING.md`
- `app/main.py`
- `frontend/src/App.tsx`
- `frontend/src/components/SummaryCard.tsx`
- `frontend/src/components/PersonaList.tsx`
- `frontend/src/segments.ts`
- `frontend/src/types.ts`
- `scripts/persona_segments.py`
- `scripts/generic_usability_runner.py`
- `scripts/heuristic_review.py`

## Current gaps relative to the Glean prompt

Read `RESULTS_AND_SEGMENTS_MAPPING.md` for the full comparison.

Highest-priority mismatches:

1. no LOB selector
2. current segment library is too small
3. lever names and values do not fully match the Glean prompt
4. runner still compresses levers into the legacy 4-float model
5. no DUET layer yet
6. no overlay support for `one_key_member`

## Good next step

The best next implementation step is:

**Add LOB -> segment filtering -> prompt-aligned lever taxonomy without breaking the current dashboard or heuristic flow.**

That means:

- keep the existing backend and frontend
- do not rebuild from scratch
- preserve current results dashboard
- preserve heuristic review
- extend the segment system toward the Glean structure

## Local run instructions

### Backend

```bash
cd /Users/kmann/Documents/Playground/simulated-usability-runner
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd /Users/kmann/Documents/Playground/simulated-usability-runner/frontend
npm install
npm run dev
```

If needed:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

## Notes for Cursor

- Do not start over.
- Read the existing files first.
- The frontend and backend are already working together.
- The results dashboard already exists.
- The Glean prompt comparison has already been analyzed in `RESULTS_AND_SEGMENTS_MAPPING.md`.
- Prefer extending the existing structures over replacing them.

