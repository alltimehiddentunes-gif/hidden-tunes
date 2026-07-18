/**
 * Deterministic recency decay for implicit Sports signals.
 * Explicit follows/favorites do not decay.
 *
 * Buckets:
 * 0–7d: 100% · 8–30d: 75% · 31–90d: 45% · 91–180d: 20% · >180d: 5%
 */

import { SPORTS_DECAY_BUCKETS } from "./weights";

export function ageInDays(at: Date | string | number, now: Date = new Date()): number {
  const ts = typeof at === "number" ? at : new Date(at).getTime();
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - ts) / (24 * 60 * 60_000));
}

export function decayFactorForAgeDays(ageDays: number): number {
  for (const bucket of SPORTS_DECAY_BUCKETS) {
    if (ageDays <= bucket.maxAgeDays) return bucket.factor;
  }
  return 0.05;
}

export function applyRecencyDecay(
  baseWeight: number,
  at: Date | string | number,
  now: Date = new Date()
): number {
  return baseWeight * decayFactorForAgeDays(ageInDays(at, now));
}

/** True when a watch-history row counts as a meaningful Sports session. */
export function isMeaningfulSportsWatch(input: {
  positionMs?: number | null;
  durationMs?: number | null;
  completed?: boolean | null;
}): boolean {
  if (input.completed) return true;
  const position = Number(input.positionMs || 0);
  const duration = Number(input.durationMs || 0);
  if (position >= 60_000) return true;
  if (duration > 0 && position / duration >= 0.25) return true;
  return false;
}
