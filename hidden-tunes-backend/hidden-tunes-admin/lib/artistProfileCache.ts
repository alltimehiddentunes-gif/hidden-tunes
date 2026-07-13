const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 500;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  if (cache.size <= MAX_ENTRIES) return;
  const overflow = cache.size - MAX_ENTRIES;
  const keys = Array.from(cache.keys()).slice(0, overflow);
  for (const key of keys) cache.delete(key);
}

export function artistCacheKey(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(":");
}

export function getArtistCache<T>(key: string): T | null {
  pruneExpired();
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setArtistCache<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS) {
  pruneExpired();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateArtistCache(artistId: string) {
  const prefix = `${artistId}:`;
  for (const key of cache.keys()) {
    if (key === artistId || key.startsWith(prefix) || key.includes(`:artist:${artistId}`)) {
      cache.delete(key);
    }
  }
}

export function clearArtistCache() {
  cache.clear();
}

export async function withArtistCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const cached = getArtistCache<T>(key);
  if (cached !== null) return cached;
  const value = await loader();
  setArtistCache(key, value, ttlMs);
  return value;
}
