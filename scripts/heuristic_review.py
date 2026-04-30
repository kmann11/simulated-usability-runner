"""Flow-level heuristic review.

Takes the step artifacts produced by the runner and turns them into a
``FlowHeuristicReview``: per-session scores, an aggregate per heuristic, and
the top risks worth surfacing in the UI.

The MVP uses *only* rule-based signals via ``heuristic_signals``. The shape of
the output is identical to what an LLM-augmented version would produce, so we
can swap in LLM-written summaries later without touching the consumer.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable

from scripts.heuristic_signals import (
    detect_session_signals,
    detect_step_signals,
)

# Five MVP heuristics. Easy to extend later by adding entries here and a few
# weights in ``SIGNAL_WEIGHTS`` below — no other code change needed.
HEURISTICS: list[dict[str, str]] = [
    {
        "id": "visibility_of_system_status",
        "name": "Visibility of system status",
        "default_recommendation": (
            "Add immediate, visible feedback for major actions (toasts, inline confirmations, "
            "loading indicators)."
        ),
    },
    {
        "id": "user_control_and_freedom",
        "name": "User control and freedom",
        "default_recommendation": (
            "Make undo, cancel, and back paths obvious on every step. Avoid trapping the user in a flow."
        ),
    },
    {
        "id": "consistency_and_standards",
        "name": "Consistency and standards",
        "default_recommendation": (
            "Use one canonical label per action. Audit CTA wording across the funnel for drift."
        ),
    },
    {
        "id": "error_prevention",
        "name": "Error prevention",
        "default_recommendation": (
            "Catch likely mistakes before submit (inline validation, smart defaults) instead of "
            "showing errors after."
        ),
    },
    {
        "id": "recognition_over_recall",
        "name": "Recognition over recall",
        "default_recommendation": (
            "Surface the information users need at the moment of decision. Don't make them remember "
            "details from earlier steps."
        ),
    },
]

# Per-signal deduction weights. Multiplied by occurrence count, summed, then
# subtracted from a baseline of 5. Tuned to be conservative for an MVP.
SIGNAL_WEIGHTS: dict[str, dict[str, float]] = {
    "visibility_of_system_status": {
        "no_visible_change_after_click": 0.6,
        "misclick": 0.4,
        "hesitation_wait": 0.2,
    },
    "user_control_and_freedom": {
        "navigated_back": 0.4,
        "loop_to_prior_state": 0.7,
        "no_escape_hatch": 0.2,
    },
    "consistency_and_standards": {
        "varied_cta_labels": 0.8,
        "near_duplicate_labels": 1.0,
    },
    "error_prevention": {
        "form_validation_text": 0.6,
        "step_error": 1.0,
        "abandoned_with_errors": 1.5,
    },
    "recognition_over_recall": {
        "long_navigation_path": 0.5,
        "many_distinct_urls": 0.5,
    },
}

# Floor of 0.3 even with no observation, ramping to 0.9 at 20+ steps.
def _confidence(num_steps: int) -> float:
    if num_steps <= 0:
        return 0.3
    return round(min(0.9, 0.3 + 0.03 * num_steps), 2)


def _severity(score: int) -> str:
    if score >= 4:
        return "low"
    if score == 3:
        return "medium"
    return "high"


def _heuristic_index() -> dict[str, dict[str, str]]:
    return {h["id"]: h for h in HEURISTICS}


def _evidence_ref(artifact: dict[str, Any], signal_type: str, note: str) -> dict[str, Any]:
    return {
        "step_index": int(artifact.get("step_index", 0)),
        "persona": str(artifact.get("persona", "")),
        "url": str(artifact.get("url", "")),
        "screenshot_path": artifact.get("screenshot_path"),
        "signal_type": signal_type,
        "note": note,
    }


def _session_evidence_ref(
    artifacts: list[dict[str, Any]], signal_type: str, note: str
) -> dict[str, Any]:
    """Synthesize an evidence ref for a session-level signal (uses the last step)."""
    anchor = artifacts[-1] if artifacts else {}
    return {
        "step_index": int(anchor.get("step_index", 0)),
        "persona": str(anchor.get("persona", "")),
        "url": str(anchor.get("url", "")),
        "screenshot_path": anchor.get("screenshot_path"),
        "signal_type": signal_type,
        "note": note,
    }


def score_session(
    persona: str,
    artifacts: list[dict[str, Any]],
    session_id: str | None = None,
) -> dict[str, Any]:
    """Score one persona-session against every heuristic."""

    signals: list[tuple[dict[str, Any], dict[str, str]]] = []
    for artifact in artifacts:
        for signal in detect_step_signals(artifact):
            signals.append((artifact, signal))

    # Session-level signals don't have a single anchor step, so we attach them
    # to the last step in the session (or the first if the session is empty-ish).
    for signal in detect_session_signals(artifacts):
        anchor_artifact = artifacts[-1] if artifacts else {"persona": persona}
        signals.append((anchor_artifact, signal))

    by_heuristic: dict[str, list[tuple[dict[str, Any], dict[str, str]]]] = defaultdict(list)
    for artifact, signal in signals:
        by_heuristic[signal["heuristic_id"]].append((artifact, signal))

    scores: list[dict[str, Any]] = []
    confidence = _confidence(len(artifacts))

    for heuristic in HEURISTICS:
        h_id = heuristic["id"]
        weights = SIGNAL_WEIGHTS.get(h_id, {})
        triggered = by_heuristic.get(h_id, [])

        deduction = sum(weights.get(s["signal_type"], 0.0) for _, s in triggered)
        raw_score = max(1, min(5, round(5 - deduction)))

        evidence = [_evidence_ref(a, s["signal_type"], s["note"]) for a, s in triggered]
        # Cap evidence to a manageable number so the UI doesn't drown.
        evidence = evidence[:8]

        scores.append(
            {
                "heuristic_id": h_id,
                "heuristic_name": heuristic["name"],
                "score": raw_score,
                "confidence": confidence,
                "severity": _severity(raw_score),
                "summary": _summary_for(h_id, raw_score, len(triggered), persona),
                "recommendation": heuristic["default_recommendation"],
                "evidence": evidence,
            }
        )

    return {
        "session_id": session_id or f"{persona}",
        "persona": persona,
        "scores": scores,
    }


def aggregate_review(session_reviews: list[dict[str, Any]]) -> dict[str, Any]:
    """Combine session reviews into a flow-level review."""

    if not session_reviews:
        return {
            "overall_score": None,
            "top_risks": [],
            "aggregate_scores": [],
            "session_reviews": [],
        }

    catalog = _heuristic_index()
    aggregate: list[dict[str, Any]] = []

    # Pre-bucket by heuristic for the aggregate roll-up.
    bucket: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for review in session_reviews:
        for score in review["scores"]:
            bucket[score["heuristic_id"]].append(score)

    overall_components: list[float] = []
    for heuristic in HEURISTICS:
        h_id = heuristic["id"]
        scores = bucket.get(h_id, [])
        if not scores:
            continue
        avg_score = sum(s["score"] for s in scores) / len(scores)
        avg_conf = sum(s["confidence"] for s in scores) / len(scores)
        overall_components.append(avg_score)

        # Collect the most severe / highest-signal evidence across sessions.
        evidence: list[dict[str, Any]] = []
        for s in scores:
            evidence.extend(s["evidence"])
        # Stable sort: prefer evidence from sessions with the lowest scores.
        evidence = evidence[:10]

        rounded = round(avg_score, 1)
        severity = _severity(int(round(avg_score)))
        meta = catalog.get(h_id, {})
        aggregate.append(
            {
                "heuristic_id": h_id,
                "heuristic_name": meta.get("name", h_id),
                "score": int(round(avg_score)),
                "confidence": round(avg_conf, 2),
                "severity": severity,
                "summary": _aggregate_summary_for(h_id, rounded, len(scores)),
                "recommendation": meta.get("default_recommendation", ""),
                "evidence": evidence,
            }
        )

    # Top risks = aggregate scores with the worst severity, sorted by score.
    risky = [s for s in aggregate if s["severity"] in {"medium", "high"}]
    risky.sort(key=lambda s: (s["score"], -s["confidence"]))
    top_risks = [_risk_headline(s) for s in risky[:3]]

    overall_score = (
        round(sum(overall_components) / len(overall_components), 1)
        if overall_components
        else None
    )

    return {
        "overall_score": overall_score,
        "top_risks": top_risks,
        "aggregate_scores": aggregate,
        "session_reviews": session_reviews,
    }


def review_flow(sessions: Iterable[tuple[str, list[dict[str, Any]]]]) -> dict[str, Any]:
    """High-level entry point.

    ``sessions`` is an iterable of ``(persona, artifacts)`` tuples — each tuple
    represents one persona-run. Returns a serializable FlowHeuristicReview.
    """
    session_reviews: list[dict[str, Any]] = []
    for index, (persona, artifacts) in enumerate(sessions):
        session_reviews.append(
            score_session(persona, artifacts, session_id=f"{persona}_{index + 1}")
        )
    return aggregate_review(session_reviews)


# ---------------------------------------------------------------------------
# Summary copy
#
# Kept short and grounded — they describe what we actually saw, not vibes.
# When LLM summaries are added later, they replace the body of these helpers.
# ---------------------------------------------------------------------------


def _summary_for(heuristic_id: str, score: int, signal_count: int, persona: str) -> str:
    if signal_count == 0:
        return f"No signals against this heuristic for {persona}."
    base = {
        "visibility_of_system_status": "Some actions seemed to leave the tester guessing.",
        "user_control_and_freedom": "The tester had to fight the flow to back out or correct course.",
        "consistency_and_standards": "Labels and patterns drifted across the flow.",
        "error_prevention": "Errors showed up after the fact instead of being prevented.",
        "recognition_over_recall": "The flow leaned on the tester remembering details across pages.",
    }.get(heuristic_id, "Issues observed.")
    return f"{base} ({signal_count} signal{'s' if signal_count != 1 else ''}, score {score}/5)."


def _aggregate_summary_for(heuristic_id: str, avg_score: float, sessions: int) -> str:
    base = {
        "visibility_of_system_status": "Visible system feedback varies by step.",
        "user_control_and_freedom": "Backing out and correcting course wasn't always easy.",
        "consistency_and_standards": "Wording and patterns weren't fully consistent across the flow.",
        "error_prevention": "The flow allowed mistakes that better defaults could have prevented.",
        "recognition_over_recall": "The flow asked the tester to remember details across pages.",
    }.get(heuristic_id, "Heuristic observations.")
    return f"{base} (avg {avg_score}/5 across {sessions} session{'s' if sessions != 1 else ''})."


def _risk_headline(score: dict[str, Any]) -> str:
    return f"{score['heuristic_name']}: {score['summary']}"
