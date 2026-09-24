export interface Persona {
  name: string;
  // Optional: id of the segment preset that seeded this persona's levers.
  segment?: string;
  // Lever id -> level value (e.g. "trust_baseline" -> "high").
  levers?: Record<string, string>;
  // Legacy 4-float behavior model. Derived from levers if not supplied.
  exploration: number;
  patience: number;
  attention: number;
  error_rate: number;
}

export interface LeverOption {
  value: string;
  label: string;
}

export interface LeverDefinition {
  id: string;
  name: string;
  summary: string;
  // id of the LeverGroup this lever renders under (mindset | pressure |
  // risk_trust | context). Optional only because older API responses may
  // not carry it; the CatalogProvider falls back to the static mirror.
  group?: string;
  options: LeverOption[];
}

export interface LeverGroup {
  id: string;
  name: string;
  summary?: string;
}

export type SegmentScope = "brand" | "cross_brand";
export type SegmentConfidence = "high" | "medium" | "low";

export interface SegmentPreset {
  id: string;
  name: string;
  lob?: string;
  brand: string;
  is_primary?: boolean;
  scope?: SegmentScope;
  confidence?: SegmentConfidence;
  summary: string;
  research_notes?: string;
  levers: Record<string, string>;
  derived_behavior?: {
    exploration: number;
    patience: number;
    attention: number;
    error_rate: number;
  };
}

export interface Lob {
  id: string;
  name: string;
  summary?: string;
}

export interface SuccessCriteria {
  url_contains: string[];
  text_contains: string[];
}

export interface SiteHints {
  prefer_labels: string[];
  avoid_labels: string[];
}

export interface CandidateLimits {
  click: number;
  input: number;
  select: number;
}

export interface TestData {
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
}

export interface BrowserConfig {
  headless?: boolean;
  use_stealth?: boolean;
  storage_state_path?: string | null;
  interactive_auth?: boolean;
  user_agent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone_id?: string;
  color_scheme?: string;
}

export interface ExperimentConfig {
  experiment_name: string;
  start_url: string;
  // Optional LOB filter. "" = no filter (show segments across all LOBs).
  lob?: string;
  tasks: string[];
  success_criteria: SuccessCriteria;
  max_steps: number;
  click_timeout_ms: number;
  runs_per_persona: number;
  output_file: string;
  model: string;
  run_timeout_s: number;
  sleep_scale: number;
  hydrate_timeout_ms: number;
  observation_char_limit: number;
  candidate_limits: CandidateLimits;
  test_data: TestData;
  task_search_hint: string;
  site_hints: SiteHints;
  personas: Persona[];
  browser?: BrowserConfig;
}

export interface ConfigPreview {
  experiment_name: string;
  start_url: string;
  runs_per_persona: number;
  personas: string[];
  output_file: string;
}

export interface ValidateResponse {
  errors: string[];
  warnings: string[];
  config_preview: ConfigPreview;
}

export interface RunSummary {
  runs: number;
  success_rate: number;
  avg_steps: number;
  avg_hesitation: number;
  avg_misclick: number;
  avg_backtrack: number;
  error_runs?: number;
}

export type Severity = "low" | "medium" | "high";
export type RunStatus = "completed" | "abandoned" | "error";

export interface RunSession {
  session_id: string;
  persona: string;
  segment_id?: string | null;
  segment_name?: string | null;
  brand?: string;
  status: RunStatus;
  steps: number;
  hesitation: number;
  misclick: number;
  backtrack: number;
  nav_path: string;
  semantic_path: string;
  actions: string[];
  timestamp: string;
  artifact_count: number;
  screenshot_count: number;
  final_url?: string;
  signals: string[];
}

export interface PersonaSummary {
  persona: string;
  segment_id?: string | null;
  segment_name?: string | null;
  brand?: string;
  runs: number;
  completion_rate: number;
  avg_steps: number;
  avg_hesitation: number;
  avg_misclick: number;
  avg_backtrack: number;
  error_runs: number;
  abandoned_runs: number;
  top_signal?: string | null;
}

export interface StepArtifact {
  step_index: number;
  persona: string;
  url: string;
  action: string;
  status: RunStatus;
  screenshot_path?: string | null;
  dom_summary: string;
  visible_labels: string[];
  notes: string[];
}

export interface EvidenceRef {
  step_index: number;
  persona: string;
  url: string;
  screenshot_path?: string | null;
  signal_type: string;
  note: string;
}

export interface HeuristicScore {
  heuristic_id: string;
  heuristic_name: string;
  score: number;
  confidence: number;
  severity: Severity;
  summary: string;
  recommendation: string;
  evidence: EvidenceRef[];
}

export interface SessionHeuristicReview {
  session_id: string;
  persona: string;
  scores: HeuristicScore[];
}

export interface FlowHeuristicReview {
  overall_score: number | null;
  top_risks: string[];
  aggregate_scores: HeuristicScore[];
  session_reviews: SessionHeuristicReview[];
}

export interface TlxSubscaleScore {
  id: string;
  name: string;
  score: number;
  rationale: string;
}

export interface SessionTlxReview {
  session_id: string;
  persona: string;
  overall: number;
  confidence: number;
  subscales: TlxSubscaleScore[];
  mental_demand: number;
  physical_demand: number;
  temporal_demand: number;
  performance: number;
  effort: number;
  frustration: number;
}

export interface PersonaTlxReview {
  persona: string;
  overall: number | null;
  confidence: number;
  subscales: TlxSubscaleScore[];
  session_count: number;
}

export interface FlowTlxReview {
  overall: number | null;
  confidence: number | null;
  disclaimer: string;
  subscales: TlxSubscaleScore[];
  session_reviews: SessionTlxReview[];
  persona_reviews: PersonaTlxReview[];
}

export interface RunResponse {
  status: string;
  experiment_name: string;
  start_url: string;
  warnings: string[];
  output_file: string;
  download_path?: string | null;
  summary: RunSummary;
  sessions: RunSession[];
  persona_summaries: PersonaSummary[];
  heuristic_review?: FlowHeuristicReview;
  tlx_review?: FlowTlxReview;
}

export interface RunJobProgress {
  phase: string;
  message: string;
  percent: number;
  elapsed_seconds: number;
  estimated_total_seconds: number;
  estimated_remaining_seconds: number;
  total_sessions: number;
  completed_sessions: number;
  current_session?: number | null;
  current_persona?: string | null;
  current_run_number?: number | null;
  started_at?: string | null;
  updated_at?: string | null;
}

export interface RunJobStatus {
  job_id: string;
  status: "queued" | "running" | "cancelling" | "completed" | "cancelled" | "failed";
  warnings: string[];
  error?: string | null;
  progress: RunJobProgress;
  result?: RunResponse | null;
}

export interface StressFixtureRow {
  fixture: string;
  persona?: string;
  runs?: string;
  completed?: string;
  abandoned?: string;
  error_runs?: string;
  avg_steps?: string;
  avg_hesitation?: string;
  avg_misclick?: string;
  avg_backtrack?: string;
  [key: string]: string | undefined;
}

export interface StressResponse {
  status: string;
  raw_output: string;
  summary_output: string;
  fixtures: StressFixtureRow[];
}

export interface AuthSessionsStatus {
  figma?: boolean;
  github?: boolean;
}

export interface HealthSecurityInfo {
  api_key_required?: boolean;
  stress_enabled?: boolean;
  max_request_bytes?: number;
  runs_rate_limit?: string;
  stress_rate_limit?: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  /** False on cloud/headless backends where headed Chrome cannot open. */
  interactive_auth_available?: boolean;
  headless?: boolean;
  /** Whether figma.session.json / github.session.json exist on the API host. */
  auth_sessions?: AuthSessionsStatus;
  /** Abuse-control posture from the API (rate limits, stress gate, optional key). */
  security?: HealthSecurityInfo;
}

export interface ApiError {
  detail?: unknown;
  message: string;
  status: number;
}
