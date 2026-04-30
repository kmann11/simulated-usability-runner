import { useEffect, useRef, useState } from "react";
import { api, describeError } from "./api/client";
import { ConfigForm, type RunOptionsState } from "./components/ConfigForm";
import { EvidenceGallery } from "./components/EvidenceGallery";
import { HealthBadge } from "./components/HealthBadge";
import { HeuristicScorecard } from "./components/HeuristicScorecard";
import { MessageList } from "./components/MessageList";
import { RunLoadingCard } from "./components/RunLoadingCard";
import { SummaryCard } from "./components/SummaryCard";
import { DEFAULT_CONFIG } from "./defaultConfig";
import type { ExperimentConfig, RunJobStatus, RunResponse, ValidateResponse } from "./types";

type ResultTab = "run" | "heuristics" | "evidence";
type NoticeState = {
  title: string;
  variant: "warn" | "info";
  messages: string[];
};

export default function App() {
  const [config, setConfig] = useState<ExperimentConfig>(DEFAULT_CONFIG);
  const [options, setOptions] = useState<RunOptionsState>({
    include_heuristics: true,
    capture_screenshots: false,
  });
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [check, setCheck] = useState<ValidateResponse | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("run");
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runJob, setRunJob] = useState<RunJobStatus | null>(null);
  const [stoppingRun, setStoppingRun] = useState(false);
  const loadingRef = useRef<HTMLDivElement | null>(null);

  const busy = checking || running;
  const review = result?.heuristic_review ?? null;

  useEffect(() => {
    if (!running || !runJob?.job_id) return;
    if (runJob.status === "completed" || runJob.status === "failed" || runJob.status === "cancelled") {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const next = await api.getRunStatus(runJob.job_id);
        if (cancelled) return;
        setRunJob(next);

        if (next.status === "completed") {
          if (next.result) {
            setResult(next.result);
          } else {
            setError("The run finished, but no result payload came back.");
          }
          setStoppingRun(false);
          setRunning(false);
        } else if (next.status === "cancelled") {
          if (next.result) {
            setResult(next.result);
            setNotice({
              title: "Run stopped early",
              variant: "warn",
              messages: [
                `Showing partial results from ${next.progress.completed_sessions} of ${next.progress.total_sessions} planned sessions.`,
              ],
            });
          } else {
            setNotice({
              title: "Run stopped",
              variant: "info",
              messages: ["The run was stopped before any results were generated."],
            });
          }
          setStoppingRun(false);
          setRunning(false);
        } else if (next.status === "failed") {
          setError(next.error || "The run stopped before results were ready.");
          setStoppingRun(false);
          setRunning(false);
        }
      } catch (err) {
        if (cancelled) return;
        setError(describeError(err));
        setStoppingRun(false);
        setRunning(false);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [running, runJob?.job_id, runJob?.status]);

  useEffect(() => {
    if (!running) return;
    const handle = window.requestAnimationFrame(() => {
      loadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [running, runJob?.job_id]);

  const reset = () => {
    setConfig(DEFAULT_CONFIG);
    setCheck(null);
    setResult(null);
    setError(null);
    setNotice(null);
    setResultTab("run");
    setRunStartedAt(null);
    setRunJob(null);
    setStoppingRun(false);
  };

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setNotice(null);
    setCheck(null);
    try {
      setCheck(await api.validate(config));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setChecking(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    setCheck(null);
    setResult(null);
    setRunJob(null);
    setStoppingRun(false);
    setResultTab("run");
    setRunStartedAt(Date.now());
    try {
      const job = await api.startRun(config, options);
      setRunJob(job);

      if (job.status === "completed") {
        if (job.result) {
          setResult(job.result);
        } else {
          setError("The run finished, but no result payload came back.");
        }
        setRunning(false);
      } else if (job.status === "failed") {
        setError(job.error || "The run stopped before results were ready.");
        setRunning(false);
      }
    } catch (err) {
      setError(describeError(err));
      setRunning(false);
    }
  };

  const handleStopRun = async () => {
    if (!runJob?.job_id || stoppingRun || runJob.status === "cancelling") return;
    setStoppingRun(true);
    setNotice({
      title: "Stopping run",
      variant: "info",
      messages: ["We’re stopping the run and will return whatever has completed so far."],
    });
    try {
      const next = await api.cancelRun(runJob.job_id);
      setRunJob(next);
    } catch (err) {
      setStoppingRun(false);
      setError(describeError(err));
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>EG UXR Design + Site Review</h1>
          <p className="muted tagline">
            Run a quick flow and heuristic check on a live experience or prototype based on our segment profiles and heuristic principles.
          </p>
          <details className="app-intro">
            <summary>What is this?</summary>
            <p>
              This workflow runs a quick flow and heuristic check on a live experience or
              prototype using Playwright, our user segments, and our heuristic principles. You
              paste in a link, define the task, and tune the segment profile to shape how the
              run behaves. From there, it moves through the experience, captures pathing,
              friction, hesitation, backtracking, and failure points, and then layers on a
              heuristic read of the flow.
            </p>
            <p>
              The goal is to give a fast, structured view of how the experience is holding up
              for different segment conditions, where the biggest weak spots are, and what
              looks worth a closer look. It is meant to be a directional review tool, not a
              final judgment on the experience.
            </p>
          </details>
        </div>
        <HealthBadge />
      </header>

      <ConfigForm
        config={config}
        onChange={setConfig}
        options={options}
        onOptionsChange={setOptions}
        disabled={busy}
      />

      <div className="run-bar">
        <button type="button" className="btn-primary big" onClick={handleRun} disabled={busy}>
          {running ? "Running…" : "Run the test"}
        </button>
        <button type="button" className="btn-secondary" onClick={handleCheck} disabled={busy}>
          {checking ? "Checking…" : "Check setup"}
        </button>
        <div className="spacer" />
        <button type="button" className="btn-link" onClick={reset} disabled={busy}>
          Reset to defaults
        </button>
      </div>

      {running && (
        <div ref={loadingRef}>
          <RunLoadingCard
            config={config}
            options={options}
            startedAt={runStartedAt}
            job={runJob}
            onStop={handleStopRun}
            stopDisabled={stoppingRun || !runJob?.job_id}
          />
        </div>
      )}

      {error && <MessageList title="Something went wrong" variant="error" messages={[error]} />}
      {notice && <MessageList title={notice.title} variant={notice.variant} messages={notice.messages} />}

      {check && (
        <section className="card">
          <header className="card-header">
            <h3>Setup check</h3>
            <span className={`badge ${check.errors.length > 0 ? "badge-warn" : "badge-ok"}`}>
              {check.errors.length > 0 ? "Needs attention" : "Looks good"}
            </span>
          </header>

          {check.errors.length === 0 && check.warnings.length === 0 && (
            <p className="muted">Everything looks good. Click "Run the test" when ready.</p>
          )}

          <MessageList title="Please fix these" variant="error" messages={check.errors} />
          <MessageList title="Heads up" variant="warn" messages={check.warnings} />
        </section>
      )}

      {result && (
        <div className="results-shell">
          <nav className="result-tabs">
            <button
              type="button"
              className={resultTab === "run" ? "tab active" : "tab"}
              onClick={() => setResultTab("run")}
            >
              Run results
            </button>
            <button
              type="button"
              className={resultTab === "heuristics" ? "tab active" : "tab"}
              onClick={() => setResultTab("heuristics")}
              disabled={!review}
              title={review ? undefined : "Turn on heuristic review before running"}
            >
              Heuristic review
            </button>
            <button
              type="button"
              className={resultTab === "evidence" ? "tab active" : "tab"}
              onClick={() => setResultTab("evidence")}
              disabled={!review}
              title={review ? undefined : "Turn on heuristic review before running"}
            >
              Evidence
            </button>
          </nav>

          {resultTab === "run" && <SummaryCard result={result} />}
          {resultTab === "heuristics" && review && (
            <section className="card">
              <header className="card-header">
                <h3>Heuristic review</h3>
                <span className="badge badge-muted">
                  {review.aggregate_scores.length} heuristic
                  {review.aggregate_scores.length === 1 ? "" : "s"}
                </span>
              </header>
              <HeuristicScorecard review={review} />
            </section>
          )}
          {resultTab === "evidence" && review && (
            <section className="card">
              <header className="card-header">
                <h3>Evidence</h3>
                <span className="badge badge-muted">
                  {review.aggregate_scores.reduce(
                    (sum, score) => sum + score.evidence.length,
                    0,
                  )}{" "}
                  items
                </span>
              </header>
              <EvidenceGallery review={review} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
