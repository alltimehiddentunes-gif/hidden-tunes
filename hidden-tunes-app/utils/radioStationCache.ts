import AsyncStorage from "@react-native-async-storage/async-storage";

import type { HiddenTunesStation } from "../services/radioStationApi";

const STORAGE_PREFIX = "hidden_tunes_radio_stations_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 32;
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

      void AsyncStorage.setItem(
        `${STORAGE_PREFIX}:${key}`,
        JSON.stringify(pending)
      ).catch(() => {});
    }, STORAGE_WRITE_DEBOUNCE_MS)
  );
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
  stations: HiddenTunesStation[]
) {
  const key = normalizeRadioCategoryCacheKey(categoryId);
  const payload: CachedStationPayload = {
    stations,
    cachedAt: Date.now(),
  };

  memoryCache.set(key, payload);
  trimMemoryCache();
  schedulePersistStationCache(key, payload);
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
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  });

  return promise;
}

export function getCachedRadioStation(
  categoryId: string,
  stationId: string
): HiddenTunesStation | null {
  const stations =
    readCachedRadioStations(categoryId) ||
    memoryCache.get(normalizeRadioCategoryCacheKey(categoryId))?.stations ||
    [];

  return (
    stations.find((station) => String(station.id) === String(stationId)) ||
    null
  );
}
