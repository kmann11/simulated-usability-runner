import { useState } from "react";
import type { RunResponse } from "../types";
import {
  copyFindingsSummary,
  downloadFindingsJson,
  downloadFindingsMarkdown,
} from "../findingsExport";

interface FindingsExportPanelProps {
  result: RunResponse;
}

export function FindingsExportPanel({ result }: FindingsExportPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyFindingsSummary(result);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <section className="card findings-export-card" aria-label="Export findings">
      <header className="card-header">
        <div>
          <h3>Export findings</h3>
          <p className="muted small">
            Download this run&apos;s summary, design scorecard, and Synthetic TLX. Separate from
            sharing the study setup link above.
          </p>
        </div>
      </header>
      <div className="findings-export-actions">
        <button type="button" className="btn-secondary" onClick={() => downloadFindingsMarkdown(result)}>
          Download Markdown
        </button>
        <button type="button" className="btn-secondary" onClick={() => downloadFindingsJson(result)}>
          Download JSON
        </button>
        <button type="button" className="btn-secondary" onClick={() => void handleCopy()}>
          {copied ? "Copied!" : "Copy findings summary"}
        </button>
      </div>
      <p className="muted small">
        Copy findings summary is Slack-friendly plain text. It is not a shareable study setup link.
      </p>
    </section>
  );
}
