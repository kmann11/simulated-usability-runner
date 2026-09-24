import { useState } from "react";
import type { ExperimentConfig } from "../types";
import type { RunOptionsState } from "./ConfigForm";
import type { StudyMetadata } from "../studyLibrary";
import { buildShareUrl, parseShareInput, type SharedStudySetup } from "../studyShare";

interface StudySharePanelProps {
  config: ExperimentConfig;
  options: RunOptionsState;
  metadata: StudyMetadata;
  disabled?: boolean;
  onOpenShared: (setup: SharedStudySetup) => void;
}

export function StudySharePanel({
  config,
  options,
  metadata,
  disabled,
  onOpenShared,
}: StudySharePanelProps) {
  const [copied, setCopied] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);

  const payload: SharedStudySetup = { v: 1, config, options, metadata };

  const handleCopy = async () => {
    const url = buildShareUrl(payload);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link and send it to your teammate:", url);
    }
  };

  const handleOpenPasted = () => {
    const setup = parseShareInput(pasteValue);
    if (!setup) {
      setPasteError("That link doesn’t look right. Paste the full link your teammate sent you.");
      return;
    }
    setPasteError(null);
    setPasteValue("");
    setShowPaste(false);
    onOpenShared(setup);
  };

  return (
    <section className="card share-card">
      <header className="card-header">
        <div>
          <h3>Share with your team</h3>
          <p className="muted small">
            Copies the study setup only (link, tasks, testers, options), not results. Your teammate
            still needs a connected runner to click Open link &amp; run test. No files to upload.
          </p>
        </div>
      </header>
      <div className="share-actions">
        <button type="button" className="btn-secondary" onClick={() => void handleCopy()} disabled={disabled}>
          {copied ? "Link copied!" : "Copy link to share"}
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setShowPaste((open) => !open);
            setPasteError(null);
          }}
          disabled={disabled}
        >
          {showPaste ? "Hide" : "Someone sent you a link?"}
        </button>
      </div>
      {showPaste && (
        <div className="share-paste">
          <label>
            <span>Paste their link here</span>
            <input
              type="text"
              value={pasteValue}
              onChange={(event) => {
                setPasteValue(event.target.value);
                setPasteError(null);
              }}
              placeholder="Paste the full link from Slack or email"
              disabled={disabled}
            />
          </label>
          {pasteError && <p className="share-error">{pasteError}</p>}
          <button type="button" className="btn-primary" onClick={handleOpenPasted} disabled={disabled || !pasteValue.trim()}>
            Open shared study
          </button>
        </div>
      )}
    </section>
  );
}
