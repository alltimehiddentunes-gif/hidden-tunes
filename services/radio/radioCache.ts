import AsyncStorage from "@react-native-async-storage/async-storage";

import { isMatureContentItem } from "../../types/matureContent";
import type { HiddenTunesStation } from "../../types/radio";

const STORAGE_PREFIX = "hidden_tunes_radio_stations_v2";
const CACHE_TTL_MS = 18 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 24;
const MAX_STATIONS_PER_KEY = 2000;
const STORAGE_WRITE_DEBOUNCE_MS = 1200;

type CachedStationPayload = {
  stations: HiddenTunesStation[];
  cachedAt: number;
};

const memoryCache = new Map<string, CachedStationPayload>();
const inflight = new Map<string, Promise<HiddenTunesStation[]>>();
const pendingStorageWrites = new Map<string, CachedStationPayload>();
const storageWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function normalizeRadioCategoryCacheKey(categoryId: string) {
  return String(categoryId || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
}

export function normalizeRadioSearchCacheKey(query: string) {
  const safeQuery = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);

  if (!safeQuery) return "";

  // Namespace away from legacy Radio Browser search pages.
  return `catalog-search:${safeQuery.replace(/[^a-z0-9 _-]+/g, "")}`;
}

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt < CACHE_TTL_MS;
}

function trimMemoryCache() {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  const oldestKey = memoryCache.keys().next().value;
  if (oldestKey) memoryCache.delete(oldestKey);
}

function schedulePersistStationCache(key: string, payload: CachedStationPayload) {
  pendingStorageWrites.set(key, payload);

  const existing = storageWriteTimers.get(key);
  if (existing) clearTimeout(existing);

  storageWriteTimers.set(
    key,
    setTimeout(() => {
      storageWriteTimers.delete(key);
      const pending = pendingStorageWrites.get(key);
      pendingStorageWrites.delete(key);
      if (!pending) return;

      void AsyncStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(pending)).catch(
        () => {}
      );
    }, STORAGE_WRITE_DEBOUNCE_MS)
  );
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

  return deduped.slice(0, MAX_STATIONS_PER_KEY);
}

function getMemoryEntry(cacheKey: string) {
  const entry = memoryCache.get(cacheKey);
  if (!entry || !isFresh(entry.cachedAt)) return null;
  return entry;
}

export function readCachedRadioStations(cacheKey: string) {
  const key = normalizeRadioCategoryCacheKey(cacheKey);
  return getMemoryEntry(key)?.stations || null;
}

export function isRadioCacheFresh(cacheKey: string) {
  const key = normalizeRadioCategoryCacheKey(cacheKey);
  const entry = memoryCache.get(key);
  return Boolean(entry && isFresh(entry.cachedAt));
}

export function readCachedRadioPage(cacheKey: string, offset: number, limit: number) {
  const stations = readCachedRadioStations(cacheKey);
  if (!stations?.length) return [];
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, limit);
  return stations.slice(safeOffset, safeOffset + safeLimit);
}

export function getCachedRadioStationById(cacheKey: string, stationId: string) {
  const stations = readCachedRadioStations(cacheKey);
  if (!stations?.length) return null;
  return stations.find((station) => station.id === stationId) || null;
}

export async function hydrateCachedRadioStations(cacheKey: string) {
  const key = normalizeRadioCategoryCacheKey(cacheKey);
  const memoryEntry = getMemoryEntry(key);
  if (memoryEntry) return memoryEntry.stations;

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedStationPayload;
    if (!Array.isArray(parsed?.stations) || !isFresh(parsed.cachedAt)) {
      await AsyncStorage.removeItem(`${STORAGE_PREFIX}:${key}`);
      return null;
    }

    const payload: CachedStationPayload = {
      stations: dedupeRadioStations(parsed.stations),
      cachedAt: parsed.cachedAt,
    };

    memoryCache.set(key, payload);
    return payload.stations;
  } catch {
    return null;
  }
}

export function writeCachedRadioStations(
  cacheKey: string,
  stations: HiddenTunesStation[],
  options?: { append?: boolean }
) {
  const key = normalizeRadioCategoryCacheKey(cacheKey);
  const existing = readCachedRadioStations(cacheKey) || [];
  const merged = options?.append
    ? dedupeRadioStations([...existing, ...stations])
    : dedupeRadioStations(stations);

  const payload: CachedStationPayload = {
    stations: merged,
    cachedAt: Date.now(),
  };

  memoryCache.set(key, payload);
  trimMemoryCache();
  schedulePersistStationCache(key, payload);

  return merged;
}

export function getRadioStationInflight(cacheKey: string) {
  return inflight.get(normalizeRadioCategoryCacheKey(cacheKey));
}

export function setRadioStationInflight(
  cacheKey: string,
  promise: Promise<HiddenTunesStation[]>
) {
  const key = normalizeRadioCategoryCacheKey(cacheKey);
  inflight.set(key, promise);
  promise.finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  return promise;
}

export function countCachedRadioStations(cacheKey: string) {
  return readCachedRadioStations(cacheKey)?.length || 0;
}

function stripMatureStations(stations: HiddenTunesStation[]) {
  return stations.filter((station) => !isMatureContentItem(station));
}

function purgeMatureFromMemoryCache() {
  for (const [key, entry] of memoryCache.entries()) {
    if (key === "mature") {
      memoryCache.delete(key);
      continue;
    }

    const filtered = stripMatureStations(entry.stations);
    if (filtered.length !== entry.stations.length) {
      memoryCache.set(key, { ...entry, stations: filtered });
    }
  }
}

export function clearMatureRadioCache() {
  memoryCache.delete("mature");
  purgeMatureFromMemoryCache();

  for (const timer of storageWriteTimers.values()) {
    clearTimeout(timer);
  }
  storageWriteTimers.clear();
  pendingStorageWrites.clear();
  inflight.clear();

  void (async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const radioKeys = keys.filter((key) => key.startsWith(`${STORAGE_PREFIX}:`));

      await Promise.all(
        radioKeys.map(async (storageKey) => {
          const cacheKey = storageKey.slice(`${STORAGE_PREFIX}:`.length);
          if (cacheKey === "mature") {
            await AsyncStorage.removeItem(storageKey);
            return;
          }

          const raw = await AsyncStorage.getItem(storageKey);
          if (!raw) return;

          try {
            const parsed = JSON.parse(raw) as CachedStationPayload;
            if (!Array.isArray(parsed?.stations)) {
              await AsyncStorage.removeItem(storageKey);
              return;
            }

            const filtered = stripMatureStations(parsed.stations);
            if (filtered.length === 0) {
              await AsyncStorage.removeItem(storageKey);
              return;
            }

            if (filtered.length !== parsed.stations.length) {
              await AsyncStorage.setItem(
                storageKey,
                JSON.stringify({ ...parsed, stations: filtered })
              );
            }
          } catch {
            await AsyncStorage.removeItem(storageKey);
          }
        })
      );
    } catch {
      // Best-effort cache purge.
    }
  })();
}
