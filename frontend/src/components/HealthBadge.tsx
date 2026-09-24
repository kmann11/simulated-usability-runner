import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { HealthResponse } from "../types";

type Status = "checking" | "ok" | "waking" | "down";

interface HealthBadgeProps {
  onHealth?: (health: HealthResponse | null) => void;
}

const SLOW_MS = 8000;
const OK_POLL_MS = 15000;
const WAKE_POLL_MS = 5000;

export function HealthBadge({ onHealth }: HealthBadgeProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [retrying, setRetrying] = useState(false);
  const onHealthRef = useRef(onHealth);
  onHealthRef.current = onHealth;

  const ping = useCallback(async (manual = false) => {
    if (manual) setRetrying(true);
    const started = performance.now();
    // Show waking state while a slow cold start is in flight.
    const slowTimer = window.setTimeout(() => {
      setStatus((prev) => (prev === "ok" ? prev : "waking"));
    }, SLOW_MS);

    try {
      const health = await api.health();
      window.clearTimeout(slowTimer);
      setStatus("ok");
      onHealthRef.current?.(health);
    } catch {
      window.clearTimeout(slowTimer);
      const elapsed = performance.now() - started;
      // Free-tier cold start often fails or times out; keep a hopeful label.
      setStatus(elapsed >= SLOW_MS || manual ? "waking" : "waking");
      onHealthRef.current?.(null);
    } finally {
      if (manual) setRetrying(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await ping(false);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [ping]);

  useEffect(() => {
    if (status === "ok") {
      const interval = window.setInterval(() => void ping(false), OK_POLL_MS);
      return () => window.clearInterval(interval);
    }
    if (status === "waking" || status === "down" || status === "checking") {
      const interval = window.setInterval(() => void ping(false), WAKE_POLL_MS);
      return () => window.clearInterval(interval);
    }
    return undefined;
  }, [status, ping]);

  const label =
    status === "ok"
      ? "Connected"
      : status === "waking"
        ? "Waking the runner…"
        : status === "down"
          ? "Can't reach the runner"
          : "Connecting…";
  const cls =
    status === "ok" ? "badge-ok" : status === "waking" || status === "down" ? "badge-warn" : "badge-muted";

  return (
    <span className={`health-badge-wrap`}>
      <span className={`badge ${cls}`} title={
        status === "waking"
          ? "Free tier hosts may take up to a minute to wake after idle time."
          : undefined
      }>
        <span className="dot" />
        {label}
      </span>
      {(status === "waking" || status === "down") && (
        <button
          type="button"
          className="btn-link health-retry"
          onClick={() => void ping(true)}
          disabled={retrying}
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </span>
  );
}
