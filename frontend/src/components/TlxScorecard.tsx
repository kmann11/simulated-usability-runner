import { useEffect, useMemo, useState } from "react";
import type { FlowTlxReview, TlxSubscaleScore } from "../types";
import {
  baselineFromStudy,
  clearTlxBaseline,
  findSuggestedTlxBaseline,
  readTlxBaseline,
  saveCurrentAsTlxBaseline,
  subscaleDelta,
  studiesWithTlx,
  writeTlxBaseline,
  type TlxBaseline,
} from "../tlxCompare";

interface TlxScorecardProps {
  review: FlowTlxReview;
  experimentName: string;
  startUrl: string;
}

function loadTone(score: number): "low" | "medium" | "high" {
  if (score >= 67) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function formatDelta(delta: number | null): string {
  if (delta == null) return "";
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function SubscaleRow({
  subscale,
  baselineScore,
}: {
  subscale: TlxSubscaleScore;
  baselineScore?: number | null;
}) {
  const tone = loadTone(subscale.score);
  const delta = subscaleDelta(subscale.score, baselineScore);
  return (
    <div className={`tlx-subscale tlx-load-${tone}`}>
      <div className="tlx-subscale-head">
        <div>
          <strong>{subscale.name}</strong>
          <p className="muted small">{subscale.rationale}</p>
        </div>
        <div className="tlx-subscale-scores">
          <span className="tlx-score">{Math.round(subscale.score)}</span>
          {delta != null && (
            <span
              className={`tlx-delta ${delta > 0 ? "worse" : delta < 0 ? "better" : "same"}`}
              title="Change vs baseline (higher means more load)"
            >
              {formatDelta(delta)}
            </span>
          )}
        </div>
      </div>
      <div className="tlx-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(4, Math.min(100, subscale.score))}%` }} />
      </div>
    </div>
  );
}

export function TlxScorecard({ review, experimentName, startUrl }: TlxScorecardProps) {
  const [baseline, setBaseline] = useState<TlxBaseline | null>(null);
  const [compareId, setCompareId] = useState<string>("");
  const libraryOptions = useMemo(() => studiesWithTlx(), [review]);

  useEffect(() => {
    const saved = readTlxBaseline();
    if (saved) {
      setBaseline(saved);
      setCompareId(saved.source === "study" ? saved.id : "saved");
      return;
    }
    const suggested = findSuggestedTlxBaseline(experimentName, startUrl);
    if (suggested) {
      setBaseline(suggested);
      setCompareId(suggested.id);
    }
  }, [experimentName, startUrl, review]);

  const overallDelta = subscaleDelta(review.overall, baseline?.review.overall);
  const baselineById = useMemo(() => {
    const map = new Map<string, number>();
    for (const subscale of baseline?.review.subscales || []) {
      map.set(subscale.id, subscale.score);
    }
    return map;
  }, [baseline]);

  const handleSaveBaseline = () => {
    const next = saveCurrentAsTlxBaseline(review, experimentName, startUrl);
    setBaseline(next);
    setCompareId("saved");
  };

  const handleClearBaseline = () => {
    clearTlxBaseline();
    setBaseline(null);
    setCompareId("");
  };

  const handleCompareChange = (value: string) => {
    setCompareId(value);
    if (!value) {
      clearTlxBaseline();
      setBaseline(null);
      return;
    }
    if (value === "saved") {
      const saved = readTlxBaseline();
      if (saved?.source === "manual") {
        setBaseline(saved);
      } else {
        const next = saveCurrentAsTlxBaseline(review, experimentName, startUrl);
        setBaseline(next);
      }
      return;
    }
    const study = libraryOptions.find((item) => item.id === value);
    if (!study) return;
    const next = baselineFromStudy(study);
    if (!next) return;
    writeTlxBaseline(next);
    setBaseline(next);
  };

  return (
    <div className="scorecard tlx-scorecard">
      <p className="tlx-disclaimer">{review.disclaimer}</p>

      <div className="scorecard-overview">
        <div className="overall">
          <span className="muted small">Overall workload (Raw TLX avg)</span>
          <strong className="overall-num">
            {review.overall == null ? "N/A" : `${review.overall.toFixed(1)} / 100`}
          </strong>
          <span className="muted small">
            Higher means more predicted load ·{" "}
            {review.persona_reviews.length} traveler type
            {review.persona_reviews.length === 1 ? "" : "s"} ·{" "}
            {review.session_reviews.length} session
            {review.session_reviews.length === 1 ? "" : "s"}
          </span>
          {overallDelta != null && (
            <span
              className={`tlx-delta-inline ${
                overallDelta > 0 ? "worse" : overallDelta < 0 ? "better" : "same"
              }`}
            >
              {formatDelta(overallDelta)} vs baseline
            </span>
          )}
        </div>

        <div className="tlx-compare">
          <h4>Before / after compare</h4>
          <p className="muted small">
            Save this forecast as a baseline, or compare against a prior study from your library.
          </p>
          <div className="tlx-compare-controls">
            <label>
              <span className="sr-only">Compare to</span>
              <select
                value={compareId}
                onChange={(event) => handleCompareChange(event.target.value)}
              >
                <option value="">No comparison</option>
                <option value="saved">Saved TLX baseline</option>
                {libraryOptions.map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.title} ({new Date(study.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secondary" onClick={handleSaveBaseline}>
              Save as baseline
            </button>
            {baseline && (
              <button type="button" className="btn-link" onClick={handleClearBaseline}>
                Clear
              </button>
            )}
          </div>
          {baseline && (
            <p className="muted small">
              Comparing to {baseline.label}
              {baseline.saved_at
                ? ` · ${new Date(baseline.saved_at).toLocaleString()}`
                : ""}
            </p>
          )}
        </div>
      </div>

      <div className="tlx-subscale-list">
        {review.subscales.map((subscale) => (
          <SubscaleRow
            key={subscale.id}
            subscale={subscale}
            baselineScore={baselineById.get(subscale.id)}
          />
        ))}
      </div>

      {review.persona_reviews.length > 0 && (
        <div className="tlx-persona-block">
          <h4>By traveler type</h4>
          <div className="tlx-persona-grid">
            {review.persona_reviews.map((persona) => (
              <div key={persona.persona} className="tlx-persona-card">
                <div className="tlx-persona-head">
                  <strong>{persona.persona}</strong>
                  <span className="tlx-score">
                    {persona.overall == null ? "N/A" : Math.round(persona.overall)}
                  </span>
                </div>
                <p className="muted small">
                  {persona.session_count} session
                  {persona.session_count === 1 ? "" : "s"}
                </p>
                <ul>
                  {persona.subscales.map((subscale) => (
                    <li key={subscale.id}>
                      <span>{subscale.name}</span>
                      <span>{Math.round(subscale.score)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
