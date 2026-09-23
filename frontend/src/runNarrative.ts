import type { RunResponse } from "./types";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Plain-language lead for results — what we found, not raw metrics. */
export function buildFindingsLead(result: RunResponse): {
  headline: string;
  detail: string;
  tone: "ok" | "warn" | "info";
} {
  const { summary, persona_summaries } = result;
  const finished = Math.round(summary.success_rate * summary.runs);
  const rate = summary.success_rate;

  if (summary.runs === 0) {
    return {
      tone: "info",
      headline: "No tries finished yet.",
      detail: "Something may have blocked the run before anyone could walk through your steps.",
    };
  }

  const unstable = [...persona_summaries].sort(
    (a, b) => a.completion_rate - b.completion_rate || b.error_runs - a.error_runs,
  )[0];
  const slowest = [...persona_summaries].sort((a, b) => b.avg_hesitation - a.avg_hesitation)[0];

  if (rate >= 0.85 && (summary.avg_hesitation ?? 0) < 1.5) {
    return {
      tone: "ok",
      headline: `Most people got through. ${finished} of ${summary.runs} tries finished your steps.`,
      detail:
        "The flow held up for the traveler types you picked. Still worth validating with real users before big decisions.",
    };
  }

  if (rate < 0.5) {
    const who = unstable?.segment_name || unstable?.persona || "some traveler types";
    const signal = unstable?.top_signal ? ` Common issue: ${unstable.top_signal.toLowerCase()}.` : "";
    return {
      tone: "warn",
      headline: `People struggled. Only ${finished} of ${summary.runs} tries finished.`,
      detail: `${who} had the hardest time.${signal} Open the paths below to see where they got stuck.`,
    };
  }

  const hesitation =
    slowest && slowest.avg_hesitation >= 2
      ? `${slowest.segment_name || slowest.persona} paused a lot (${slowest.avg_hesitation.toFixed(1)} hesitations per try on average).`
      : "Some hesitation and backtracking showed up along the way.";

  return {
    tone: "info",
    headline: `${finished} of ${summary.runs} tries finished (${percent(rate)}).`,
    detail: `${hesitation} Worth a closer look before you ship.`,
  };
}
