/**
 * Progress toward 25,000 genuinely playable concert / live-event items.
 * Counts must come from measured data — never placeholders.
 */

export const CONCERTS_PLAYABLE_TARGET = 25_000;

export type ConcertScaleCounters = {
  discovered: number;
  imported: number;
  tested: number;
  playable: number;
  currentlyLive: number;
  upcoming: number;
  replay: number;
  failed: number;
  duplicates: number;
  quarantined: number;
  byCountry: Record<string, number>;
  byLanguage: Record<string, number>;
  byProvider: Record<string, number>;
  byCategory: Record<string, number>;
};

export type ConcertScaleProgressReport = ConcertScaleCounters & {
  target: number;
  progressRatio: number;
  remainingToTarget: number;
  generatedAt: string;
  measured: true;
  notes: string[];
};

export function emptyConcertScaleCounters(): ConcertScaleCounters {
  return {
    discovered: 0,
    imported: 0,
    tested: 0,
    playable: 0,
    currentlyLive: 0,
    upcoming: 0,
    replay: 0,
    failed: 0,
    duplicates: 0,
    quarantined: 0,
    byCountry: {},
    byLanguage: {},
    byProvider: {},
    byCategory: {},
  };
}

export function bumpCount(map: Record<string, number>, key: string | null | undefined) {
  const k = String(key || "unknown").trim() || "unknown";
  map[k] = (map[k] || 0) + 1;
}

export function buildConcertScaleProgress(
  counters: ConcertScaleCounters,
  notes: string[] = []
): ConcertScaleProgressReport {
  const playable = Math.max(0, counters.playable);
  return {
    ...counters,
    playable,
    target: CONCERTS_PLAYABLE_TARGET,
    progressRatio: playable / CONCERTS_PLAYABLE_TARGET,
    remainingToTarget: Math.max(0, CONCERTS_PLAYABLE_TARGET - playable),
    generatedAt: new Date().toISOString(),
    measured: true,
    notes,
  };
}

export function mergeConcertScaleCounters(
  base: ConcertScaleCounters,
  delta: Partial<ConcertScaleCounters>
): ConcertScaleCounters {
  const out: ConcertScaleCounters = {
    ...base,
    discovered: base.discovered + (delta.discovered || 0),
    imported: base.imported + (delta.imported || 0),
    tested: base.tested + (delta.tested || 0),
    playable: base.playable + (delta.playable || 0),
    currentlyLive: base.currentlyLive + (delta.currentlyLive || 0),
    upcoming: base.upcoming + (delta.upcoming || 0),
    replay: base.replay + (delta.replay || 0),
    failed: base.failed + (delta.failed || 0),
    duplicates: base.duplicates + (delta.duplicates || 0),
    quarantined: base.quarantined + (delta.quarantined || 0),
    byCountry: { ...base.byCountry },
    byLanguage: { ...base.byLanguage },
    byProvider: { ...base.byProvider },
    byCategory: { ...base.byCategory },
  };
  for (const [k, v] of Object.entries(delta.byCountry || {})) {
    out.byCountry[k] = (out.byCountry[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(delta.byLanguage || {})) {
    out.byLanguage[k] = (out.byLanguage[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(delta.byProvider || {})) {
    out.byProvider[k] = (out.byProvider[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(delta.byCategory || {})) {
    out.byCategory[k] = (out.byCategory[k] || 0) + v;
  }
  return out;
}
