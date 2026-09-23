import { useEffect, useMemo, useState } from "react";
import { formatLinkLabel } from "../linkPreview";
import { signInCopyForUrl } from "../prototypeAuth";
import type { ExperimentConfig, RunJobStatus } from "../types";
import type { RunOptionsState } from "./ConfigForm";

interface RunLoadingCardProps {
  config: ExperimentConfig;
  options: RunOptionsState;
  startedAt: number | null;
  job?: RunJobStatus | null;
  onStop?: () => void;
  onAuthComplete?: () => void;
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
  const tlxPenalty = options.include_tlx ? 1 : 0;
  const baseOverhead = 20;
  return (
    baseOverhead +
    sessionCount * (basePerSession + screenshotPenalty + heuristicPenalty + tlxPenalty)
  );
}

function phaseLabel(progress: number): string {
  if (progress < 0.15) return "Getting the run set up.";
  if (progress < 0.7) return "Walking through the flow with your selected traveler types.";
  if (progress < 0.92) return "Pulling together where people hesitated, went back, or got stuck.";
  return "Wrapping up your results.";
}

export function RunLoadingCard({
  config,
  options,
  startedAt,
  job,
  onStop,
  onAuthComplete,
  stopDisabled = false,
}: RunLoadingCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const signInCopy = useMemo(() => signInCopyForUrl(config.start_url), [config.start_url]);

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
  const waitingForLogin = job?.progress.phase === "waiting_for_login";
  const linkLabel = formatLinkLabel(config.start_url);
  const taskSteps = config.tasks.map((task) => task.trim()).filter(Boolean);
  const openingPhase = progress < 0.2;

  return (
    <section className="card run-loading-card" aria-live="polite">
      <header className="run-loading-head">
        <div>
          <p className="run-loading-kicker">Opening your link and walking through your steps</p>
          <h3>
            {waitingForLogin && signInCopy
              ? signInCopy.waitingTitle
              : openingPhase
                ? `Opening ${linkLabel || "your prototype"}…`
                : currentPersona
                  ? `${currentPersona} is trying your steps now`
                  : "Walking through your steps…"}
          </h3>
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

      <div className="run-loading-target">
        <div className="run-loading-target-row">
          <span className="muted small">Opening</span>
          <strong className="run-loading-url" title={config.start_url}>
            {linkLabel || config.start_url || "Not set"}
          </strong>
        </div>
        {taskSteps.length > 0 && (
          <ol className="run-loading-tasks muted small">
            {taskSteps.slice(0, 4).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
            {taskSteps.length > 4 && <li>+{taskSteps.length - 4} more steps</li>}
          </ol>
        )}
      </div>

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
          <span>{sessionCount} tries total</span>
          <span>{completedSessions} done</span>
          <span>
            {segmentCount} traveler type{segmentCount === 1 ? "" : "s"}
          </span>
          <span>
            {config.runs_per_persona} try{config.runs_per_persona === 1 ? "" : "ies"} each
          </span>
          {currentSession ? <span>Try {currentSession} in progress</span> : null}
          {options.capture_screenshots && <span>Screenshots on</span>}
        </div>
      </div>

      <div className="run-loading-meter" aria-hidden="true">
        <div className="run-loading-meter-fill" style={{ width: `${Math.max(8, progress * 100)}%` }} />
      </div>

      <p className="run-loading-phase">{phaseText}</p>

      {waitingForLogin && onAuthComplete && signInCopy && (
        <div
          className="figma-login-panel"
          role="region"
          aria-label={`Sign in to ${signInCopy.providerLabel}`}
        >
          <h4>{signInCopy.panelTitle}</h4>
          <ol className="figma-login-steps muted small">
            {signInCopy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <button type="button" className="btn-primary" onClick={onAuthComplete}>
            {signInCopy.continueButton}
          </button>
        </div>
      )}

      <p className="muted small run-loading-note">
        {job
          ? stopping
            ? "We’ve sent the stop request and are wrapping up before returning partial results."
            : "Progress updates as each try finishes, so the time estimate gets more accurate as we go."
          : "This estimate is based on your settings. Slower pages or longer tasks can push it out a bit."}
      </p>
    </section>
  );
}
