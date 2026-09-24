import type { FlowHeuristicReview, FlowTlxReview, RunResponse } from "./types";
import { buildFindingsLead } from "./runNarrative";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function downloadBlob(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "findings";
}

function heuristicBlock(review: FlowHeuristicReview | undefined): string[] {
  if (!review) return ["## Design scorecard", "", "_Not included in this run._", ""];
  const lines = [
    "## Design scorecard",
    "",
    review.overall_score != null
      ? `Overall: **${review.overall_score.toFixed(1)} / 5**`
      : "Overall: n/a",
    "",
  ];
  if (review.top_risks.length > 0) {
    lines.push("Top risks:", ...review.top_risks.map((risk) => `- ${risk}`), "");
  }
  for (const score of review.aggregate_scores) {
    lines.push(
      `### ${score.heuristic_name} (${score.score}/5, ${score.severity})`,
      "",
      score.summary,
      "",
      `Recommendation: ${score.recommendation}`,
      "",
    );
  }
  return lines;
}

function tlxBlock(review: FlowTlxReview | undefined): string[] {
  if (!review) return ["## Workload forecast (Synthetic TLX)", "", "_Not included in this run._", ""];
  const lines = [
    "## Workload forecast (Synthetic TLX)",
    "",
    review.disclaimer ||
      "Directional agent workload forecast. Not a human NASA TLX questionnaire.",
    "",
    review.overall != null ? `Overall: **${Math.round(review.overall)} / 100**` : "Overall: n/a",
    "",
  ];
  for (const scale of review.subscales) {
    lines.push(`- **${scale.name}**: ${Math.round(scale.score)}: ${scale.rationale}`);
  }
  lines.push("");
  return lines;
}

/** Plain-language Slack-ready summary (no em dashes). */
export function buildFindingsCopySummary(result: RunResponse): string {
  const lead = buildFindingsLead(result);
  const lines = [
    `Simulated walkthrough: ${result.experiment_name}`,
    lead.headline,
    lead.detail,
    "",
    `Completion: ${percent(result.summary.success_rate)} (${result.summary.runs} tries)`,
    `Avg hesitation: ${result.summary.avg_hesitation} · misclicks: ${result.summary.avg_misclick} · backtracks: ${result.summary.avg_backtrack}`,
  ];

  if (result.heuristic_review?.top_risks?.length) {
    lines.push("", "Top design risks:");
    for (const risk of result.heuristic_review.top_risks.slice(0, 3)) {
      lines.push(`• ${risk}`);
    }
  }

  if (result.tlx_review?.overall != null) {
    lines.push(
      "",
      `Synthetic TLX overall: ${Math.round(result.tlx_review.overall)}/100 (not human NASA TLX)`,
    );
  }

  lines.push(
    "",
    "Note: automated simulation, not human research. Validate with real users before big decisions.",
  );
  return lines.join("\n");
}

export function buildFindingsMarkdown(result: RunResponse): string {
  const lead = buildFindingsLead(result);
  const lines = [
    `# ${result.experiment_name}`,
    "",
    `Prototype: ${result.start_url}`,
    "",
    "> Automated simulation. Not human usability research. Synthetic TLX is not a human NASA TLX questionnaire.",
    "",
    "## Summary",
    "",
    `**${lead.headline}**`,
    "",
    lead.detail,
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Tries | ${result.summary.runs} |`,
    `| Completion | ${percent(result.summary.success_rate)} |`,
    `| Avg steps | ${result.summary.avg_steps} |`,
    `| Avg hesitation | ${result.summary.avg_hesitation} |`,
    `| Avg misclicks | ${result.summary.avg_misclick} |`,
    `| Avg backtracks | ${result.summary.avg_backtrack} |`,
    "",
  ];

  if (result.persona_summaries.length > 0) {
    lines.push("## By traveler type", "");
    for (const persona of result.persona_summaries) {
      lines.push(
        `### ${persona.segment_name || persona.persona}`,
        "",
        `- Completion: ${percent(persona.completion_rate)} (${persona.runs} tries)`,
        `- Hesitation: ${persona.avg_hesitation} · misclicks: ${persona.avg_misclick} · backtracks: ${persona.avg_backtrack}`,
      );
      if (persona.top_signal) lines.push(`- Top signal: ${persona.top_signal}`);
      lines.push("");
    }
  }

  lines.push(...heuristicBlock(result.heuristic_review));
  lines.push(...tlxBlock(result.tlx_review));
  return lines.join("\n");
}

export function buildFindingsJson(result: RunResponse): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      disclaimer:
        "Automated simulation findings. Not human research. Synthetic TLX is not human NASA TLX.",
      experiment_name: result.experiment_name,
      start_url: result.start_url,
      summary: result.summary,
      persona_summaries: result.persona_summaries,
      sessions: result.sessions,
      heuristic_review: result.heuristic_review ?? null,
      tlx_review: result.tlx_review ?? null,
      warnings: result.warnings,
    },
    null,
    2,
  );
}

export function downloadFindingsMarkdown(result: RunResponse) {
  downloadBlob(
    `${slugify(result.experiment_name)}-findings.md`,
    buildFindingsMarkdown(result),
    "text/markdown;charset=utf-8",
  );
}

export function downloadFindingsJson(result: RunResponse) {
  downloadBlob(
    `${slugify(result.experiment_name)}-findings.json`,
    buildFindingsJson(result),
    "application/json;charset=utf-8",
  );
}

export async function copyFindingsSummary(result: RunResponse): Promise<boolean> {
  const text = buildFindingsCopySummary(result);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this findings summary:", text);
    return false;
  }
}
