import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { HealthResponse } from "../types";

type Status = "checking" | "ok" | "down";

interface HealthBadgeProps {
  onHealth?: (health: HealthResponse | null) => void;
}

export function HealthBadge({ onHealth }: HealthBadgeProps) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const health = await api.health();
        if (cancelled) return;
        setStatus("ok");
        onHealth?.(health);
      } catch {
        if (cancelled) return;
        setStatus("down");
        onHealth?.(null);
      }
    };
    ping();
    const interval = window.setInterval(ping, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [onHealth]);

  const label =
    status === "ok" ? "Connected" : status === "down" ? "Can't reach the runner" : "Connecting…";
  const cls =
    status === "ok" ? "badge-ok" : status === "down" ? "badge-warn" : "badge-muted";

  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}
