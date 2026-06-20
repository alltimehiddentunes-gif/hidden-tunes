import AsyncStorage from "@react-native-async-storage/async-storage";

import type { HiddenTunesTvVideo } from "../services/tvCatalogApi";

const STORAGE_PREFIX = "hidden_tunes_video_discovery_v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 24;
const STORAGE_WRITE_DEBOUNCE_MS = 1200;

type CachedVideoPayload = {
  videos: HiddenTunesTvVideo[];
  cachedAt: number;
};

const memoryCache = new Map<string, CachedVideoPayload>();
const inflight = new Map<string, Promise<HiddenTunesTvVideo[]>>();
const pendingStorageWrites = new Map<string, CachedVideoPayload>();
const storageWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function normalizeVideoCategoryCacheKey(categoryId: string) {
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

function schedulePersistVideoCache(key: string, payload: CachedVideoPayload) {
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

export function readCachedVideos(categoryId: string) {
  const key = normalizeVideoCategoryCacheKey(categoryId);
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.videos;
  }
  return null;
}

export async function hydrateCachedVideos(categoryId: string) {
  const key = normalizeVideoCategoryCacheKey(categoryId);
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.videos;
  }

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedVideoPayload;
    if (!Array.isArray(parsed?.videos) || !isFresh(parsed.cachedAt)) {
      await AsyncStorage.removeItem(`${STORAGE_PREFIX}:${key}`);
      return null;
    }

    memoryCache.set(key, parsed);
    return parsed.videos;
  } catch {
    return null;
  }
}

export function writeCachedVideos(
  categoryId: string,
  videos: HiddenTunesTvVideo[]
) {
  const key = normalizeVideoCategoryCacheKey(categoryId);
  const payload: CachedVideoPayload = {
    videos,
    cachedAt: Date.now(),
  };

  memoryCache.set(key, payload);
  trimMemoryCache();
  schedulePersistVideoCache(key, payload);
}

export function getVideoDiscoveryInflight(categoryId: string) {
  return inflight.get(normalizeVideoCategoryCacheKey(categoryId));
}

export function setVideoDiscoveryInflight(
  categoryId: string,
  promise: Promise<HiddenTunesTvVideo[]>
) {
  const key = normalizeVideoCategoryCacheKey(categoryId);
  inflight.set(key, promise);

  promise.finally(() => {
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  });

  return promise;
}
