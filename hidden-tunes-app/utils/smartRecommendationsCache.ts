import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SmartRecommendationsBundle } from "../services/smartRecommendations";

const STORAGE_KEY = "hidden_tunes_smart_recommendations_v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const STORAGE_WRITE_DEBOUNCE_MS = 1200;

type CachedSmartRecommendationsPayload = {
  fingerprint: string;
  cachedAt: number;
  bundle: SmartRecommendationsBundle;
};

let memoryCache: CachedSmartRecommendationsPayload | null = null;
let pendingWrite: CachedSmartRecommendationsPayload | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt < CACHE_TTL_MS;
}

export function readCachedSmartRecommendations(fingerprint?: string) {
  if (!memoryCache || !isFresh(memoryCache.cachedAt)) {
    return null;
  }

  if (fingerprint && memoryCache.fingerprint !== fingerprint) {
    return null;
  }

  return memoryCache.bundle;
}

export async function hydrateSmartRecommendationsCache() {
  if (memoryCache && isFresh(memoryCache.cachedAt)) {
    return memoryCache.bundle;
  }

  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved) as CachedSmartRecommendationsPayload;
    if (!parsed?.bundle || !isFresh(parsed.cachedAt)) {
      return null;
    }

    memoryCache = parsed;
    return parsed.bundle;
  } catch {
    return null;
  }
}

export function schedulePersistSmartRecommendations(
  fingerprint: string,
  bundle: SmartRecommendationsBundle
) {
  pendingWrite = {
    fingerprint,
    cachedAt: Date.now(),
    bundle,
  };

  memoryCache = pendingWrite;

  if (writeTimer) clearTimeout(writeTimer);

  writeTimer = setTimeout(() => {
    writeTimer = null;
    const payload = pendingWrite;
    pendingWrite = null;
    if (!payload) return;

    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, STORAGE_WRITE_DEBOUNCE_MS);
}

export function clearSmartRecommendationsCache() {
  memoryCache = null;
  pendingWrite = null;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
