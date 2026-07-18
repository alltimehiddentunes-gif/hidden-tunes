/**
 * Stable ranking helpers — never mutate the source array.
 */

import type { ScoredItem } from "./types";

export function rankItems<T>(
  scored: ReadonlyArray<ScoredItem<T>>
): ScoredItem<T>[] {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((a.editorialTier ?? 0) !== (b.editorialTier ?? 0)) {
      return (a.editorialTier ?? 0) - (b.editorialTier ?? 0);
    }
    if ((a.scheduleGroup ?? 0) !== (b.scheduleGroup ?? 0)) {
      return (a.scheduleGroup ?? 0) - (b.scheduleGroup ?? 0);
    }
    if (
      a.startsAtMs != null &&
      b.startsAtMs != null &&
      a.startsAtMs !== b.startsAtMs
    ) {
      return a.startsAtMs - b.startsAtMs;
    }
    return a.tieKey.localeCompare(b.tieKey);
  });
}

export function dedupeByTieKey<T>(
  scored: ReadonlyArray<ScoredItem<T>>
): ScoredItem<T>[] {
  const seen = new Set<string>();
  const out: ScoredItem<T>[] = [];
  for (const item of scored) {
    if (seen.has(item.tieKey)) continue;
    seen.add(item.tieKey);
    out.push(item);
  }
  return out;
}

export function takeBounded<T>(
  items: ReadonlyArray<T>,
  limit: number
): T[] {
  return items.slice(0, Math.max(0, limit));
}
