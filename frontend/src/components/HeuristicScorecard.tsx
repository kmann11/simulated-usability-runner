import type { FlowHeuristicReview } from "../types";
import { HeuristicCard } from "./HeuristicCard";

interface HeuristicScorecardProps {
  review: FlowHeuristicReview;
}

const SEVERITY_RANK: Record<"low" | "medium" | "high", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function HeuristicScorecard({ review }: HeuristicScorecardProps) {
  const sorted = [...review.aggregate_scores].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.score - b.score,
  );

  const overall = review.overall_score;

  return (
    <div className="scorecard">
      <div className="scorecard-overview">
        <div className="overall">
          <span className="muted small">Overall flow score</span>
          <strong className="overall-num">
            {overall === null ? "—" : `${overall.toFixed(1)} / 5`}
          </strong>
          <span className="muted small">
            Average across {review.aggregate_scores.length} heuristic
            {review.aggregate_scores.length === 1 ? "" : "s"} ·{" "}
            {review.session_reviews.length} session
            {review.session_reviews.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="top-risks">
          <h4>Top risks</h4>
          {review.top_risks.length === 0 ? (
            <p className="muted">Nothing stood out as a risk in this run.</p>
          ) : (
            <ol>
              {review.top_risks.map((risk, idx) => (
                <li key={idx}>{risk}</li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="heuristic-list">
        {sorted.length === 0 && (
          <p className="muted">No heuristic scores were produced for this run.</p>
        )}
        {sorted.map((score, idx) => (
          <HeuristicCard
            key={score.heuristic_id}
            score={score}
            defaultExpanded={idx === 0 && score.severity !== "low"}
          />
        ))}
      </div>
    </div>
  );
}
