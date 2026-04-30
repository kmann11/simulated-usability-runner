import { useState } from "react";
import { api } from "../api/client";
import type { HeuristicScore } from "../types";

interface HeuristicCardProps {
  score: HeuristicScore;
  defaultExpanded?: boolean;
}

const SEVERITY_LABEL: Record<HeuristicScore["severity"], string> = {
  low: "Looks fine",
  medium: "Worth a look",
  high: "Needs attention",
};

export function HeuristicCard({ score, defaultExpanded = false }: HeuristicCardProps) {
  const [open, setOpen] = useState(defaultExpanded);

  return (
    <article className={`heuristic-card severity-${score.severity}`}>
      <button
        type="button"
        className="heuristic-head"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <div className="heuristic-title">
          <span className="caret">{open ? "▾" : "▸"}</span>
          <h4>{score.heuristic_name}</h4>
        </div>
        <div className="heuristic-meta">
          <span className={`badge severity-${score.severity}`}>
            {SEVERITY_LABEL[score.severity]}
          </span>
          <span className="score-pill">{score.score}/5</span>
          <span className="confidence" title="How confident this score is, based on observed steps">
            {Math.round(score.confidence * 100)}% confident
          </span>
        </div>
      </button>

      {open && (
        <div className="heuristic-body">
          <p className="heuristic-summary">{score.summary}</p>
          {score.recommendation && (
            <p className="heuristic-rec">
              <strong>Try:</strong> {score.recommendation}
            </p>
          )}

          {score.evidence.length > 0 && (
            <div className="heuristic-evidence">
              <h5>Evidence ({score.evidence.length})</h5>
              <ul>
                {score.evidence.map((ev, idx) => (
                  <li key={`${ev.persona}-${ev.step_index}-${idx}`}>
                    {ev.screenshot_path && (
                      <a
                        className="evidence-thumb"
                        href={api.artifactUrl(ev.screenshot_path)}
                        target="_blank"
                        rel="noreferrer"
                        title="Open screenshot in new tab"
                      >
                        <img
                          src={api.artifactUrl(ev.screenshot_path)}
                          alt={`Step ${ev.step_index} for ${ev.persona}`}
                          loading="lazy"
                        />
                      </a>
                    )}
                    <div className="evidence-text">
                      <div className="evidence-meta">
                        <strong>{ev.persona}</strong>
                        <span className="muted">step {ev.step_index}</span>
                        <span className="signal-tag">{ev.signal_type.replace(/_/g, " ")}</span>
                      </div>
                      <p>{ev.note}</p>
                      {ev.url && (
                        <p className="muted small truncate" title={ev.url}>
                          {ev.url}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {score.evidence.length === 0 && (
            <p className="muted small">No specific evidence captured for this heuristic.</p>
          )}
        </div>
      )}
    </article>
  );
}
