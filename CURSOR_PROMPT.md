Paste this into Cursor as your working prompt:

```text
You are resuming work on an existing internal tool repo at:
/Users/kmann/Documents/Playground/simulated-usability-runner

This is not a greenfield build. Read the repo first and continue from the current implementation.

What this tool is:
- an EG UXR design and site review workflow
- Playwright-based flow walkthrough
- research-backed segment profiles
- tunable behavioral levers
- heuristic review layer
- FastAPI backend
- React frontend

Important current state:
- the React frontend already exists in frontend/
- the FastAPI backend already exists in app/main.py
- segment presets and lever definitions already exist in scripts/persona_segments.py
- heuristic review already exists in scripts/heuristic_review.py and scripts/heuristic_signals.py
- the run results tab has already been upgraded into an inline dashboard with:
  - key insights
  - metrics
  - by-segment summaries
  - run-path snapshots
  - CSV download

Read these files first:
- /Users/kmann/Documents/Playground/simulated-usability-runner/CURSOR_HANDOFF.md
- /Users/kmann/Documents/Playground/simulated-usability-runner/RESULTS_AND_SEGMENTS_MAPPING.md
- /Users/kmann/Documents/Playground/simulated-usability-runner/app/main.py
- /Users/kmann/Documents/Playground/simulated-usability-runner/frontend/src/App.tsx
- /Users/kmann/Documents/Playground/simulated-usability-runner/frontend/src/components/SummaryCard.tsx
- /Users/kmann/Documents/Playground/simulated-usability-runner/frontend/src/components/PersonaList.tsx
- /Users/kmann/Documents/Playground/simulated-usability-runner/frontend/src/segments.ts
- /Users/kmann/Documents/Playground/simulated-usability-runner/frontend/src/types.ts
- /Users/kmann/Documents/Playground/simulated-usability-runner/scripts/persona_segments.py
- /Users/kmann/Documents/Playground/simulated-usability-runner/scripts/generic_usability_runner.py
- /Users/kmann/Documents/Playground/simulated-usability-runner/scripts/heuristic_review.py

Context:
- the app is aligned with the Glean synthetic walkthrough prompt in spirit, but not yet in contract
- the current app is missing:
  - LOB-first architecture
  - the larger segment library from the Glean prompt
  - prompt-aligned lever naming and enums
  - one_key_member overlay support
  - DUET scoring

What I want next:
- preserve the current frontend and backend
- preserve the current results dashboard
- preserve the current heuristic review
- do not rebuild from scratch
- extend the segment system so it moves toward:
  - LOB -> segment filtering
  - richer segment coverage
  - cleaner alignment with the Glean prompt

Your first task:
1. inspect the repo and summarize the current state in your own words
2. identify the smallest clean implementation plan for adding LOB-first segment architecture
3. only then propose or implement the next code change

Constraints:
- prefer extending existing files over replacing them
- keep the tool internal and practical
- do not overclaim the outputs as replacing human research
- keep the results experience readable and user-friendly
```
