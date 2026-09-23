import type {
  FlowHeuristicReview,
  PersonaSummary,
  RunResponse,
  RunSession,
} from "../types";
import { buildFindingsLead } from "../runNarrative";

interface SummaryCardProps {
  result: RunResponse;
}

interface InsightItem {
  tone: "ok" | "warn" | "info";
  title: string;
  metric: string;
  metricLabel?: string;
  detail: string;
}

const TONE_LABELS: Record<InsightItem["tone"], string> = {
  ok: "Healthy",
  info: "Watch",
  warn: "Risk",
};

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
    title: "Task completion rate",
    metric: result.summary.runs === 0 ? "N/A" : percent(result.summary.success_rate),
    metricLabel: result.summary.runs === 0 ? "no runs yet" : `${finished} of ${result.summary.runs} runs`,
    detail:
      result.summary.runs === 0
        ? "No runs came back yet."
        : `${finished} of ${result.summary.runs} tries reached the finish line.`,
  });

  const slowest = slowestProfile(result.persona_summaries);
  if (slowest && slowest.avg_hesitation > 0) {
    items.push({
      tone: slowest.avg_hesitation >= 2 ? "warn" : "info",
      title: "Highest hesitation",
      metric: slowest.avg_hesitation.toFixed(1),
      metricLabel: "pauses / run",
      detail: `${slowest.segment_name || slowest.persona} paused the most while moving through the flow.`,
    });
  }

  const unstable = leastStableProfile(result.persona_summaries);
  if (unstable && unstable.completion_rate < 1) {
    items.push({
      tone: unstable.completion_rate < 0.5 ? "warn" : "info",
      title: "Lowest completion rate",
      metric: percent(unstable.completion_rate),
      metricLabel: `${unstable.segment_name || unstable.persona}`,
      detail: unstable.top_signal
        ? `Most common friction signal: ${unstable.top_signal.toLowerCase()}.`
        : `${unstable.segment_name || unstable.persona} dropped off most often during the task.`,
    });
  }

  const weakest = worstHeuristic(result.heuristic_review);
  if (weakest) {
    items.push({
      tone: weakest.severity === "high" ? "warn" : weakest.severity === "medium" ? "info" : "ok",
      title: "Biggest design concern",
      metric: `${weakest.score}/5`,
      metricLabel: weakest.heuristic_name,
      detail: `${weakest.heuristic_name} scored lowest. Worth a closer look in the design scorecard.`,
    });
  }

  if (result.summary.error_runs && result.summary.error_runs > 0) {
    items.push({
      tone: "warn",
      title: "Errored runs",
      metric: String(result.summary.error_runs),
      metricLabel: result.summary.error_runs === 1 ? "run" : "runs",
      detail: `${result.summary.error_runs} run${result.summary.error_runs === 1 ? "" : "s"} stopped on a hard error rather than abandoning the task.`,
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

function prettySlug(slug: string): string {
  // Figma file slugs use "---" between major segments and "-" within a
  // segment. Preserve that visually: triple-dash → " — ", single-dash → " ".
  return slug
    .replace(/-{3,}/g, " \u2014 ")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveLinkLabel(rawUrl: string, fallback: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fallback;
  }

  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  // Figma URLs like /file/<id>/<name>, /proto/<id>/<name>, /design/<id>/<name>,
  // /board/<id>/<name>, /make/<id>/<name>. The third segment is the file name.
  if (host.endsWith("figma.com")) {
    const known = new Set(["file", "proto", "design", "board", "make"]);
    if (segments.length >= 3 && known.has(segments[0])) {
      const label = prettySlug(decodeURIComponent(segments[2]));
      if (label) return label;
    }
  }

  if (segments.length === 0) return host;
  // For non-Figma URLs, show host plus the first path segment so it's
  // obvious which page each session ended on (e.g., expedia.com / Hotels).
  const firstSegment = prettySlug(decodeURIComponent(segments[0]));
  return firstSegment ? `${host} / ${firstSegment}` : host;
}

const CSV_FIELDS = [
  "experiment_name",
  "start_url",
  "persona",
  "steps",
  "hesitation",
  "misclick",
  "backtrack",
  "abandoned",
  "nav_path",
  "semantic_path",
  "timestamp",
] as const;

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // RFC 4180: wrap in quotes if the field contains a comma, quote, or newline.
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(result: RunResponse): string {
  const lines: string[] = [CSV_FIELDS.join(",")];
  for (const session of result.sessions) {
    const row: Record<(typeof CSV_FIELDS)[number], unknown> = {
      experiment_name: result.experiment_name,
      start_url: result.start_url,
      persona: session.persona,
      steps: session.steps,
      hesitation: session.hesitation,
      misclick: session.misclick,
      backtrack: session.backtrack,
      // Match the runner's CSV semantics: any non-completed status counts as
      // abandoned in the CSV (the runner writes True/False as Python strings).
      abandoned: session.status === "completed" ? "False" : "True",
      nav_path: session.nav_path,
      semantic_path: session.semantic_path,
      timestamp: session.timestamp,
    };
    lines.push(CSV_FIELDS.map((field) => csvEscape(row[field])).join(","));
  }
  // Trailing newline keeps tools like `wc -l` and `tail` happy.
  return lines.join("\n") + "\n";
}

function safeFilename(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "results";
}

function downloadCsv(result: RunResponse): void {
  const csv = buildCsv(result);
  // Excel reads UTF-8 reliably when the file starts with a BOM.
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(result.experiment_name)}_${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function SummaryCard({ result }: SummaryCardProps) {
  const insights = buildInsights(result);
  const findingsLead = buildFindingsLead(result);
  const weakest = worstHeuristic(result.heuristic_review);
  const sessionCount = result.sessions.length;
  const canDownload = result.sessions.length > 0;
  const sortedSessions = [...result.sessions].sort((a, b) => {
    const rank = { error: 0, abandoned: 1, completed: 2 } as const;
    return rank[a.status] - rank[b.status] || a.persona.localeCompare(b.persona);
  });

  return (
    <section className="card results-dashboard">
      <header className="card-header dashboard-header">
        <div>
          <h3>What we found</h3>
          <p className="muted small dashboard-subtitle">
            {result.experiment_name} · opened {result.start_url}
          </p>
        </div>
        <div className="dashboard-actions">
          <span className="badge badge-ok">Analysis complete</span>
        </div>
      </header>

      <div className={`findings-lead findings-lead--${findingsLead.tone}`}>
        <h4>{findingsLead.headline}</h4>
        <p className="muted">{findingsLead.detail}</p>
      </div>

      <div className="dashboard-hero">
        <div className="hero-copy">
          <p className="hero-kicker">By the numbers</p>
          <h4>
            {Math.round(result.summary.success_rate * result.summary.runs)} of {result.summary.runs}{" "}
            tries finished your steps.
          </h4>
          <p className="muted">
            Hesitation, backtracking, and misclicks below show where the flow felt rough.
          </p>
          <div className="hero-meta">
            {weakest && (
              <span className="signal-tag">
                Biggest design concern: {weakest.heuristic_name}
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

      <section className="guardrail-band">
        <div>
          <h4>How to read these results</h4>
          <p>
            Use this as a quick directional check: where the flow felt rough, confusing, or easy to
            abandon. It&apos;s not proof of how real customers feel; follow up with people when
            you&apos;re making important decisions.
          </p>
        </div>
        <div className="guardrail-tags">
          <span className="signal-tag">starting point</span>
          <span className="signal-tag">design review input</span>
          <span className="signal-tag">validate with real users</span>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <h4>Key insights</h4>
          <span className="muted small">A fast read before you open the deeper tabs.</span>
        </div>
        <div className="insight-grid">
          {insights.map((insight) => (
            <article key={insight.title} className={`insight-card tone-${insight.tone}`}>
              <header className="insight-card-head">
                <span className="insight-eyebrow">{insight.title}</span>
                <span className={`insight-pill tone-${insight.tone}`}>
                  <span className="insight-pill-dot" aria-hidden="true" />
                  {TONE_LABELS[insight.tone]}
                </span>
              </header>
              <div className="insight-metric-row">
                <strong className="insight-metric">{insight.metric}</strong>
                {insight.metricLabel && (
                  <span className="insight-metric-label">{insight.metricLabel}</span>
                )}
              </div>
              <p className="insight-detail">{insight.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <h4>Recommended follow-up</h4>
          <span className="muted small">What to do next with these findings.</span>
        </div>
        <div className="followup-grid">
          {weakest && (
            <article className="followup-card">
              <span className="signal-tag">Validate</span>
              <h5>{weakest.heuristic_name}</h5>
              <p>
                Put this in the next human session guide and ask participants to complete the same
                flow while thinking aloud around the moment captured in evidence.
              </p>
            </article>
          )}
          <article className="followup-card">
            <span className="signal-tag">Compare</span>
            <h5>Run again after design changes</h5>
            <p>
              Save this run to the study library, then compare completion, hesitation, and design
              scores after the next iteration.
            </p>
          </article>
          <article className="followup-card">
            <span className="signal-tag">Tighten</span>
            <h5>Refine task and criteria</h5>
            <p>
              If completion looks too clean or too messy, adjust the task wording and success
              criteria before spending participant budget.
            </p>
          </article>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <h4>By traveler type</h4>
          <span className="muted small">Which types held up and which ones struggled.</span>
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
                <a
                  className="session-link"
                  href={session.final_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={session.final_url}
                >
                  {deriveLinkLabel(session.final_url, result.experiment_name)}
                  <span className="session-link-icon" aria-hidden="true">
                    {"\u2197"}
                  </span>
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-footer">
        <button
          type="button"
          className="btn-secondary download-csv-btn"
          onClick={() => downloadCsv(result)}
          disabled={!canDownload}
          title={
            canDownload
              ? "Download these results as a CSV file"
              : "No sessions to export yet"
          }
        >
          Download CSV
        </button>
        <p className="muted small dashboard-footer-note">
          {canDownload
            ? `Exports ${sessionCount} session${sessionCount === 1 ? "" : "s"} as a .csv file. Nothing is saved to disk automatically.`
            : "No sessions to export yet."}
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
