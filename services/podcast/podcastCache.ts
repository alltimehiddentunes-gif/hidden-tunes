const METADATA_TTL_MS = 6 * 60 * 60 * 1000;
const EPISODE_TTL_MS = 60 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const metadataCache = new Map<string, CacheEntry<unknown>>();
const episodeCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function getCachedMetadata<T>(key: string): T | null {
  const entry = metadataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    metadataCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedMetadata<T>(key: string, value: T) {
  metadataCache.set(key, { value, expiresAt: Date.now() + METADATA_TTL_MS });
}

export function getCachedEpisodes<T>(key: string): T | null {
  const entry = episodeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    episodeCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedEpisodes<T>(key: string, value: T) {
  episodeCache.set(key, { value, expiresAt: Date.now() + EPISODE_TTL_MS });
}

export async function runSingleFlight<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = task().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCachedMetadata(key: string) {
  metadataCache.delete(key);
}

export function invalidateCachedEpisodes(key: string) {
  episodeCache.delete(key);
}

export function clearPodcastCaches() {
  metadataCache.clear();
  episodeCache.clear();
}
