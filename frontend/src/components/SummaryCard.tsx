import { api } from "../api/client";
import type {
  FlowHeuristicReview,
  PersonaSummary,
  RunResponse,
  RunSession,
} from "../types";

interface SummaryCardProps {
  result: RunResponse;
}

interface InsightItem {
  tone: "ok" | "warn" | "info";
  title: string;
  detail: string;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function statusLabel(status: RunSession["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "abandoned") return "Abandoned";
  return "Errored";
}

function badgeClass(status: RunSession["status"]): string {
  if (status === "completed") return "badge-ok";
  if (status === "abandoned") return "badge-warn";
  return "badge-error";
}

function formatTimestamp(value: string): string {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toneForCompletion(rate: number): InsightItem["tone"] {
  if (rate >= 0.8) return "ok";
  if (rate >= 0.5) return "info";
  return "warn";
}

function worstHeuristic(review: FlowHeuristicReview | undefined) {
  if (!review || review.aggregate_scores.length === 0) return null;
  return [...review.aggregate_scores].sort((a, b) => a.score - b.score)[0];
}

function slowestProfile(summaries: PersonaSummary[]) {
  if (summaries.length === 0) return null;
  return [...summaries].sort((a, b) => b.avg_hesitation - a.avg_hesitation)[0];
}

function leastStableProfile(summaries: PersonaSummary[]) {
  if (summaries.length === 0) return null;
  return [...summaries].sort(
    (a, b) => a.completion_rate - b.completion_rate || b.error_runs - a.error_runs,
  )[0];
}

function buildInsights(result: RunResponse): InsightItem[] {
  const items: InsightItem[] = [];
  const completionTone = toneForCompletion(result.summary.success_rate);
  const finished = Math.round(result.summary.success_rate * result.summary.runs);

  items.push({
    tone: completionTone,
    title: "How the flow held up",
    detail:
      result.summary.runs === 0
        ? "No runs came back yet."
        : `${finished} of ${result.summary.runs} runs finished the task.`,
  });

  const slowest = slowestProfile(result.persona_summaries);
  if (slowest && slowest.avg_hesitation > 0) {
    items.push({
      tone: slowest.avg_hesitation >= 2 ? "warn" : "info",
      title: "Where it got sticky",
      detail: `${slowest.segment_name || slowest.persona} showed the most hesitation at ${slowest.avg_hesitation.toFixed(1)} pauses per run.`,
    });
  }

  const unstable = leastStableProfile(result.persona_summaries);
  if (unstable && unstable.completion_rate < 1) {
    items.push({
      tone: unstable.completion_rate < 0.5 ? "warn" : "info",
      title: "Which segment was least steady",
      detail: `${unstable.segment_name || unstable.persona} completed ${percent(unstable.completion_rate)} of runs${unstable.top_signal ? ` and most often ran into ${unstable.top_signal.toLowerCase()}` : ""}.`,
    });
  }

  const weakest = worstHeuristic(result.heuristic_review);
  if (weakest) {
    items.push({
      tone: weakest.severity === "high" ? "warn" : weakest.severity === "medium" ? "info" : "ok",
      title: "Biggest heuristic risk",
      detail: `${weakest.heuristic_name} came through as the weakest signal at ${weakest.score}/5.`,
    });
  }

  if (result.summary.error_runs && result.summary.error_runs > 0) {
    items.push({
      tone: "warn",
      title: "Runs that broke outright",
      detail: `${result.summary.error_runs} run${result.summary.error_runs === 1 ? "" : "s"} hit an error rather than just getting confused.`,
    });
  }

  return items.slice(0, 4);
}

function actionPreview(session: RunSession): string[] {
  const limit = 4;
  const base = session.actions.slice(0, limit);
  if (session.actions.length <= limit) return base;
  return [...base, `+${session.actions.length - limit} more`];
}

export function SummaryCard({ result }: SummaryCardProps) {
  const insights = buildInsights(result);
  const weakest = worstHeuristic(result.heuristic_review);
  const sessionCount = result.sessions.length;
  const downloadHref = result.download_path ? api.artifactUrl(result.download_path) : null;
  const sortedSessions = [...result.sessions].sort((a, b) => {
    const rank = { error: 0, abandoned: 1, completed: 2 } as const;
    return rank[a.status] - rank[b.status] || a.persona.localeCompare(b.persona);
  });

  return (
    <section className="card results-dashboard">
      <header className="card-header dashboard-header">
        <div>
          <h3>Run dashboard</h3>
          <p className="muted small dashboard-subtitle">
            {result.experiment_name} · {result.persona_summaries.length} segment profile
            {result.persona_summaries.length === 1 ? "" : "s"} · {sessionCount} session
            {sessionCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="dashboard-actions">
          {downloadHref && (
            <a className="btn-secondary download-link" href={downloadHref} download>
              Download CSV
            </a>
          )}
          <span className="badge badge-ok">Run complete</span>
        </div>
      </header>

      <div className="dashboard-hero">
        <div className="hero-copy">
          <p className="hero-kicker">What stood out first</p>
          <h4>
            {Math.round(result.summary.success_rate * result.summary.runs)} of {result.summary.runs}{" "}
            runs made it through the task.
          </h4>
          <p className="muted">
            This is the quick read on pathing, friction, and where the flow looked most brittle.
          </p>
          <div className="hero-meta">
            <span className="signal-tag">{result.start_url}</span>
            {weakest && (
              <span className="signal-tag">
                Weakest heuristic: {weakest.heuristic_name}
              </span>
            )}
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <span className="metric-label">Completion</span>
            <strong>{percent(result.summary.success_rate)}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Avg steps</span>
            <strong>{result.summary.avg_steps}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Hesitation</span>
            <strong>{result.summary.avg_hesitation}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Backtracking</span>
            <strong>{result.summary.avg_backtrack}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Misclicks</span>
            <strong>{result.summary.avg_misclick}</strong>
          </div>
        </div>
      </div>

      <section className="dashboard-section">
        <div className="section-head">
          <h4>Key insights</h4>
          <span className="muted small">A fast read before you open the deeper tabs.</span>
        </div>
        <div className="insight-grid">
          {insights.map((insight) => (
            <article key={insight.title} className={`insight-card tone-${insight.tone}`}>
              <h5>{insight.title}</h5>
              <p>{insight.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <h4>By segment profile</h4>
          <span className="muted small">Which profiles held up and which ones got messy.</span>
        </div>
        <div className="profile-grid">
          {result.persona_summaries.map((summary) => (
            <article key={summary.persona} className="profile-card">
              <div className="profile-card-head">
                <div>
                  <h5>{summary.segment_name || summary.persona}</h5>
                  <p className="muted small">
                    {summary.brand ? `${summary.brand} · ` : ""}
                    {summary.runs} run{summary.runs === 1 ? "" : "s"}
                  </p>
                </div>
                <span
                  className={`badge ${
                    summary.completion_rate >= 0.8
                      ? "badge-ok"
                      : summary.completion_rate >= 0.5
                        ? "badge-muted"
                        : "badge-warn"
                  }`}
                >
                  {percent(summary.completion_rate)} complete
                </span>
              </div>
              <div className="profile-stats">
                <span>{summary.avg_steps.toFixed(1)} steps</span>
                <span>{summary.avg_hesitation.toFixed(1)} hesitations</span>
                <span>{summary.avg_backtrack.toFixed(1)} backtracks</span>
                <span>{summary.avg_misclick.toFixed(1)} misclicks</span>
              </div>
              <p className="muted small profile-note">
                {summary.top_signal
                  ? `Most common signal: ${summary.top_signal}.`
                  : "No repeated friction signal stood out for this profile."}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <h4>Run paths</h4>
          <span className="muted small">Short snapshots of what each run actually did.</span>
        </div>
        <div className="session-list">
          {sortedSessions.map((session) => (
            <article key={session.session_id} className="session-card">
              <div className="session-card-head">
                <div>
                  <h5>{session.segment_name || session.persona}</h5>
                  <p className="muted small">
                    {formatTimestamp(session.timestamp)}
                    {session.brand ? ` · ${session.brand}` : ""}
                  </p>
                </div>
                <span className={`badge ${badgeClass(session.status)}`}>
                  {statusLabel(session.status)}
                </span>
              </div>

              <div className="session-meta-row">
                <span>{session.steps} steps</span>
                <span>{session.hesitation} hesitations</span>
                <span>{session.backtrack} backtracks</span>
                <span>{session.misclick} misclicks</span>
              </div>

              <div className="path-chip-row">
                {actionPreview(session).map((action) => (
                  <span key={`${session.session_id}-${action}`} className="path-chip">
                    {action}
                  </span>
                ))}
              </div>

              {session.signals.length > 0 && (
                <div className="signal-row">
                  {session.signals.slice(0, 4).map((signal) => (
                    <span key={`${session.session_id}-${signal}`} className="signal-tag">
                      {signal}
                    </span>
                  ))}
                </div>
              )}

              {session.final_url && (
                <p className="muted small truncate" title={session.final_url}>
                  {session.final_url}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-footer">
        <p className="muted small">
          Saved to <code>{result.output_file}</code>
        </p>
      </div>

      {result.warnings.length > 0 && (
        <div className="message-block warn">
          <h4>Heads up</h4>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
