import type {
  ApiError,
  ExperimentConfig,
  HealthResponse,
  LeverDefinition,
  Lob,
  RunJobStatus,
  RunResponse,
  SegmentPreset,
  StressResponse,
  ValidateResponse,
} from "../types";

const RAW_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
const API_BASE = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE.replace(/\/$/, "") : "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const error: ApiError = {
      status: response.status,
      detail: (parsed as { detail?: unknown } | null)?.detail ?? parsed,
      message: response.statusText || `Request failed with status ${response.status}`,
    };
    throw error;
  }

  return parsed as T;
}

export interface RunOptions {
  include_heuristics?: boolean;
  capture_screenshots?: boolean;
}

export const api = {
  base: API_BASE,
  health: () => request<HealthResponse>("/healthz"),
  validate: (config: Partial<ExperimentConfig>) =>
    request<ValidateResponse>("/validate", {
      method: "POST",
      body: JSON.stringify({ config }),
    }),
  run: (config: Partial<ExperimentConfig>, options: RunOptions = {}) =>
    request<RunResponse>("/run", {
      method: "POST",
      body: JSON.stringify({
        config,
        include_heuristics: options.include_heuristics ?? false,
        capture_screenshots: options.capture_screenshots ?? false,
      }),
    }),
  startRun: (config: Partial<ExperimentConfig>, options: RunOptions = {}) =>
    request<RunJobStatus>("/runs", {
      method: "POST",
      body: JSON.stringify({
        config,
        include_heuristics: options.include_heuristics ?? false,
        capture_screenshots: options.capture_screenshots ?? false,
      }),
    }),
  getRunStatus: (jobId: string) => request<RunJobStatus>(`/runs/${jobId}`),
  cancelRun: (jobId: string) =>
    request<RunJobStatus>(`/runs/${jobId}/cancel`, {
      method: "POST",
    }),
  stress: (output_prefix: string, runs_per_persona: number) =>
    request<StressResponse>("/stress", {
      method: "POST",
      body: JSON.stringify({ output_prefix, runs_per_persona }),
    }),
  getLobs: () => request<Lob[]>("/personas/lobs"),
  getSegments: (lob?: string) => {
    const qs = lob && lob.length > 0 ? `?lob=${encodeURIComponent(lob)}` : "";
    return request<SegmentPreset[]>(`/personas/segments${qs}`);
  },
  getLevers: () => request<LeverDefinition[]>("/personas/levers"),
  artifactUrl: (path: string) => {
    const cleaned = path.replace(/^\/+/, "");
    return `${API_BASE}/artifacts/${cleaned}`;
  },
};

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as ApiError).status === "number"
  );
}

export function describeError(error: unknown): string {
  if (isApiError(error)) {
    const detail = error.detail;
    if (detail && typeof detail === "object" && "errors" in detail) {
      const errs = (detail as { errors?: unknown }).errors;
      if (Array.isArray(errs) && errs.length > 0) {
        return errs.join("; ");
      }
    }
    if (typeof detail === "string") return detail;
    if (detail) return JSON.stringify(detail);
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
