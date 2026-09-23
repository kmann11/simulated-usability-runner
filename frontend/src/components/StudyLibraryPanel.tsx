import { useMemo, useState } from "react";
import {
  deleteStudy,
  readStudies,
  saveStudy,
  type SavedStudy,
  type StudyMetadata,
} from "../studyLibrary";
import type { ExperimentConfig, RunResponse } from "../types";
import type { RunOptionsState } from "./ConfigForm";

interface StudyLibraryPanelProps {
  config: ExperimentConfig;
  options: RunOptionsState;
  result: RunResponse | null;
  metadata: StudyMetadata;
  onMetadataChange: (metadata: StudyMetadata) => void;
  onLoadStudy: (study: SavedStudy) => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function StudyLibraryPanel({
  config,
  options,
  result,
  metadata,
  onMetadataChange,
  onLoadStudy,
}: StudyLibraryPanelProps) {
  const [studies, setStudies] = useState<SavedStudy[]>(() => readStudies());
  const [query, setQuery] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return studies;
    return studies.filter((study) => {
      const haystack = [
        study.title,
        study.product_area,
        study.journey_stage,
        study.owner,
        study.decision_question,
        study.config.start_url,
        ...study.tags,
        ...study.result.persona_summaries.map((summary) => summary.segment_name || summary.persona),
        ...(study.result.heuristic_review?.aggregate_scores.map((score) => score.heuristic_name) ?? []),
        ...(study.result.tlx_review?.subscales.map((score) => score.name) ?? []),
        study.result.tlx_review ? "synthetic tlx workload" : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, studies]);

  const update = <K extends keyof StudyMetadata>(key: K, value: StudyMetadata[K]) => {
    onMetadataChange({ ...metadata, [key]: value });
  };

  const handleSave = () => {
    if (!result) return;
    const saved = saveStudy(config, options, result, metadata);
    setStudies(readStudies());
    setSavedMessage(`Saved ${saved.title} to the study library.`);
  };

  const handleDelete = (id: string) => {
    deleteStudy(id);
    setStudies(readStudies());
    setSavedMessage(null);
  };

  return (
    <section className="card library-card">
      <header className="card-header">
        <div>
          <h3>Study library</h3>
          <p className="muted small">
            Save directional runs so you can find and compare them later.
          </p>
        </div>
        <span className="badge badge-muted">{studies.length} saved</span>
      </header>

      <div className="library-metadata">
        <label>
          <span>Decision this informs</span>
          <input
            type="text"
            value={metadata.decision_question}
            onChange={(event) => update("decision_question", event.target.value)}
            placeholder="e.g. Should checkout trust cues change before launch?"
          />
        </label>
        <div className="grid-2">
          <label>
            <span>Product area</span>
            <input
              type="text"
              value={metadata.product_area}
              onChange={(event) => update("product_area", event.target.value)}
              placeholder="e.g. Lodging checkout"
            />
          </label>
          <label>
            <span>Journey stage</span>
            <input
              type="text"
              value={metadata.journey_stage}
              onChange={(event) => update("journey_stage", event.target.value)}
              placeholder="e.g. Payment"
            />
          </label>
          <label>
            <span>Owner</span>
            <input
              type="text"
              value={metadata.owner}
              onChange={(event) => update("owner", event.target.value)}
              placeholder="e.g. UXR / Checkout pod"
            />
          </label>
          <label>
            <span>Tags</span>
            <input
              type="text"
              value={metadata.tags}
              onChange={(event) => update("tags", event.target.value)}
              placeholder="trust, fees, mobile"
            />
          </label>
        </div>
        <button type="button" className="btn-secondary" onClick={handleSave} disabled={!result}>
          Save current run
        </button>
        {savedMessage && <p className="muted small">{savedMessage}</p>}
      </div>

      <label className="library-search">
        <span>Search saved studies</span>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="traveler type, product area, tag"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="empty">
          {studies.length === 0
            ? "No saved studies yet. Run a study, then save it here."
            : "No saved studies match that search."}
        </p>
      ) : (
        <div className="library-list">
          {filtered.map((study) => (
            <article key={study.id} className="library-study">
              <div className="library-study-head">
                <div>
                  <h4>{study.title}</h4>
                  <p className="muted small">
                    {formatDate(study.created_at)}
                    {study.product_area ? ` · ${study.product_area}` : ""}
                    {study.journey_stage ? ` · ${study.journey_stage}` : ""}
                  </p>
                </div>
                <span className="badge badge-muted">
                  {percent(study.result.summary.success_rate)} complete
                </span>
              </div>
              {study.decision_question && <p>{study.decision_question}</p>}
              <div className="signal-row">
                {study.tags.slice(0, 5).map((tag) => (
                  <span key={tag} className="signal-tag">
                    {tag}
                  </span>
                ))}
                {study.owner && <span className="signal-tag">{study.owner}</span>}
              </div>
              <div className="library-actions">
                <button type="button" className="btn-secondary" onClick={() => onLoadStudy(study)}>
                  Reopen
                </button>
                <button type="button" className="btn-link" onClick={() => handleDelete(study.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
