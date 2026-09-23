import type { ExperimentConfig, RunResponse } from "./types";
import type { RunOptionsState } from "./components/ConfigForm";

const STORAGE_KEY = "eg-uxr-study-library-v1";
const MAX_STUDIES = 25;

export interface SavedStudy {
  id: string;
  created_at: string;
  title: string;
  product_area: string;
  journey_stage: string;
  owner: string;
  tags: string[];
  decision_question: string;
  config: ExperimentConfig;
  options: RunOptionsState;
  result: RunResponse;
}

export interface StudyMetadata {
  product_area: string;
  journey_stage: string;
  owner: string;
  tags: string;
  decision_question: string;
}

export const EMPTY_STUDY_METADATA: StudyMetadata = {
  product_area: "",
  journey_stage: "",
  owner: "",
  tags: "",
  decision_question: "",
};

function safeParse(value: string | null): SavedStudy[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readStudies(): SavedStudy[] {
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function writeStudies(studies: SavedStudy[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(studies.slice(0, MAX_STUDIES)));
}

export function saveStudy(
  config: ExperimentConfig,
  options: RunOptionsState,
  result: RunResponse,
  metadata: StudyMetadata,
): SavedStudy {
  const tags = metadata.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const saved: SavedStudy = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    title: result.experiment_name || config.experiment_name || "Untitled study",
    product_area: metadata.product_area.trim(),
    journey_stage: metadata.journey_stage.trim(),
    owner: metadata.owner.trim(),
    tags,
    decision_question: metadata.decision_question.trim(),
    config,
    options,
    result,
  };
  writeStudies([saved, ...readStudies().filter((study) => study.id !== saved.id)]);
  return saved;
}

export function deleteStudy(id: string): void {
  writeStudies(readStudies().filter((study) => study.id !== id));
}
