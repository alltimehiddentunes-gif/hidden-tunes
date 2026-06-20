import AsyncStorage from "@react-native-async-storage/async-storage";

import type { HiddenTunesStation } from "../../types/radio";

const STORAGE_PREFIX = "hidden_tunes_radio_stations_v2";
const CACHE_TTL_MS = 18 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 24;

type CachedStationPayload = {
  stations: HiddenTunesStation[];
  cachedAt: number;
};

const memoryCache = new Map<string, CachedStationPayload>();
const inflight = new Map<string, Promise<HiddenTunesStation[]>>();

export function normalizeRadioCategoryCacheKey(categoryId: string) {
  return String(categoryId || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
}

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt < CACHE_TTL_MS;
}

function trimMemoryCache() {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  const oldestKey = memoryCache.keys().next().value;
  if (oldestKey) memoryCache.delete(oldestKey);
}

export function readCachedRadioStations(categoryId: string) {
  const key = normalizeRadioCategoryCacheKey(categoryId);
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.stations;
  }
  return null;
}

export async function hydrateCachedRadioStations(categoryId: string) {
  const key = normalizeRadioCategoryCacheKey(categoryId);
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.stations;
  }

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedStationPayload;
    if (!Array.isArray(parsed?.stations) || !isFresh(parsed.cachedAt)) {
      await AsyncStorage.removeItem(`${STORAGE_PREFIX}:${key}`);
      return null;
    }

    memoryCache.set(key, parsed);
    return parsed.stations;
  } catch {
    return null;
  }
}

export function writeCachedRadioStations(
  categoryId: string,
  stations: HiddenTunesStation[],
  options?: { append?: boolean }
) {
  const key = normalizeRadioCategoryCacheKey(categoryId);
  const existing = readCachedRadioStations(categoryId) || [];
  const merged = options?.append
    ? dedupeRadioStations([...existing, ...stations])
    : dedupeRadioStations(stations);

  const payload: CachedStationPayload = {
    stations: merged,
    cachedAt: Date.now(),
  };

  memoryCache.set(key, payload);
  trimMemoryCache();

  void AsyncStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(payload)).catch(
    () => {}
  );

  return merged;
}

export function getRadioStationInflight(categoryId: string) {
  return inflight.get(normalizeRadioCategoryCacheKey(categoryId));
}

export function setRadioStationInflight(
  categoryId: string,
  promise: Promise<HiddenTunesStation[]>
) {
  const key = normalizeRadioCategoryCacheKey(categoryId);
  inflight.set(key, promise);
  promise.finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  return promise;
}

function dedupeRadioStations(stations: HiddenTunesStation[]) {
  const seenIds = new Set<string>();
  const seenStreams = new Set<string>();
  const deduped: HiddenTunesStation[] = [];

  for (const station of stations) {
    if (!station?.id || seenIds.has(station.id)) continue;
    const streamKey = String(station.streamUrl || "").trim().toLowerCase();
    if (!streamKey || seenStreams.has(streamKey)) continue;
    seenIds.add(station.id);
    seenStreams.add(streamKey);
    deduped.push(station);
  }

  return deduped;
}
