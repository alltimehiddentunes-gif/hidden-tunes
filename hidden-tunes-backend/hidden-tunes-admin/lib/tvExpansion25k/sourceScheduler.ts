import { getExpansionActiveWave } from "@/lib/tvExpansion25k/activeWave";
import type { TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";
import { TV_EXPANSION_SOURCE_ADAPTERS } from "@/lib/tvExpansion25k/sources/registry";

/** Legacy wave 1 weights — exhausted sources remain at 0. */
export const TV_SOURCE_WAVE1_WEIGHTS: Record<string, number> = {
  "iptv-org": 0,
  "free-tv-legal": 0,
  "official-broadcasters": 0,
  "public-broadcasters": 0,
  "government-tv": 0,
  "parliamentary-tv": 0,
  "regional-tv": 0,
  "community-tv": 0,
  "municipal-tv": 0,
  "education-tv": 0,
  "university-tv": 0,
  "official-fast-providers": 0,
  "news-broadcasters": 0,
  "sports-broadcasters": 0,
  "music-tv": 0,
  "cultural-broadcasters": 0,
  "religious-broadcasters": 0,
  "official-youtube-live": 0,
  "curated-seeds": 0,
  "youtube-starter": 0,
  tdtchannels: 0,
  "pluto-tv-fast": 0,
  "official-global-hls": 0,
  "youtube-official-global": 0,
  "government-parliament-hls": 0,
  "samsung-tv-plus-fast": 0,
  "roku-fast-channels": 0,
  "pluto-tv-global-mjh": 0,
  "official-global-hls-ext": 0,
  "government-parliament-hls-ext": 0,
  "youtube-official-global-ext": 0,
};

export const TV_SOURCE_WAVE2_WEIGHTS: Record<string, number> = {
  ...TV_SOURCE_WAVE1_WEIGHTS,
  "paratv-official": 16,
  "paratv-stream-manifests": 14,
  "independent-m3u-worldwave": 8,
  "iptv-org-unseen-worldwave": 14,
  "free-tv-world-countries": 10,
  "official-org-manifests": 12,
  "parliament-worldwave": 8,
  "public-europe-wave2": 10,
  "public-americas-wave2": 8,
  "public-asia-pacific-wave2": 8,
  "public-africa-middle-east-wave2": 6,
  "bloomberg-official": 3,
  "france-medias-official": 3,
  "cgtn-official": 3,
  "dw-official": 3,
  "redbull-official": 2,
  "youtube-official-worldwave": 8,
};

export const TV_SOURCE_WAVE3_WEIGHTS: Record<string, number> = {
  ...Object.fromEntries(Object.keys(TV_SOURCE_WAVE2_WEIGHTS).map((id) => [id, 0])),
  "xumo-official-wave3": 16,
  "json-teles-community-wave3": 10,
  "country-official-manifests-wave3": 14,
  "parliament-government-wave3": 8,
  "university-education-wave3": 6,
  "youtube-official-wave3": 14,
  "iptv-org-api-residual-wave3": 14,
  "public-americas-wave3": 8,
  "public-europe-wave3": 10,
  "public-asia-pacific-wave3": 8,
  "public-africa-middle-east-wave3": 6,
};

export const TV_SOURCE_WAVE4_WEIGHTS: Record<string, number> = {
  ...Object.fromEntries(Object.keys(TV_SOURCE_WAVE3_WEIGHTS).map((id) => [id, 0])),
  "iptv-org-github-countries-wave4": 18,
  "country-official-manifests-wave4": 16,
  "parliament-government-wave4": 10,
  "international-news-wave4": 12,
  "religious-education-wave4": 8,
  "regional-community-wave4": 12,
  "free-community-playlists-wave4": 10,
  "education-culture-wave4": 8,
};

/** @deprecated Use getActiveSourceWeightMap() */
export const TV_SOURCE_BATCH_WEIGHTS = TV_SOURCE_WAVE1_WEIGHTS;

const DEFAULT_WEIGHT = 0;

export function getActiveSourceWeightMap(adminRoot = process.cwd()) {
  const wave = getExpansionActiveWave(adminRoot);
  if (wave === 4) return TV_SOURCE_WAVE4_WEIGHTS;
  if (wave === 3) return TV_SOURCE_WAVE3_WEIGHTS;
  if (wave === 2) return TV_SOURCE_WAVE2_WEIGHTS;
  return TV_SOURCE_WAVE1_WEIGHTS;
}

export function getSourceWeight(adapterId: string, adminRoot = process.cwd()) {
  const weights = getActiveSourceWeightMap(adminRoot);
  return weights[adapterId] ?? DEFAULT_WEIGHT;
}

export function orderSourcesForBatch(
  adapters: TvExpansionSourceAdapter[],
  batchNumber: number,
  adminRoot = process.cwd()
) {
  const active = adapters.filter((adapter) => getSourceWeight(adapter.id, adminRoot) > 0);
  if (active.length === 0) return adapters;

  const start = batchNumber % active.length;
  const rotated = [...active.slice(start), ...active.slice(0, start)];
  const remainder = adapters.filter((adapter) => !rotated.includes(adapter));
  return [...rotated, ...remainder];
}

export function allocateSourceLimits(
  batchSize: number,
  adapterIds: string[],
  adminRoot = process.cwd()
) {
  const weights = adapterIds.map((id) => ({ id, weight: getSourceWeight(id, adminRoot) }));
  const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0) || 1;
  const allocation = new Map<string, number>();

  let assigned = 0;
  for (const row of weights) {
    if (row.weight <= 0) {
      allocation.set(row.id, 0);
      continue;
    }
    const share = Math.max(1, Math.floor((batchSize * row.weight) / totalWeight));
    allocation.set(row.id, share);
    assigned += share;
  }

  let remainder = Math.max(0, batchSize - assigned);
  const positive = adapterIds.filter((id) => (allocation.get(id) || 0) > 0);
  let index = 0;
  while (remainder > 0 && positive.length > 0) {
    const id = positive[index % positive.length];
    allocation.set(id, (allocation.get(id) || 0) + 1);
    remainder -= 1;
    index += 1;
  }

  return allocation;
}

export function listRegisteredSourceIds() {
  return TV_EXPANSION_SOURCE_ADAPTERS.map((adapter) => adapter.id);
}

export function listActiveWeightedSourceIds(adminRoot = process.cwd()) {
  const weights = getActiveSourceWeightMap(adminRoot);
  return Object.entries(weights)
    .filter(([, weight]) => weight > 0)
    .map(([id]) => id);
}
