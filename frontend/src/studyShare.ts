import type { ExperimentConfig } from "./types";
import type { RunOptionsState } from "./components/ConfigForm";
import type { StudyMetadata } from "./studyLibrary";

/** Versioned payload embedded in share links (setup only — no run results). */
export interface SharedStudySetup {
  v: 1;
  config: ExperimentConfig;
  options: RunOptionsState;
  metadata: StudyMetadata;
}

const SHARE_PREFIX = "#s=";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeSharedStudy(setup: SharedStudySetup): string {
  return toBase64Url(JSON.stringify(setup));
}

export function decodeSharedStudy(encoded: string): SharedStudySetup | null {
  if (!encoded.trim()) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as SharedStudySetup;
    if (parsed?.v !== 1 || !parsed.config || !parsed.options) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Full URL teammates can paste in Slack. */
export function buildShareUrl(setup: SharedStudySetup): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}${SHARE_PREFIX}${encodeSharedStudy(setup)}`;
}

/** Read a share token from a pasted URL or raw token. */
export function parseShareInput(input: string): SharedStudySetup | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hashIndex = trimmed.indexOf(SHARE_PREFIX);
  if (hashIndex >= 0) {
    return decodeSharedStudy(trimmed.slice(hashIndex + SHARE_PREFIX.length));
  }

  if (trimmed.startsWith(SHARE_PREFIX)) {
    return decodeSharedStudy(trimmed.slice(SHARE_PREFIX.length));
  }

  return decodeSharedStudy(trimmed);
}

export function readShareFromLocation(): SharedStudySetup | null {
  if (!window.location.hash.startsWith(SHARE_PREFIX)) return null;
  return decodeSharedStudy(window.location.hash.slice(SHARE_PREFIX.length));
}

export function clearShareFromLocation(): void {
  if (window.location.hash.startsWith(SHARE_PREFIX)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
