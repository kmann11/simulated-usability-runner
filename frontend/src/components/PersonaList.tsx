import { useMemo, useState, type ReactNode } from "react";
import { useCatalog } from "../catalog";
import type { LeverDefinition, Lob, Persona, SegmentPreset } from "../types";
import {
  LEVER_GROUPS,
  deriveBehaviorFloats,
  describeBehavior,
  getSegmentPreset,
  leversMatchSegment,
} from "../segments";

interface PersonaListProps {
  personas: Persona[];
  onChange: (next: Persona[]) => void;
  // Empty string = no filter (all LOBs mixed).
  lob?: string;
}

const CUSTOM_SEGMENT = "__custom__";

const CUSTOM_DEFAULT_LEVERS: Record<string, string> = {
  trust_baseline: "medium",
  time_pressure: "medium",
  info_processing_style: "skimmer",
  risk_tolerance: "medium",
  cognitive_load_sensitivity: "medium",
  error_propensity: "medium",
  device_context: "desktop",
  budget_sensitivity: "medium",
  abandonment_threshold: "medium",
  prior_familiarity: "medium",
};

function applyDerivedFloats(
  persona: Persona,
  levers: Record<string, string>,
): Persona {
  return { ...persona, levers, ...deriveBehaviorFloats(levers) };
}

function defaultBehaviorPersona() {
  // Placeholder values; immediately overwritten by deriveBehaviorFloats.
  return { exploration: 0.5, patience: 0.5, attention: 0.5, error_rate: 0.5 };
}

export function PersonaList({ personas, onChange, lob }: PersonaListProps) {
  const { segments, levers: leverDefinitions, lobs } = useCatalog();

  const leverIndex = useMemo(() => {
    const out: Record<string, LeverDefinition> = {};
    for (const lever of leverDefinitions) out[lever.id] = lever;
    return out;
  }, [leverDefinitions]);

  const lobIndex = useMemo(() => {
    const out: Record<string, Lob> = {};
    for (const l of lobs) out[l.id] = l;
    return out;
  }, [lobs]);

  // LOB is required upstream, but keep a defensive fallback to the full catalog
  // so the component never renders an empty dropdown if someone passes "".
  //
  // Consumer-facing LOBs also inherit cross-brand segments (Gen Z, High Value).
  // Partner Central is B2B and does NOT inherit those — match the backend
  // filter rule exactly so the fallback path stays consistent.
  const CONSUMER_LOBS = useMemo(
    () => new Set(["expedia", "vrbo", "hotels_com"]),
    [],
  );
  const activeLob = lob ?? "";
  const segmentsInActiveLob = useMemo(() => {
    if (!activeLob) return segments;
    const includeCrossBrand = CONSUMER_LOBS.has(activeLob);
    const filtered = segments.filter(
      (s) =>
        s.lob === activeLob || (includeCrossBrand && s.scope === "cross_brand"),
    );
    // Order: brand-primary first, then other brand segments, then cross-brand.
    const primary = filtered.filter(
      (s) => s.scope !== "cross_brand" && s.is_primary,
    );
    const brand = filtered.filter(
      (s) => s.scope !== "cross_brand" && !s.is_primary,
    );
    const cross = filtered.filter((s) => s.scope === "cross_brand");
    return [...primary, ...brand, ...cross];
  }, [segments, activeLob, CONSUMER_LOBS]);

  const activeLobName = activeLob ? lobIndex[activeLob]?.name ?? null : null;

  // Track per-card "is the lever editor expanded" state. Starts collapsed; the
  // user opts in by clicking "Customize levers".
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const update = (index: number, next: Persona) => {
    onChange(personas.map((p, i) => (i === index ? next : p)));
  };

  const remove = (index: number) => {
    onChange(personas.filter((_, i) => i !== index));
    setExpanded((prev) => {
      const out = { ...prev };
      delete out[index];
      return out;
    });
  };

  const toggleExpanded = (index: number) => {
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const ensureLevers = (persona: Persona): Record<string, string> => {
    if (persona.levers && Object.keys(persona.levers).length > 0) {
      return persona.levers;
    }
    if (persona.segment) {
      const preset = getSegmentPreset(segments, persona.segment);
      if (preset) return { ...preset.levers };
    }
    return { ...CUSTOM_DEFAULT_LEVERS };
  };

  const addPersona = () => {
    const used = new Set(personas.map((p) => p.segment));
    // Prefer an unused segment from the current LOB filter, then any unused
    // segment, then a neutral baseline.
    const pool = activeLob ? segmentsInActiveLob : segments;
    const nextPreset = pool.find((p) => !used.has(p.id));
    if (nextPreset) {
      onChange([
        ...personas,
        applyDerivedFloats(
          { name: nextPreset.name, segment: nextPreset.id, ...defaultBehaviorPersona() },
          { ...nextPreset.levers },
        ),
      ]);
      return;
    }
    onChange([
      ...personas,
      applyDerivedFloats(
        {
          name: `Tester ${personas.length + 1}`,
          segment: undefined,
          ...defaultBehaviorPersona(),
        },
        { ...CUSTOM_DEFAULT_LEVERS },
      ),
    ]);
  };

  const handleSegmentChange = (index: number, segmentId: string) => {
    const persona = personas[index];
    if (segmentId === CUSTOM_SEGMENT) {
      const currentLevers = persona.levers ?? { ...CUSTOM_DEFAULT_LEVERS };
      const customName = persona.segment ? `Custom tester ${index + 1}` : persona.name;
      update(
        index,
        applyDerivedFloats(
          { ...persona, segment: undefined, name: customName },
          currentLevers,
        ),
      );
      return;
    }
    const preset = getSegmentPreset(segments, segmentId);
    if (!preset) return;
    update(
      index,
      applyDerivedFloats(
        { ...persona, segment: preset.id, name: preset.name },
        { ...preset.levers },
      ),
    );
  };

  const handleLeverChange = (index: number, leverId: string, value: string) => {
    const persona = personas[index];
    const nextLevers = { ...ensureLevers(persona), [leverId]: value };
    update(index, applyDerivedFloats(persona, nextLevers));
  };

  const resetLeversToPreset = (index: number) => {
    const persona = personas[index];
    if (!persona.segment) return;
    const preset = getSegmentPreset(segments, persona.segment);
    if (!preset) return;
    update(index, applyDerivedFloats(persona, { ...preset.levers }));
  };

  const renderSegmentOptions = (selectedPreset: SegmentPreset | undefined) => {
    // LOB is always set in normal flow. We still tolerate the rare case of a
    // persona whose segment lives outside the active LOB (e.g., a saved config
    // from before the LOB-required migration) — show it anyway so the
    // <select> value resolves cleanly and the user can switch it.
    const inFilter = selectedPreset
      ? segmentsInActiveLob.some((s) => s.id === selectedPreset.id)
      : true;

    const brandSegments = segmentsInActiveLob.filter(
      (s) => s.scope !== "cross_brand",
    );
    const crossBrandSegments = segmentsInActiveLob.filter(
      (s) => s.scope === "cross_brand",
    );

    return (
      <>
        <option value={CUSTOM_SEGMENT}>Custom (start from neutral)</option>
        {brandSegments.map((seg) => (
          <option key={seg.id} value={seg.id}>
            {seg.name} — {seg.brand}
            {seg.is_primary ? " (primary)" : ""}
          </option>
        ))}
        {crossBrandSegments.length > 0 && (
          <optgroup label="Cross-brand">
            {crossBrandSegments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {seg.name}
              </option>
            ))}
          </optgroup>
        )}
        {!inFilter && selectedPreset && (
          <optgroup label="From other lines of business">
            <option value={selectedPreset.id}>
              {selectedPreset.name} — {selectedPreset.brand}
            </option>
          </optgroup>
        )}
      </>
    );
  };

  const noSegmentsForLob = activeLob && segmentsInActiveLob.length === 0;

  return (
    <div className="persona-list">
      {noSegmentsForLob && (
        <p className="persona-lob-empty">
          We don't have research-backed segments for{" "}
          <strong>{activeLobName ?? activeLob}</strong> yet. You can still add a custom tester
          below.
        </p>
      )}

      {personas.length === 0 && !noSegmentsForLob && (
        <p className="empty">No testers yet. Add at least one to run the test.</p>
      )}

      {personas.map((persona, index) => {
        const currentLevers = ensureLevers(persona);
        const preset = persona.segment
          ? getSegmentPreset(segments, persona.segment)
          : undefined;
        const modified = persona.segment
          ? !leversMatchSegment(segments, persona.segment, currentLevers)
          : false;
        const isExpanded = !!expanded[index];

        const selectedOutOfLob =
          activeLob &&
          preset &&
          preset.lob &&
          preset.lob !== activeLob;
        const outOfLobName = selectedOutOfLob
          ? (lobIndex[preset.lob as string]?.name ?? preset.lob)
          : null;

        return (
          <div key={index} className="persona-card">
            <div className="persona-card-head">
              <div className="persona-segment-block">
                <label className="persona-segment-label">
                  <span className="persona-step">Who is testing?</span>
                  <select
                    className="persona-segment-select"
                    value={persona.segment ?? CUSTOM_SEGMENT}
                    onChange={(event) => handleSegmentChange(index, event.target.value)}
                  >
                    {renderSegmentOptions(preset)}
                  </select>
                </label>
                {selectedOutOfLob && (
                  <p className="persona-out-of-lob">
                    This tester is from <strong>{outOfLobName}</strong>. Change the line of
                    business above to see more testers like this.
                  </p>
                )}
                {preset ? (
                  <div className="persona-segment-meta">
                    <SegmentBadges preset={preset} />
                    <p className="persona-segment-summary">{preset.summary}</p>
                    {preset.research_notes && (
                      <p className="persona-segment-notes">{preset.research_notes}</p>
                    )}
                  </div>
                ) : (
                  <p className="persona-segment-summary">
                    A neutral baseline tester. Open "Customize levers" to shape their behavior.
                  </p>
                )}
              </div>

              <button
                type="button"
                className="btn-link persona-remove"
                onClick={() => remove(index)}
                aria-label="Remove tester"
              >
                Remove
              </button>
            </div>

            <div className="persona-behavior">
              <span className="hint">How they'll behave:</span>{" "}
              <strong>{describeBehavior(persona)}</strong>
            </div>

            <div className="persona-customize">
              <button
                type="button"
                className="persona-customize-toggle"
                aria-expanded={isExpanded}
                onClick={() => toggleExpanded(index)}
              >
                <span className="caret">{isExpanded ? "▼" : "▶"}</span>{" "}
                {isExpanded ? "Hide levers" : "Customize levers"}
                <span className="muted"> ({leverDefinitions.length})</span>
                {modified && <span className="badge badge-warn">Modified</span>}
              </button>

              {isExpanded && (
                <div className="persona-lever-editor">
                  <div className="persona-lever-editor-head">
                    <details className="persona-name-edit">
                      <summary>Rename this tester</summary>
                      <input
                        type="text"
                        value={persona.name}
                        onChange={(event) =>
                          update(index, { ...persona, name: event.target.value })
                        }
                        placeholder="e.g. Quality Seeker on mobile"
                      />
                    </details>
                    {modified && preset && (
                      <button
                        type="button"
                        className="btn-link persona-reset"
                        onClick={() => resetLeversToPreset(index)}
                      >
                        Reset to {preset.name} defaults
                      </button>
                    )}
                  </div>

                  {LEVER_GROUPS.map((group) => (
                    <div key={group.id} className="lever-group">
                      <div className="lever-group-head">{group.name}</div>
                      <div className="lever-grid">
                        {group.lever_ids.map((leverId) => {
                          const lever = leverIndex[leverId];
                          if (!lever) return null;
                          const presetValue = preset ? preset.levers[leverId] : undefined;
                          const currentValue = currentLevers[leverId] ?? "";
                          const overridden =
                            !!presetValue && presetValue !== currentValue;
                          return (
                            <LeverRow
                              key={lever.id}
                              lever={lever}
                              value={currentValue}
                              overridden={overridden}
                              onChange={(value) => handleLeverChange(index, lever.id, value)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" className="btn-primary" onClick={addPersona}>
        + Add another tester
      </button>
    </div>
  );
}

interface LeverRowProps {
  lever: LeverDefinition;
  value: string;
  overridden: boolean;
  onChange: (value: string) => void;
}

function LeverRow({ lever, value, overridden, onChange }: LeverRowProps) {
  return (
    <div className={`lever-row ${overridden ? "lever-row--overridden" : ""}`}>
      <div className="lever-row-head">
        <span className="lever-name">
          {lever.name}
          {overridden && <span className="lever-dot" aria-hidden />}
        </span>
        <span className="lever-summary">{lever.summary}</span>
      </div>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {!value && <option value="">— pick a level —</option>}
        {lever.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const CONFIDENCE_COPY: Record<string, string> = {
  high: "High-confidence research",
  medium: "Medium-confidence research",
  low: "Low-confidence — review before using",
};

function SegmentBadges({ preset }: { preset: SegmentPreset }) {
  const badges: ReactNode[] = [];

  if (preset.is_primary) {
    badges.push(
      <span key="primary" className="seg-badge seg-badge--primary" title="Brand's headpin segment">
        Primary
      </span>,
    );
  }
  if (preset.scope === "cross_brand") {
    badges.push(
      <span
        key="cross"
        className="seg-badge seg-badge--cross"
        title="Cross-brand segment — appears under every consumer LOB"
      >
        Cross-brand
      </span>,
    );
  }
  if (preset.confidence) {
    const cls = `seg-badge seg-badge--conf-${preset.confidence}`;
    const label =
      preset.confidence === "high"
        ? "High"
        : preset.confidence === "medium"
        ? "Medium"
        : "Low";
    badges.push(
      <span key="conf" className={cls} title={CONFIDENCE_COPY[preset.confidence]}>
        {label} confidence
      </span>,
    );
  }

  if (badges.length === 0) return null;
  return <div className="seg-badges">{badges}</div>;
}

export type { SegmentPreset };
