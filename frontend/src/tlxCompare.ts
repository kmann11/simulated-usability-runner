import type { FlowTlxReview } from "./types";
import { readStudies, type SavedStudy } from "./studyLibrary";

const BASELINE_KEY = "eg-uxr-tlx-baseline-v1";

export interface TlxBaseline {
  id: string;
  saved_at: string;
  label: string;
  experiment_name: string;
  start_url: string;
  review: FlowTlxReview;
  source: "manual" | "study";
}

function safeParseBaseline(value: string | null): TlxBaseline | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as TlxBaseline;
    if (!parsed?.review?.subscales) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readTlxBaseline(): TlxBaseline | null {
  return safeParseBaseline(window.localStorage.getItem(BASELINE_KEY));
}

export function writeTlxBaseline(baseline: TlxBaseline): void {
  window.localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline));
}

export function clearTlxBaseline(): void {
  window.localStorage.removeItem(BASELINE_KEY);
}

export function saveCurrentAsTlxBaseline(
  review: FlowTlxReview,
  experimentName: string,
  startUrl: string,
): TlxBaseline {
  const baseline: TlxBaseline = {
    id: crypto.randomUUID(),
    saved_at: new Date().toISOString(),
    label: experimentName || "Current run",
    experiment_name: experimentName,
    start_url: startUrl,
    review,
    source: "manual",
  };
  writeTlxBaseline(baseline);
  return baseline;
}

export function studiesWithTlx(limit = 12): SavedStudy[] {
  return readStudies()
    .filter((study) => Boolean(study.result.tlx_review?.subscales?.length))
    .slice(0, limit);
}

export function baselineFromStudy(study: SavedStudy): TlxBaseline | null {
  const review = study.result.tlx_review;
  if (!review) return null;
  return {
    id: study.id,
    saved_at: study.created_at,
    label: study.title,
    experiment_name: study.result.experiment_name || study.config.experiment_name,
    start_url: study.result.start_url || study.config.start_url,
    review,
    source: "study",
  };
}

export function findSuggestedTlxBaseline(
  experimentName: string,
  startUrl: string,
): TlxBaseline | null {
  const studies = studiesWithTlx(25);
  const match =
    studies.find(
      (study) =>
        (study.result.experiment_name || study.config.experiment_name) === experimentName &&
        (study.result.start_url || study.config.start_url) === startUrl,
    ) ||
    studies.find(
      (study) => (study.result.start_url || study.config.start_url) === startUrl,
    ) ||
    null;
  return match ? baselineFromStudy(match) : null;
}

export function subscaleDelta(
  current: number | null | undefined,
  baseline: number | null | undefined,
): number | null {
  if (current == null || baseline == null || Number.isNaN(current) || Number.isNaN(baseline)) {
    return null;
  }
  return Math.round((current - baseline) * 10) / 10;
}
