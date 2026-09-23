import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api/client";
import {
  LEVER_DEFINITIONS as STATIC_LEVERS,
  LEVER_GROUPS_FALLBACK as STATIC_LEVER_GROUPS,
  LOBS_FALLBACK,
  SEGMENT_PRESETS as STATIC_SEGMENTS,
} from "./segments";
import type { LeverDefinition, LeverGroup, Lob, SegmentPreset } from "./types";

export interface CatalogValue {
  lobs: Lob[];
  segments: SegmentPreset[];
  levers: LeverDefinition[];
  leverGroups: LeverGroup[];
  // True once the backend fetch has completed (success or failure).
  loaded: boolean;
  // Which source the data on hand actually came from.
  source: "backend" | "fallback";
  // If the backend fetch failed, a short human-readable reason. Null otherwise.
  error: string | null;
}

const FALLBACK_VALUE: CatalogValue = {
  lobs: LOBS_FALLBACK,
  segments: STATIC_SEGMENTS,
  levers: STATIC_LEVERS,
  leverGroups: STATIC_LEVER_GROUPS,
  loaded: false,
  source: "fallback",
  error: null,
};

const CatalogContext = createContext<CatalogValue>(FALLBACK_VALUE);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CatalogValue>(FALLBACK_VALUE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lobs, segments, levers, leverGroups] = await Promise.all([
          api.getLobs(),
          api.getSegments(),
          api.getLevers(),
          // Lever-groups endpoint is newer; tolerate older backends by falling
          // back to the static list if this one call fails.
          api.getLeverGroups().catch(() => STATIC_LEVER_GROUPS),
        ]);
        if (cancelled) return;
        setState({
          lobs,
          segments,
          levers,
          leverGroups,
          loaded: true,
          source: "backend",
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Unable to load catalog from backend";
        // eslint-disable-next-line no-console
        console.warn("Catalog load failed; using bundled fallback.", err);
        setState((prev) => ({ ...prev, loaded: true, error: message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  return useContext(CatalogContext);
}
