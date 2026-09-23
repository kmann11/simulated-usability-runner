import { useMemo, useState } from "react";
import { useCatalog } from "../catalog";
import { buildStudyQaFindings, type QaFinding } from "../studyQa";
import type { ExperimentConfig } from "../types";
import type { RunOptionsState } from "./ConfigForm";

interface StudyDesignQaProps {
  config: ExperimentConfig;
  options: RunOptionsState;
}

const SEVERITY_LABEL: Record<QaFinding["severity"], string> = {
  blocker: "Fix first",
  risk: "Risk",
  watch: "Watch",
  good: "Ready",
};

const CATEGORY_LABEL: Record<QaFinding["category"], string> = {
  protocol: "Study setup",
  segments: "Traveler types",
  evidence: "Screenshots",
  synthetic_fit: "What this can answer",
};

function severityRank(severity: QaFinding["severity"]) {
  return { blocker: 0, risk: 1, watch: 2, good: 3 }[severity];
}

export function StudyDesignQa({ config, options }: StudyDesignQaProps) {
  const { segments } = useCatalog();
  const [open, setOpen] = useState(true);
  const findings = useMemo(
    () =>
      buildStudyQaFindings(config, options, segments).sort(
        (a, b) => severityRank(a.severity) - severityRank(b.severity),
      ),
    [config, options, segments],
  );
  const blockers = findings.filter((finding) => finding.severity === "blocker").length;
  const risks = findings.filter((finding) => finding.severity === "risk").length;
  const watches = findings.filter((finding) => finding.severity === "watch").length;
  const status = blockers > 0 ? "Fix first" : risks > 0 ? "Directional only" : watches > 0 ? "Watch" : "Ready";

  return (
    <section className="card qa-card">
      <header className="card-header">
        <div>
          <h3>Study design check</h3>
          <p className="muted small">
            Quick review before you run. Catches missing links, vague tasks, and other common
            setup issues.
          </p>
        </div>
        <button
          type="button"
          className={`qa-status qa-status-${blockers > 0 ? "blocker" : risks > 0 ? "risk" : watches > 0 ? "watch" : "good"}`}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          {status}
        </button>
      </header>

      {open && (
        <div className="qa-list">
          {findings.map((finding) => (
            <article key={`${finding.category}-${finding.title}`} className={`qa-item ${finding.severity}`}>
              <div className="qa-item-head">
                <span className={`badge qa-badge-${finding.severity}`}>
                  {SEVERITY_LABEL[finding.severity]}
                </span>
                <span className="signal-tag">{CATEGORY_LABEL[finding.category]}</span>
              </div>
              <h4>{finding.title}</h4>
              <p>{finding.detail}</p>
              <p className="qa-suggestion">
                <strong>Suggested move:</strong> {finding.suggestion}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
