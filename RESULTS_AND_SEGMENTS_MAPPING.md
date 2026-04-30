# Results And Segments Mapping

This document maps:

1. how the current segment-profile system works in the app
2. how the results experience is now structured in the React UI
3. what matches the Glean prompt
4. what differs or should be treated as a flag

## 1. Current Segment-Profile Flow

### What the app does now

The current app uses a **segment-first** setup with no explicit LOB selector yet.

Current flow:

1. User enters the task and link.
2. User chooses one or more **segment profiles** in the tester section.
3. Each segment profile auto-populates the lever values.
4. The user can open **Customize levers** and tune them.
5. Lever values are converted into the legacy runner behavior floats:
   - `exploration`
   - `patience`
   - `attention`
   - `error_rate`
6. The Playwright runner uses those floats to drive the walkthrough.

### Current canonical files

- backend segment source of truth:
  - `scripts/persona_segments.py`
- backend normalization:
  - `scripts/persona_segments.py::normalize_persona`
- frontend mirrored segment catalog:
  - `frontend/src/segments.ts`
- frontend editor:
  - `frontend/src/components/PersonaList.tsx`

### Important current behavior

- The backend is canonical.
- The frontend mirrors the segment and lever definitions locally for fast render.
- The frontend does **not** yet fetch the segment catalog from the backend.
- That means there is still a **drift risk** if the frontend mirror and backend source are updated at different times.

## 2. Current Results Experience Mapping

The React experience now treats the results as an inline dashboard rather than a plain summary block.

### Current results structure in the UI

`Run results` tab now maps to:

1. **Run dashboard**
   - experiment name
   - number of segment profiles
   - number of sessions
   - CSV download button

2. **Hero summary**
   - completion headline
   - start URL
   - weakest heuristic, if available

3. **Metric strip**
   - completion rate
   - average steps
   - hesitation
   - backtracking
   - misclicks

4. **Key insights**
   - plain-language quick read
   - where the flow held up
   - where it got sticky
   - weakest segment profile
   - biggest heuristic risk

5. **By segment profile**
   - completion rate by profile
   - average friction metrics
   - top repeated signal

6. **Run paths**
   - per-session outcome
   - first few actions taken
   - captured friction tags
   - final URL snapshot

7. **Warnings**
   - any backend validation or run warnings

### Backend fields now supporting this

From `POST /run`, the frontend can now consume:

- `experiment_name`
- `start_url`
- `summary`
- `download_path`
- `sessions`
- `persona_summaries`
- `heuristic_review`

### Files involved

- backend response shaping:
  - `app/main.py`
- run dashboard component:
  - `frontend/src/components/SummaryCard.tsx`
- dashboard styling:
  - `frontend/src/styles.css`

## 3. What Matches The Glean Prompt

These things are directionally aligned already:

### Same in spirit

- **Exploratory framing**
  - both the app and the Glean prompt describe the output as directional, not a replacement for real research

- **Segment-based defaults**
  - both use research-backed segment defaults to seed behavior

- **Lever tuning**
  - both support starting from a segment and then adjusting behavior levers

- **Probabilistic variation**
  - both assume repeated runs should not be fully deterministic

- **Observed friction logging**
  - both log pathing, hesitation, misclicks, backtracking, and abandonment

- **Post-run evaluation**
  - both layer evaluation on top of the run rather than only showing raw path data

### Same conceptual architecture

- segment choice shapes the behavior model
- behavior model shapes the walkthrough
- walkthrough produces structured artifacts
- evaluation layer turns those artifacts into something more interpretable

## 4. What Is Different

The Glean prompt is materially richer than the current codebase.

### A. LOB architecture

Glean prompt:

- requires **LOB selection first**
- filters segments by:
  - Hotels.com
  - Expedia
  - Vrbo
  - B2B Network
  - Partner Central

Current app:

- no LOB selector yet
- segment list is flat

### B. Segment coverage

Glean prompt:

- many more segments
- includes B2B Network and Partner Central
- includes `one_key_member` overlay logic

Current app:

- only 6 segment presets:
  - `quality_seeker`
  - `savvy_trip_taker`
  - `business_traveler`
  - `family_planner`
  - `vrbo_group_planner`
  - `vrbo_leisure_short_stay`

### C. Lever taxonomy

Glean prompt lever names:

- `trust_baseline`
- `time_pressure`
- `info_processing`
- `risk_tolerance`
- `cognitive_load_sensitivity`
- `error_propensity`
- `device_context`
- `budget_sensitivity`
- `abandonment_threshold`
- `prior_product_familiarity`

Current app lever names:

- `trust_baseline`
- `time_pressure`
- `info_processing_style`
- `risk_tolerance`
- `cognitive_load_sensitivity`
- `error_propensity`
- `device_context`
- `budget_sensitivity`
- `abandonment_threshold`
- `prior_familiarity`

### D. Lever scale differences

Examples:

- Glean uses underscore formatting like `low_medium`
- current app uses hyphen formatting like `low-medium`

- Glean `info_processing`:
  - `skimmer`
  - `moderate`
  - `deep_reader`

- current app `info_processing_style`:
  - `skimmer`
  - `deep_reader`
  - no `moderate`

- Glean `device_context`:
  - `mobile_couch`
  - `mobile_on_the_go`
  - `desktop_planning`
  - `desktop_work`
  - `mixed`

- current app `device_context`:
  - `mobile`
  - `desktop`
  - `mixed`

### E. Output contract

Glean prompt expects much richer structured output:

- `lob`
- `segment`
- `segment_description`
- `lever_overrides`
- `custom_levers`
- `task_success: yes | partial | no`
- `trust_signals_noticed`
- `trust_signals_missed`
- `think_aloud_log`
- `duet_scores`
- `duet_flags`
- `top_friction_points`
- `improvement_suggestions`

Current app output:

- summary metrics
- session rows
- step artifacts
- heuristic review
- CSV

The current app does **not** yet produce the full Glean JSON contract.

### F. Evaluation framework

Glean prompt:

- evaluates against **DUET**
  - Delight
  - Usability
  - Ease
  - Trust

Current app:

- evaluates against a 5-heuristic review:
  - Visibility of system status
  - User control and freedom
  - Consistency and standards
  - Error prevention
  - Recognition over recall

That is a major conceptual difference:

- Glean = **experience scoring**
- current app = **heuristic review**

Neither is wrong, but they are not interchangeable.

## 5. Flags / Inconsistencies To Resolve

### High-priority flags

1. **LOB missing in product**
   - The Glean prompt assumes LOB-first selection.
   - The current app cannot express that yet.

2. **Segment names do not line up cleanly**
   - current `business_traveler` vs Glean `unmanaged_business_traveler`
   - current `vrbo_group_planner` vs Glean `families_and_groups` and `trip_planner`
   - current `vrbo_leisure_short_stay` vs Glean `leisure_short_stay`

3. **Current frontend segment catalog is hardcoded**
   - backend is canonical
   - frontend mirror can drift

4. **Lever enums differ**
   - underscore vs hyphen
   - `moderate` missing in current app
   - device contexts are much more detailed in Glean

5. **Current runner still uses the 4-float legacy behavior model**
   - Glean prompt assumes much more direct lever-driven behavior rules
   - current app still compresses the levers into:
     - exploration
     - patience
     - attention
     - error_rate

6. **No `one_key_member` overlay logic**
   - Glean explicitly models it as a cross-LOB overlay
   - current app has no overlay mechanic

7. **No DUET layer yet**
   - current app has heuristics
   - Glean expects DUET

### Medium-priority flags

8. **Prompt requires mandatory segment definition**
   - current app allows a custom neutral tester with no named segment preset

9. **Current results do not include think-aloud**
   - Glean expects persona-voice reasoning
   - current app captures observed artifacts, not explicit narrated thoughts

10. **Current results do not distinguish `partial` success**
    - current app is effectively:
      - completed
      - abandoned
      - error

## 6. Suggested Next Mapping

### Phase 1

Keep the current architecture but align names and taxonomy:

- add `lob`
- group segments by `lob`
- fetch segments from backend instead of hardcoding
- align lever names and value enums with the Glean prompt
- support `moderate` info processing
- support richer device contexts

### Phase 2

Add prompt-aligned behavior metadata:

- track lever overrides explicitly
- add custom lever support
- store segment description in run output
- add partial-success state

### Phase 3

Add prompt-aligned evaluation:

- keep heuristic review
- add DUET as a second layer, not a replacement

Best future UI structure:

- `Run results`
- `Heuristic review`
- `DUET readout`
- `Evidence`

## 7. Short Take

The current product is **aligned with the Glean prompt in concept**, but **not yet aligned in contract**.

What is already true:

- segment-driven
- lever-tunable
- exploratory
- multi-run
- friction-aware
- evaluation-aware

What is still missing:

- LOB-first architecture
- broader segment library
- prompt-aligned lever taxonomy
- overlay support
- DUET scoring
- prompt-level JSON richness

