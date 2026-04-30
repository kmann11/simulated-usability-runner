import { useEffect, useState } from "react";
import { api } from "../api/client";

type Status = "checking" | "ok" | "down";

export function HealthBadge() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        await api.health();
        if (!cancelled) setStatus("ok");
      } catch {
        if (!cancelled) setStatus("down");
      }
    };
    ping();
    const interval = window.setInterval(ping, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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
