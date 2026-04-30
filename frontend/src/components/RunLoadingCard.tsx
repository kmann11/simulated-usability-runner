import { useEffect, useMemo, useState } from "react";
import type { ExperimentConfig, RunJobStatus } from "../types";
import type { RunOptionsState } from "./ConfigForm";

interface RunLoadingCardProps {
  config: ExperimentConfig;
  options: RunOptionsState;
  startedAt: number | null;
  job?: RunJobStatus | null;
  onStop?: () => void;
  stopDisabled?: boolean;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function estimateRunDuration(config: ExperimentConfig, options: RunOptionsState): number {
  const sessionCount = Math.max(1, config.personas.length * config.runs_per_persona);
  const basePerSession = clamp(Math.round(config.run_timeout_s * 0.28), 25, 55);
  const screenshotPenalty = options.capture_screenshots ? 6 : 0;
  const heuristicPenalty = options.include_heuristics ? 2 : 0;
  const baseOverhead = 20;
  return baseOverhead + sessionCount * (basePerSession + screenshotPenalty + heuristicPenalty);
}

function phaseLabel(progress: number): string {
  if (progress < 0.15) return "Getting the run set up.";
  if (progress < 0.7) return "Walking through the flow across your selected segment profiles.";
  if (progress < 0.92) return "Pulling together friction signals, paths, and weak spots.";
  return "Wrapping up the results dashboard.";
}

export function RunLoadingCard({
  config,
  options,
  startedAt,
  job,
  onStop,
  stopDisabled = false,
}: RunLoadingCardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const fallbackSessionCount = Math.max(1, config.personas.length * config.runs_per_persona);
  const fallbackEstimateSeconds = useMemo(
    () => estimateRunDuration(config, options),
    [config, options],
  );
  const fallbackElapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const fallbackRemainingSeconds = Math.max(0, fallbackEstimateSeconds - fallbackElapsedSeconds);
  const fallbackProgress =
    fallbackEstimateSeconds > 0 ? Math.min(0.96, fallbackElapsedSeconds / fallbackEstimateSeconds) : 0;
  const sessionCount = job?.progress.total_sessions ?? fallbackSessionCount;
  const completedSessions = job?.progress.completed_sessions ?? 0;
  const estimateSeconds = job?.progress.estimated_total_seconds ?? fallbackEstimateSeconds;
  const remainingSeconds = job?.progress.estimated_remaining_seconds ?? fallbackRemainingSeconds;
  const progress = job?.progress.percent ?? fallbackProgress;
  const segmentCount = config.personas.length;
  const phaseText = job?.progress.message || phaseLabel(progress);
  const currentPersona = job?.progress.current_persona;
  const currentSession = job?.progress.current_session;
  const stopping = job?.status === "cancelling";

  return (
    <section className="card run-loading-card" aria-live="polite">
      <header className="run-loading-head">
        <div>
          <p className="run-loading-kicker">Run in progress</p>
          <h3>{currentPersona ? `Running ${currentPersona} now.` : "We're walking the flow now."}</h3>
        </div>
        <div className="run-loading-actions">
          <span className="badge badge-info">
            {completedSessions > 0 ? `${completedSessions}/${sessionCount} complete` : "Estimated"}
          </span>
          {onStop ? (
            <button
              type="button"
              className="btn-secondary run-loading-stop"
              onClick={onStop}
              disabled={stopDisabled || stopping}
            >
              {stopping ? "Stopping…" : "Stop run"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="run-loading-overview">
        <div className="run-loading-time">
          <span className="muted small">Estimated time left</span>
          <strong>
            {remainingSeconds > 0 ? formatDuration(remainingSeconds) : "Almost there"}
          </strong>
          <p className="muted small">
            About {formatDuration(estimateSeconds)} total for this setup.
          </p>
        </div>

        <div className="run-loading-facts">
          <span>{sessionCount} sessions</span>
          <span>{completedSessions} done</span>
          <span>{segmentCount} segment profile{segmentCount === 1 ? "" : "s"}</span>
          <span>{config.runs_per_persona} run{config.runs_per_persona === 1 ? "" : "s"} each</span>
          {currentSession ? <span>Session {currentSession} in flight</span> : null}
          {options.capture_screenshots && <span>Screenshots on</span>}
        </div>
      </div>

      <div className="run-loading-meter" aria-hidden="true">
        <div className="run-loading-meter-fill" style={{ width: `${Math.max(8, progress * 100)}%` }} />
      </div>

      <p className="run-loading-phase">{phaseText}</p>

      <p className="muted small run-loading-note">
        {job
          ? stopping
            ? "We’ve sent the stop request and are wrapping up the current work before returning partial results."
            : "This progress is coming from the backend as each session completes, so the estimate tightens up as the run goes."
          : "This estimate is based on your current run settings and usually lands pretty close, but slower pages and heavier flows can push it out a bit."}
      </p>
    </section>
  );
}
