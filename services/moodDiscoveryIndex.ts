/**
 * Ultra-light mood discovery index + DEV perf counters.
 * Indexes hold IDs only; track objects stay in catalog/session stores.
 * Does NOT change ranking/genre-anchor semantics.
 */

import {
  normalizeDiscoveryConcepts,
  type RadioDiscoverySong,
} from "./radioCatalogDiscovery";

export const MOOD_NORMALIZER_VERSION = 1;

export type MoodTrackNorm = {
  trackId: string;
  fingerprint: string;
  moods: string[];
  genres: string[];
  playable: boolean;
  artist: string;
};

type MoodDiscoveryPerfCounters = {
  roomOpenToFirstRowsMs: number;
  discoveryRequests: number;
  catalogRecordsNormalized: number;
  normalizationCacheHits: number;
  candidateRecordsScanned: number;
  candidateIDsConsidered: number;
  rankingDurationMs: number;
  paginationDurationMs: number;
  paginationDuringFling: number;
  roomRenders: number;
  discoveryStateNotifications: number;
  staleRequestsDropped: number;
  historicalGraphRebuilds: number;
  indexTracks: number;
  duplicateRequestsPrevented: number;
  smartQueueRefills: number;
  radioDiscoveryRuns: number;
  catalogIndexRebuilds: number;
  catalogIndexReuseHits: number;
  refillDurationMs: number;
};

const EMPTY_COUNTERS: MoodDiscoveryPerfCounters = {
  roomOpenToFirstRowsMs: 0,
  discoveryRequests: 0,
  catalogRecordsNormalized: 0,
  normalizationCacheHits: 0,
  candidateRecordsScanned: 0,
  candidateIDsConsidered: 0,
  rankingDurationMs: 0,
  paginationDurationMs: 0,
  paginationDuringFling: 0,
  roomRenders: 0,
  discoveryStateNotifications: 0,
  staleRequestsDropped: 0,
  historicalGraphRebuilds: 0,
  indexTracks: 0,
  duplicateRequestsPrevented: 0,
  smartQueueRefills: 0,
  radioDiscoveryRuns: 0,
  catalogIndexRebuilds: 0,
  catalogIndexReuseHits: 0,
  refillDurationMs: 0,
};

let counters: MoodDiscoveryPerfCounters = { ...EMPTY_COUNTERS };
const trackNormById = new Map<string, MoodTrackNorm>();
const moodToTrackIds = new Map<string, Set<string>>();
const genreToTrackIds = new Map<string, Set<string>>();

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isDevPerf() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function bumpMoodDiscoveryPerf(
  key: keyof MoodDiscoveryPerfCounters,
  by = 1
) {
  if (!isDevPerf()) return;
  counters[key] = (counters[key] || 0) + by;
}

export function setMoodDiscoveryPerf(
  key: keyof MoodDiscoveryPerfCounters,
  value: number
) {
  if (!isDevPerf()) return;
  counters[key] = value;
}

export function getMoodDiscoveryPerfSnapshot(): MoodDiscoveryPerfCounters {
  return {
    ...counters,
    indexTracks: trackNormById.size,
  };
}

export function resetMoodDiscoveryPerf() {
  counters = { ...EMPTY_COUNTERS };
}

export function moodTrackFingerprint(song: RadioDiscoverySong): string {
  const tags = Array.isArray(song.tags)
    ? song.tags.map((tag) => text(tag)).join(",")
    : text(song.tags);
  return [
    MOOD_NORMALIZER_VERSION,
    text(song.genre),
    text(song.mood),
    text((song as { moods?: unknown }).moods),
    text(song.moodGenre),
    text(song.emotion),
    tags,
    text(song.title),
  ].join("|");
}

function songPlayable(song: RadioDiscoverySong) {
  return Boolean(
    (song as { streamUrl?: unknown }).streamUrl ||
      (song as { url?: unknown }).url ||
      (song as { audioUrl?: unknown }).audioUrl ||
      song.isOnline !== false
  );
}

function extractRawMoodBlob(song: RadioDiscoverySong): string {
  const parts: string[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const raw = text(value);
    if (raw) parts.push(raw);
  };
  push(song.mood);
  push((song as { moods?: unknown }).moods);
  push(song.moodGenre);
  push(song.emotion);
  push(song.tags);
  push((song as { vibe?: unknown }).vibe);
  push((song as { vibes?: unknown }).vibes);
  return parts.join(" ");
}

function addToIndex(map: Map<string, Set<string>>, key: string, trackId: string) {
  if (!key || !trackId) return;
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(trackId);
}

function removeFromIndex(
  map: Map<string, Set<string>>,
  keys: string[],
  trackId: string
) {
  keys.forEach((key) => {
    const set = map.get(key);
    if (!set) return;
    set.delete(trackId);
    if (!set.size) map.delete(key);
  });
}

/**
 * Normalize + index one track once per fingerprint.
 * Returns null when unchanged (cache hit).
 */
export function indexMoodTrackIfChanged(
  song: RadioDiscoverySong
): MoodTrackNorm | null {
  const trackId = text(song.id);
  if (!trackId) return null;
  const fingerprint = moodTrackFingerprint(song);
  const existing = trackNormById.get(trackId);
  if (existing && existing.fingerprint === fingerprint) {
    bumpMoodDiscoveryPerf("normalizationCacheHits");
    return null;
  }

  bumpMoodDiscoveryPerf("catalogRecordsNormalized");
  if (existing) {
    removeFromIndex(moodToTrackIds, existing.moods, trackId);
    removeFromIndex(genreToTrackIds, existing.genres, trackId);
  }

  const moods = normalizeDiscoveryConcepts(extractRawMoodBlob(song));
  const genres = normalizeDiscoveryConcepts(song.genre);
  const next: MoodTrackNorm = {
    trackId,
    fingerprint,
    moods,
    genres,
    playable: songPlayable(song),
    artist: text(song.artist || song.artist_name),
  };
  trackNormById.set(trackId, next);
  moods.forEach((mood) => addToIndex(moodToTrackIds, mood, trackId));
  genres.forEach((genre) => addToIndex(genreToTrackIds, genre, trackId));
  return next;
}

export function getMoodTrackNorm(trackId: string): MoodTrackNorm | null {
  return trackNormById.get(String(trackId || "").trim()) || null;
}

export function getIndexedTrackIdsForMood(concept: string): ReadonlySet<string> {
  return moodToTrackIds.get(String(concept || "").trim().toLowerCase()) || new Set();
}

export function getIndexedTrackIdsForGenre(genre: string): ReadonlySet<string> {
  const key = String(genre || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!key) return new Set();
  const exact = genreToTrackIds.get(key);
  if (exact?.size) return exact;
  // Soft family match over indexed genre keys only (not full catalog scan).
  const hits = new Set<string>();
  genreToTrackIds.forEach((ids, genreKey) => {
    if (genreKey === key || genreKey.includes(key) || key.includes(genreKey)) {
      ids.forEach((id) => hits.add(id));
    }
  });
  return hits;
}

export function intersectMoodGenreIds(
  moods: string[],
  genreAnchor?: string
): string[] {
  const moodSets = moods
    .map((mood) => getIndexedTrackIdsForMood(mood))
    .filter((set) => set.size > 0);
  if (!moodSets.length && !genreAnchor) return [];

  let pool: Set<string>;
  if (genreAnchor) {
    pool = new Set(getIndexedTrackIdsForGenre(genreAnchor));
  } else if (moodSets.length) {
    pool = new Set(moodSets[0]);
  } else {
    return [];
  }

  if (moodSets.length) {
    // ANY mood concept (OR) within genre — matches room relevance contract.
    const moodUnion = new Set<string>();
    moodSets.forEach((set) => set.forEach((id) => moodUnion.add(id)));
    if (genreAnchor) {
      const filtered: string[] = [];
      moodUnion.forEach((id) => {
        if (pool.has(id)) filtered.push(id);
      });
      bumpMoodDiscoveryPerf("candidateIDsConsidered", filtered.length);
      return filtered;
    }
    const out = Array.from(moodUnion);
    bumpMoodDiscoveryPerf("candidateIDsConsidered", out.length);
    return out;
  }

  const out = Array.from(pool);
  bumpMoodDiscoveryPerf("candidateIDsConsidered", out.length);
  return out;
}

export function getMoodDiscoveryIndexSize() {
  return {
    tracks: trackNormById.size,
    moods: moodToTrackIds.size,
    genres: genreToTrackIds.size,
  };
}

/** Coalesce identical in-flight discovery promises by session key. */
const discoveryInflight = new Map<string, Promise<unknown>>();

export function coalesceDiscoveryRequest<T>(
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  const existing = discoveryInflight.get(key) as Promise<T> | undefined;
  if (existing) {
    bumpMoodDiscoveryPerf("duplicateRequestsPrevented");
    return existing;
  }
  const pending = factory().finally(() => {
    if (discoveryInflight.get(key) === pending) {
      discoveryInflight.delete(key);
    }
  });
  discoveryInflight.set(key, pending);
  return pending;
}
