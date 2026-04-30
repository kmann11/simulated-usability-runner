import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { EvidenceRef, FlowHeuristicReview } from "../types";

interface GalleryItem extends EvidenceRef {
  heuristic_id: string;
  heuristic_name: string;
}

interface EvidenceGalleryProps {
  review: FlowHeuristicReview;
}

export function EvidenceGallery({ review }: EvidenceGalleryProps) {
  const allItems = useMemo<GalleryItem[]>(() => {
    const seen = new Set<string>();
    const items: GalleryItem[] = [];
    for (const aggregate of review.aggregate_scores) {
      for (const ev of aggregate.evidence) {
        const key = `${aggregate.heuristic_id}:${ev.persona}:${ev.step_index}:${ev.signal_type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          ...ev,
          heuristic_id: aggregate.heuristic_id,
          heuristic_name: aggregate.heuristic_name,
        });
      }
    }
    items.sort((a, b) => {
      if (a.persona !== b.persona) return a.persona.localeCompare(b.persona);
      return a.step_index - b.step_index;
    });
    return items;
  }, [review]);

  const personas = useMemo(() => {
    return Array.from(new Set(allItems.map((item) => item.persona))).sort();
  }, [allItems]);

  const heuristics = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const item of allItems) byId[item.heuristic_id] = item.heuristic_name;
    return Object.entries(byId).sort(([, a], [, b]) => a.localeCompare(b));
  }, [allItems]);

  const [personaFilter, setPersonaFilter] = useState<string>("all");
  const [heuristicFilter, setHeuristicFilter] = useState<string>("all");
  const [flaggedOnly, setFlaggedOnly] = useState(true);

  const flaggedHeuristicIds = useMemo(() => {
    return new Set(
      review.aggregate_scores
        .filter((s) => s.severity === "medium" || s.severity === "high")
        .map((s) => s.heuristic_id),
    );
  }, [review]);

  const filtered = allItems.filter((item) => {
    if (personaFilter !== "all" && item.persona !== personaFilter) return false;
    if (heuristicFilter !== "all" && item.heuristic_id !== heuristicFilter) return false;
    if (flaggedOnly && !flaggedHeuristicIds.has(item.heuristic_id)) return false;
    return true;
  });

  if (allItems.length === 0) {
    return (
      <p className="muted">
        No captured evidence yet. Turn on "Capture screenshots" in advanced settings before
        running for a richer gallery.
      </p>
    );
  }

  return (
    <div className="evidence-gallery">
      <div className="filters">
        <label>
          <span>Tester</span>
          <select
            value={personaFilter}
            onChange={(event) => setPersonaFilter(event.target.value)}
          >
            <option value="all">All</option>
            {personas.map((persona) => (
              <option key={persona} value={persona}>
                {persona}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Heuristic</span>
          <select
            value={heuristicFilter}
            onChange={(event) => setHeuristicFilter(event.target.value)}
          >
            <option value="all">All</option>
            {heuristics.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(event) => setFlaggedOnly(event.target.checked)}
          />
          <span>Show only flagged evidence</span>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No evidence matches the current filters.</p>
      ) : (
        <ul className="evidence-grid">
          {filtered.map((item, idx) => (
            <li key={`${item.heuristic_id}-${item.persona}-${item.step_index}-${idx}`}>
              {item.screenshot_path ? (
                <a
                  className="evidence-thumb large"
                  href={api.artifactUrl(item.screenshot_path)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={api.artifactUrl(item.screenshot_path)}
                    alt={`${item.persona} step ${item.step_index}`}
                    loading="lazy"
                  />
                </a>
              ) : (
                <div className="evidence-thumb large placeholder">
                  <span>No screenshot</span>
                </div>
              )}
              <div className="evidence-text">
                <div className="evidence-meta">
                  <strong>{item.persona}</strong>
                  <span className="muted">step {item.step_index}</span>
                </div>
                <div className="signal-tag">{item.heuristic_name}</div>
                <p>{item.note}</p>
                {item.url && (
                  <p className="muted small truncate" title={item.url}>
                    {item.url}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
