"""Rule-based signal detection for heuristic review.

A "signal" is a small observation about the run that can argue for or against
a specific Nielsen-style heuristic. Detectors are intentionally conservative:
they only fire when there's clear evidence in the captured step artifact.

These signals are the grounding layer. ``heuristic_review.py`` consumes them
and turns them into HeuristicScore objects with summaries and recommendations.

Each detector returns a list of dicts shaped like::

    {
        "heuristic_id": "visibility_of_system_status",
        "signal_type": "no_visible_change_after_click",
        "note": "Clicked 'Add to Cart' but the page didn't visibly change.",
    }
"""

from __future__ import annotations

from typing import Any, Iterable

# Vocab the runner already uses to describe per-step events. Kept here so the
# review layer doesn't depend on runner internals.
NOTE_NO_CHANGE = "no_visible_change_after_click"
NOTE_FORM_VALIDATION = "form_validation_text"
NOTE_LOOP_TO_PRIOR = "loop_to_prior_state"
NOTE_BACKTRACK = "navigated_back"
NOTE_HESITATION = "hesitation_wait"
NOTE_MISCLICK = "misclick"
NOTE_STEP_ERROR = "step_error"

# Words that suggest a server-side / late-validation error message.
VALIDATION_HINTS = (
    "required",
    "invalid",
    "must be",
    "please enter",
    "please select",
    "is not valid",
    "cannot be empty",
    "did not match",
    "we couldn't",
)

# Phrases that suggest the page provides a way out (helps user_control_and_freedom).
ESCAPE_HATCH_HINTS = (
    "cancel",
    "close",
    "back",
    "previous",
    "edit",
    "remove",
    "skip",
)


def _action_kind(action: str) -> str:
    if action.startswith("click["):
        return "click"
    if action.startswith("type["):
        return "type"
    if action.startswith("select["):
        return "select"
    return action


def detect_step_signals(artifact: dict[str, Any]) -> list[dict[str, str]]:
    """Look at a single step artifact and yield any per-step signals.

    The artifact is expected to follow the shape produced by
    ``generic_usability_runner.run_user`` (see StepArtifact in app/main.py).
    """

    signals: list[dict[str, str]] = []
    notes: list[str] = artifact.get("notes", []) or []
    action: str = artifact.get("action", "")
    visible_labels: list[str] = artifact.get("visible_labels", []) or []
    page_text: str = (artifact.get("dom_summary") or "").lower()
    status: str = artifact.get("status", "completed")

    # visibility_of_system_status — clicks with no visible feedback.
    if NOTE_NO_CHANGE in notes and _action_kind(action) == "click":
        signals.append(
            {
                "heuristic_id": "visibility_of_system_status",
                "signal_type": NOTE_NO_CHANGE,
                "note": "Clicked but the page didn't visibly change. Users had to guess whether anything happened.",
            }
        )

    if NOTE_HESITATION in notes:
        signals.append(
            {
                "heuristic_id": "visibility_of_system_status",
                "signal_type": NOTE_HESITATION,
                "note": "The tester paused before deciding what to do. The next step wasn't obvious.",
            }
        )

    if NOTE_MISCLICK in notes:
        signals.append(
            {
                "heuristic_id": "visibility_of_system_status",
                "signal_type": NOTE_MISCLICK,
                "note": "The tester clicked the wrong thing first. Affordances likely weren't clear.",
            }
        )

    # user_control_and_freedom — backtracks and dead ends.
    if NOTE_BACKTRACK in notes or action == "back":
        signals.append(
            {
                "heuristic_id": "user_control_and_freedom",
                "signal_type": NOTE_BACKTRACK,
                "note": "The tester had to navigate back. The forward path felt like the wrong choice.",
            }
        )

    if NOTE_LOOP_TO_PRIOR in notes:
        signals.append(
            {
                "heuristic_id": "user_control_and_freedom",
                "signal_type": NOTE_LOOP_TO_PRIOR,
                "note": "The tester ended up back on a page they'd already seen. Felt like a loop.",
            }
        )

    if not any(_label_contains_any(label, ESCAPE_HATCH_HINTS) for label in visible_labels):
        signals.append(
            {
                "heuristic_id": "user_control_and_freedom",
                "signal_type": "no_escape_hatch",
                "note": "No visible cancel / back / close affordance on this step.",
            }
        )

    # error_prevention — late validation, unrecoverable steps.
    if any(hint in page_text for hint in VALIDATION_HINTS):
        signals.append(
            {
                "heuristic_id": "error_prevention",
                "signal_type": NOTE_FORM_VALIDATION,
                "note": "Validation error text was visible on the page (caught after submit, not before).",
            }
        )

    if status == "error" or NOTE_STEP_ERROR in notes:
        signals.append(
            {
                "heuristic_id": "error_prevention",
                "signal_type": NOTE_STEP_ERROR,
                "note": "An action failed entirely. The flow didn't guide the tester away from this state.",
            }
        )

    return signals


def detect_session_signals(artifacts: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Signals that depend on patterns *across* a session."""

    signals: list[dict[str, str]] = []
    if not artifacts:
        return signals

    # consistency_and_standards — many distinct CTA labels can suggest inconsistent wording.
    distinct_labels: set[str] = set()
    for artifact in artifacts:
        for label in artifact.get("visible_labels", []) or []:
            normalized = _normalize_label(label)
            if normalized:
                distinct_labels.add(normalized)

    if len(distinct_labels) >= 18:
        signals.append(
            {
                "heuristic_id": "consistency_and_standards",
                "signal_type": "varied_cta_labels",
                "note": (
                    f"The flow showed {len(distinct_labels)} distinct call-to-action labels. "
                    "That much variety can read as inconsistency."
                ),
            }
        )

    near_duplicates = _near_duplicate_pairs(distinct_labels)
    if near_duplicates:
        sample = ", ".join(f"'{a}' / '{b}'" for a, b in near_duplicates[:3])
        signals.append(
            {
                "heuristic_id": "consistency_and_standards",
                "signal_type": "near_duplicate_labels",
                "note": f"Some labels look like near-duplicates of each other: {sample}.",
            }
        )

    # recognition_over_recall — long flows lean on memory more than the page.
    distinct_urls = {artifact.get("url", "") for artifact in artifacts if artifact.get("url")}
    if len(distinct_urls) >= 6:
        signals.append(
            {
                "heuristic_id": "recognition_over_recall",
                "signal_type": "many_distinct_urls",
                "note": (
                    f"The flow spanned {len(distinct_urls)} different pages. "
                    "More page hops mean more for the user to keep in their head."
                ),
            }
        )

    if len(artifacts) >= 18:
        signals.append(
            {
                "heuristic_id": "recognition_over_recall",
                "signal_type": "long_navigation_path",
                "note": (
                    f"The tester took {len(artifacts)} steps. Long flows put more load on memory."
                ),
            }
        )

    # error_prevention — abandoned with errors.
    last = artifacts[-1]
    if last.get("status") == "abandoned" and any(NOTE_STEP_ERROR in (a.get("notes") or []) for a in artifacts):
        signals.append(
            {
                "heuristic_id": "error_prevention",
                "signal_type": "abandoned_with_errors",
                "note": "The session was abandoned after at least one outright failure.",
            }
        )

    return signals


def _label_contains_any(label: str, needles: Iterable[str]) -> bool:
    lowered = (label or "").lower()
    return any(needle in lowered for needle in needles)


def _normalize_label(label: str) -> str:
    return " ".join((label or "").lower().split())


def _near_duplicate_pairs(labels: set[str]) -> list[tuple[str, str]]:
    """Cheap near-duplicate detection: same label modulo punctuation/case."""
    seen: dict[str, str] = {}
    pairs: list[tuple[str, str]] = []
    for label in labels:
        key = "".join(ch for ch in label.lower() if ch.isalnum())
        if not key:
            continue
        if key in seen and seen[key] != label:
            pairs.append((seen[key], label))
        else:
            seen[key] = label
    return pairs
