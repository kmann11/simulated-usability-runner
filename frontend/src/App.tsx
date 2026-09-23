import { useCallback, useEffect, useRef, useState } from "react";
import { api, describeError } from "./api/client";
import { ConfigForm, type RunOptionsState } from "./components/ConfigForm";
import { EvidenceGallery } from "./components/EvidenceGallery";
import { HealthBadge } from "./components/HealthBadge";
import { HeuristicScorecard } from "./components/HeuristicScorecard";
import { MessageList } from "./components/MessageList";
import { RunLoadingCard } from "./components/RunLoadingCard";
import { StudySharePanel } from "./components/StudySharePanel";
import { StudyLibraryPanel } from "./components/StudyLibraryPanel";
import { SummaryCard } from "./components/SummaryCard";
import { TlxScorecard } from "./components/TlxScorecard";
import { DEFAULT_CONFIG } from "./defaultConfig";
import { StudyDesignQa } from "./components/StudyDesignQa";
import { clearShareFromLocation, readShareFromLocation, type SharedStudySetup } from "./studyShare";
import { configForRun, signInCopyForUrl } from "./prototypeAuth";
import { isValidPrototypeUrl } from "./linkPreview";
import { EMPTY_STUDY_METADATA, type SavedStudy, type StudyMetadata } from "./studyLibrary";
import type { ExperimentConfig, HealthResponse, RunJobStatus, RunResponse, ValidateResponse } from "./types";

type ResultTab = "run" | "heuristics" | "tlx" | "evidence";
type NoticeState = {
  title: string;
  variant: "warn" | "info";
  messages: string[];
};

export default function App() {
  const [config, setConfig] = useState<ExperimentConfig>(DEFAULT_CONFIG);
  const [options, setOptions] = useState<RunOptionsState>({
    include_heuristics: true,
    include_tlx: true,
    capture_screenshots: true,
    figma_sign_in: true,
    sign_in_before_run: true,
  });
  const [studyMetadata, setStudyMetadata] = useState<StudyMetadata>(EMPTY_STUDY_METADATA);
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
  const [interactiveAuthAvailable, setInteractiveAuthAvailable] = useState(true);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const busy = checking || running;
  const review = result?.heuristic_review ?? null;
  const tlxReview = result?.tlx_review ?? null;

  const handleHealth = useCallback((health: HealthResponse | null) => {
    if (!health) return;
    setInteractiveAuthAvailable(health.interactive_auth_available !== false);
  }, []);

  useEffect(() => {
    if (interactiveAuthAvailable) return;
    if (options.sign_in_before_run === false) return;
    setOptions((current) => ({
      ...current,
      sign_in_before_run: false,
      figma_sign_in: false,
    }));
  }, [interactiveAuthAvailable, options.sign_in_before_run]);

  const applySharedSetup = (setup: SharedStudySetup, sourceLabel: string) => {
    setConfig(setup.config);
    setOptions({
      include_heuristics: setup.options.include_heuristics,
      include_tlx: setup.options.include_tlx ?? true,
      capture_screenshots: setup.options.capture_screenshots,
      sign_in_before_run: setup.options.sign_in_before_run ?? setup.options.figma_sign_in ?? true,
      figma_sign_in: setup.options.figma_sign_in,
    });
    setStudyMetadata(setup.metadata);
    setCheck(null);
    setResult(null);
    setError(null);
    setNotice({
      title: "Shared study opened",
      variant: "info",
      messages: [
        `${sourceLabel} Review the prototype link and tasks, then click Run the test when ready.`,
      ],
    });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  useEffect(() => {
    const shared = readShareFromLocation();
    if (!shared) return;
    applySharedSetup(shared, "Loaded from a teammate’s link.");
    clearShareFromLocation();
    // Only run when the page first loads with a share hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                `Showing partial results from ${next.progress.completed_sessions} of ${next.progress.total_sessions} planned tries.`,
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

  useEffect(() => {
    if (!result) return;
    const handle = window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [result]);

  const reset = () => {
    setConfig(DEFAULT_CONFIG);
    setOptions({
      include_heuristics: true,
      include_tlx: true,
      capture_screenshots: true,
      figma_sign_in: true,
      sign_in_before_run: true,
    });
    setCheck(null);
    setResult(null);
    setError(null);
    setNotice(null);
    setResultTab("run");
    setRunStartedAt(null);
    setRunJob(null);
    setStoppingRun(false);
    setStudyMetadata(EMPTY_STUDY_METADATA);
  };

  const handleLoadStudy = (study: SavedStudy) => {
    setConfig(study.config);
    setOptions({
      include_heuristics: study.options.include_heuristics,
      include_tlx: study.options.include_tlx ?? true,
      capture_screenshots: study.options.capture_screenshots,
      sign_in_before_run: study.options.sign_in_before_run ?? study.options.figma_sign_in ?? true,
      figma_sign_in: study.options.figma_sign_in,
    });
    setResult(study.result);
    setCheck(null);
    setError(null);
    setNotice({
      title: "Saved study reopened",
      variant: "info",
      messages: [`Loaded ${study.title} from the study library.`],
    });
    setResultTab("run");
    setStudyMetadata({
      product_area: study.product_area,
      journey_stage: study.journey_stage,
      owner: study.owner,
      tags: study.tags.join(", "),
      decision_question: study.decision_question,
    });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setNotice(null);
    setCheck(null);
    try {
      setCheck(await api.validate(configForRun(config, options, interactiveAuthAvailable)));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setChecking(false);
    }
  };

  const preflightRun = (): string[] => {
    const issues: string[] = [];
    if (!config.start_url.trim()) {
      issues.push("Add your prototype link first, the page where the test should start.");
    } else if (!isValidPrototypeUrl(config.start_url)) {
      issues.push("That link doesn’t look right. It should start with https:// and open in your browser.");
    }
    if (config.tasks.map((task) => task.trim()).filter(Boolean).length === 0) {
      issues.push("Add at least one step describing what they should try to do.");
    }
    if (config.personas.length === 0) {
      issues.push("Pick at least one traveler type under “Who should try it?”");
    }
    return issues;
  };

  const handleRun = async () => {
    const preflight = preflightRun();
    if (preflight.length > 0) {
      setError(null);
      setNotice({
        title: "A few things to fix first",
        variant: "warn",
        messages: preflight,
      });
      return;
    }

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
      const job = await api.startRun(
        configForRun(config, options, interactiveAuthAvailable),
        options,
      );
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

  const handleAuthComplete = async () => {
    if (!runJob?.job_id) return;
    try {
      const next = await api.completeRunAuth(runJob.job_id);
      setRunJob(next);
      const copy = signInCopyForUrl(config.start_url);
      setNotice({
        title: "Signed in",
        variant: "info",
        messages: [
          copy?.successNotice ??
            "Thanks. We're saving your session and starting the walkthrough.",
        ],
      });
    } catch (err) {
      setError(describeError(err));
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
            See how different kinds of users might get through your prototype, before live research.
          </p>
          <p className="quick-start-lead">
            Paste a link, write what you want them to try, pick who they are, then run. Takes a few
            minutes.
          </p>
          <details className="app-intro">
            <summary>Learn more about this tool</summary>
            <p>
              This runs automated walkthroughs on a link you provide: a Figma prototype, a GitHub
              preview, a design preview, staging, or a live page. You describe the tasks; we
              simulate different traveler types trying to complete them.
            </p>
            <p>
              You get a summary of where people hesitated, clicked wrong, backtracked, or gave up,
              plus an optional design scorecard. It&apos;s a quick directional check, not a
              replacement for talking to real customers.
            </p>
          </details>
        </div>
        <HealthBadge onHealth={handleHealth} />
      </header>

      <ConfigForm
        config={config}
        onChange={setConfig}
        options={options}
        onOptionsChange={setOptions}
        disabled={busy}
        interactiveAuthAvailable={interactiveAuthAvailable}
      />

      <StudyDesignQa config={config} options={options} />

      <StudySharePanel
        config={config}
        options={options}
        metadata={studyMetadata}
        disabled={busy}
        onOpenShared={(setup) => applySharedSetup(setup, "Opened from pasted link.")}
      />

      <div className="run-bar">
        <button type="button" className="btn-primary big" onClick={handleRun} disabled={busy}>
          {running ? "Running…" : "Open link & run test"}
        </button>
        <button type="button" className="btn-secondary" onClick={handleCheck} disabled={busy}>
          {checking ? "Checking…" : "Check my setup"}
        </button>
        <div className="spacer" />
        <button type="button" className="btn-link" onClick={reset} disabled={busy}>
          Reset to defaults
        </button>
      </div>
      <p className="run-bar-hint muted small">
        Not sure everything is right? Click <strong>Check my setup</strong> first. It flags missing
        links or vague tasks before you run.
      </p>

      {running && (
        <div ref={loadingRef}>
          <RunLoadingCard
            config={config}
            options={options}
            startedAt={runStartedAt}
            job={runJob}
            onStop={handleStopRun}
            onAuthComplete={handleAuthComplete}
            stopDisabled={stoppingRun || !runJob?.job_id}
            interactiveAuthAvailable={interactiveAuthAvailable}
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
            <p className="muted">Everything looks good. Click &ldquo;Run the test&rdquo; when you&apos;re ready.</p>
          )}

          <MessageList title="Please fix these" variant="error" messages={check.errors} />
          <MessageList title="Heads up" variant="warn" messages={check.warnings} />
        </section>
      )}

      {result && (
        <div className="results-shell" ref={resultsRef}>
          <StudyLibraryPanel
            config={config}
            options={options}
            result={result}
            metadata={studyMetadata}
            onMetadataChange={setStudyMetadata}
            onLoadStudy={handleLoadStudy}
          />

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
              title={review ? undefined : "Turn on the design quality scorecard before running"}
            >
              Design scorecard
            </button>
            <button
              type="button"
              className={resultTab === "tlx" ? "tab active" : "tab"}
              onClick={() => setResultTab("tlx")}
              disabled={!tlxReview}
              title={
                tlxReview
                  ? undefined
                  : "Turn on the workload forecast (Synthetic TLX) before running"
              }
            >
              Workload forecast
            </button>
            <button
              type="button"
              className={resultTab === "evidence" ? "tab active" : "tab"}
              onClick={() => setResultTab("evidence")}
              disabled={!review}
              title={review ? undefined : "Turn on the design quality scorecard before running"}
            >
              Screenshots &amp; proof
            </button>
          </nav>

          {resultTab === "run" && <SummaryCard result={result} />}
          {resultTab === "heuristics" && review && (
            <section className="card">
              <header className="card-header">
                <h3>Design scorecard</h3>
                <span className="badge badge-muted">
                  {review.aggregate_scores.length} area
                  {review.aggregate_scores.length === 1 ? "" : "s"} reviewed
                </span>
              </header>
              <HeuristicScorecard review={review} />
            </section>
          )}
          {resultTab === "tlx" && tlxReview && (
            <section className="card">
              <header className="card-header">
                <h3>Workload forecast</h3>
                <span className="badge badge-muted">Synthetic TLX</span>
              </header>
              <TlxScorecard
                review={tlxReview}
                experimentName={result.experiment_name}
                startUrl={result.start_url}
              />
            </section>
          )}
          {resultTab === "evidence" && review && (
            <section className="card">
              <header className="card-header">
                <h3>Screenshots &amp; proof</h3>
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
