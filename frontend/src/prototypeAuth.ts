import { guessPrototypeSource } from "./prototypeSource";
import type { ExperimentConfig } from "./types";
import type { RunOptionsState } from "./components/ConfigForm";

export type AuthProvider = "figma" | "github";

/** Saved on the machine running the backend, reused across runs per provider. */
export const SESSION_PATHS: Record<AuthProvider, string> = {
  figma: "output/sessions/figma.session.json",
  github: "output/sessions/github.session.json",
};

export function getAuthProvider(url: string): AuthProvider | null {
  const source = guessPrototypeSource(url);
  if (source === "figma" || source === "github") return source;
  return null;
}

export function needsInteractiveSignIn(url: string, options: RunOptionsState): boolean {
  if (!getAuthProvider(url)) return false;
  if (options.sign_in_before_run === false) return false;
  // Legacy option kept for shared study links.
  if (options.figma_sign_in === false) return false;
  return true;
}

export function configForRun(
  config: ExperimentConfig,
  options: RunOptionsState,
): ExperimentConfig {
  const provider = getAuthProvider(config.start_url);
  if (!provider || !needsInteractiveSignIn(config.start_url, options)) {
    return config;
  }

  return {
    ...config,
    browser: {
      interactive_auth: true,
      storage_state_path: SESSION_PATHS[provider],
      use_stealth: false,
      headless: true,
    },
  };
}

export interface SignInCopy {
  providerLabel: string;
  calloutTitle: string;
  calloutBody: string;
  waitingTitle: string;
  panelTitle: string;
  steps: [string, string, string];
  continueButton: string;
  successNotice: string;
}

export const SIGN_IN_COPY: Record<AuthProvider, SignInCopy> = {
  figma: {
    providerLabel: "Figma",
    calloutTitle: "Figma sign-in",
    calloutBody:
      "When you click Open link & run test, a Chrome window will open on this computer. Sign in to Figma, make sure your prototype is on screen, then click I'm signed in, continue in the app. We remember your login for next time.",
    waitingTitle: "Waiting for you to sign in to Figma",
    panelTitle: "Sign in to Figma in the browser window",
    steps: [
      "Find the Chrome window that just opened on this computer.",
      "Sign in to Figma if asked, then open your prototype.",
      "When the prototype is on screen, click the button below.",
    ],
    continueButton: "I'm signed in, continue",
    successNotice: "Thanks. We're saving your Figma session and starting the walkthrough.",
  },
  github: {
    providerLabel: "GitHub",
    calloutTitle: "GitHub sign-in",
    calloutBody:
      "When you click Open link & run test, a Chrome window will open on this computer. Sign in to GitHub, open your preview or page, then click I'm signed in, continue in the app. We remember your login for next time.",
    waitingTitle: "Waiting for you to sign in to GitHub",
    panelTitle: "Sign in to GitHub in the browser window",
    steps: [
      "Find the Chrome window that just opened on this computer.",
      "Sign in to GitHub if asked, then open your preview or page.",
      "When the page you want to test is on screen, click the button below.",
    ],
    continueButton: "I'm signed in, continue",
    successNotice: "Thanks. We're saving your GitHub session and starting the walkthrough.",
  },
};

export function signInCopyForUrl(url: string): SignInCopy | null {
  const provider = getAuthProvider(url);
  return provider ? SIGN_IN_COPY[provider] : null;
}

// Backward-compatible helpers
export const FIGMA_SESSION_PATH = SESSION_PATHS.figma;

export function isFigmaPrototypeUrl(url: string): boolean {
  return guessPrototypeSource(url) === "figma";
}

export function isGitHubPrototypeUrl(url: string): boolean {
  return guessPrototypeSource(url) === "github";
}

export function shouldUseFigmaSignIn(url: string, options: RunOptionsState): boolean {
  return getAuthProvider(url) === "figma" && needsInteractiveSignIn(url, options);
}
