import type { TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";
import { TV_EXPANSION_SOURCE_ADAPTERS } from "@/lib/tvExpansion25k/sources/registry";

/** Weighted share of each batch (percent). iptv-org capped at 35%. */
export const TV_SOURCE_BATCH_WEIGHTS: Record<string, number> = {
  "iptv-org": 35,
  "free-tv-legal": 8,
  "official-broadcasters": 5,
  "public-broadcasters": 4,
  "government-tv": 4,
  "parliamentary-tv": 3,
  "regional-tv": 3,
  "community-tv": 3,
  "municipal-tv": 3,
  "education-tv": 3,
  "university-tv": 2,
  "official-fast-providers": 5,
  "news-broadcasters": 4,
  "sports-broadcasters": 4,
  "music-tv": 3,
  "cultural-broadcasters": 3,
  "religious-broadcasters": 2,
  "official-youtube-live": 3,
  "curated-seeds": 1,
  "youtube-starter": 1,
};

const DEFAULT_WEIGHT = 2;

export function getSourceWeight(adapterId: string) {
  return TV_SOURCE_BATCH_WEIGHTS[adapterId] ?? DEFAULT_WEIGHT;
}

export function orderSourcesForBatch(
  adapters: TvExpansionSourceAdapter[],
  batchNumber: number
) {
  const active = adapters.filter((adapter) => getSourceWeight(adapter.id) > 0);
  if (active.length === 0) return adapters;

  const start = batchNumber % active.length;
  const rotated = [...active.slice(start), ...active.slice(0, start)];
  const remainder = adapters.filter((adapter) => !rotated.includes(adapter));
  return [...rotated, ...remainder];
}

export function allocateSourceLimits(batchSize: number, adapterIds: string[]) {
  const weights = adapterIds.map((id) => ({ id, weight: getSourceWeight(id) }));
  const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0) || 1;
  const allocation = new Map<string, number>();

  let assigned = 0;
  for (const row of weights) {
    const share = Math.max(1, Math.floor((batchSize * row.weight) / totalWeight));
    allocation.set(row.id, share);
    assigned += share;
  }

  // Cap iptv-org at 35% of batch
  const iptvCap = Math.max(1, Math.floor(batchSize * 0.35));
  if ((allocation.get("iptv-org") || 0) > iptvCap) {
    const overflow = (allocation.get("iptv-org") || 0) - iptvCap;
    allocation.set("iptv-org", iptvCap);
    assigned -= overflow;
  }

  // Distribute any remainder to non-iptv sources in rotation order
  let remainder = Math.max(0, batchSize - assigned);
  const nonIptv = adapterIds.filter((id) => id !== "iptv-org");
  let index = 0;
  while (remainder > 0 && nonIptv.length > 0) {
    const id = nonIptv[index % nonIptv.length];
    allocation.set(id, (allocation.get(id) || 0) + 1);
    remainder -= 1;
    index += 1;
  }

  return allocation;
}

export function listRegisteredSourceIds() {
  return TV_EXPANSION_SOURCE_ADAPTERS.map((adapter) => adapter.id);
}
