/**
 * Deterministic 70/30 discovery mixer.
 * Never introduces duplicates or shrinks inventory below availability.
 */

import type { DiscoveryMixConfig, ScoredItem } from "./types";
import { dedupeByTieKey, rankItems } from "./rankItems";

export const DEFAULT_DISCOVERY_MIX: DiscoveryMixConfig = {
  preferencePerTen: 7,
  discoveryPerTen: 3,
};

/**
 * Split ranked items into preference-led and discovery pools, then interleave.
 * Discovery pool = lower half / non-top preference items that still score on
 * freshness, live, editorial, or global importance.
 */
export function applyDiscoveryBalance<T>(
  scored: ReadonlyArray<ScoredItem<T>>,
  config: DiscoveryMixConfig = DEFAULT_DISCOVERY_MIX,
  opts: { disabled?: boolean } = {}
): ScoredItem<T>[] {
  const unique = dedupeByTieKey(scored);
  const ranked = rankItems(unique);

  if (opts.disabled || ranked.length <= 3) {
    return ranked;
  }

  const prefRatio =
    config.preferencePerTen /
    Math.max(1, config.preferencePerTen + config.discoveryPerTen);

  // Preference pool: top by preference-heavy score (full score).
  // Discovery pool: items with live/freshness/editorial/importance signal.
  const preferencePool = [...ranked];
  const discoveryPool = ranked.filter((item) => {
    const b = item.breakdown;
    if (!b) return item.isDiscovery === true;
    return (
      b.livePriority > 0 ||
      b.freshness >= 10 ||
      b.editorialPriority > 0 ||
      b.globalImportance >= 10 ||
      item.isDiscovery === true
    );
  });

  // If discovery inventory is thin, keep preference order (do not force ratio).
  if (discoveryPool.length === 0) return preferencePool;

  const out: ScoredItem<T>[] = [];
  const used = new Set<string>();
  let prefIdx = 0;
  let discIdx = 0;
  let slot = 0;

  while (out.length < ranked.length) {
    const cyclePos = slot % 10;
    const wantDiscovery =
      cyclePos >= Math.floor(prefRatio * 10) &&
      discIdx < discoveryPool.length;

    if (wantDiscovery) {
      while (
        discIdx < discoveryPool.length &&
        used.has(discoveryPool[discIdx].tieKey)
      ) {
        discIdx += 1;
      }
      if (discIdx < discoveryPool.length) {
        const pick = discoveryPool[discIdx];
        out.push(pick);
        used.add(pick.tieKey);
        discIdx += 1;
        slot += 1;
        continue;
      }
    }

    while (
      prefIdx < preferencePool.length &&
      used.has(preferencePool[prefIdx].tieKey)
    ) {
      prefIdx += 1;
    }
    if (prefIdx >= preferencePool.length) {
      // Drain remaining discovery
      while (discIdx < discoveryPool.length) {
        const pick = discoveryPool[discIdx];
        discIdx += 1;
        if (used.has(pick.tieKey)) continue;
        out.push(pick);
        used.add(pick.tieKey);
      }
      break;
    }
    const pick = preferencePool[prefIdx];
    out.push(pick);
    used.add(pick.tieKey);
    prefIdx += 1;
    slot += 1;
  }

  return dedupeByTieKey(out);
}
