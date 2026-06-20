import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LaunchContentSnapshot } from "../services/launchContentLayer";

const STORAGE_KEY = "hidden_tunes_launch_content_v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const STORAGE_WRITE_DEBOUNCE_MS = 1200;

type CachedLaunchContentPayload = {
  fingerprint: string;
  cachedAt: number;
  snapshot: LaunchContentSnapshot;
};

let memoryCache: CachedLaunchContentPayload | null = null;
let pendingWrite: CachedLaunchContentPayload | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt < CACHE_TTL_MS;
}

export function readCachedLaunchContent(fingerprint?: string) {
  if (!memoryCache || !isFresh(memoryCache.cachedAt)) {
    return null;
  }

  if (fingerprint && memoryCache.fingerprint !== fingerprint) {
    return null;
  }

  return memoryCache.snapshot;
}

export async function hydrateLaunchContentCache() {
  if (memoryCache && isFresh(memoryCache.cachedAt)) {
    return memoryCache.snapshot;
  }

  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved) as CachedLaunchContentPayload;
    if (!parsed?.snapshot || !isFresh(parsed.cachedAt)) {
      return null;
    }

    memoryCache = parsed;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

export function schedulePersistLaunchContent(
  fingerprint: string,
  snapshot: LaunchContentSnapshot
) {
  pendingWrite = {
    fingerprint,
    cachedAt: Date.now(),
    snapshot,
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

export function clearLaunchContentCache() {
  memoryCache = null;
  pendingWrite = null;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
