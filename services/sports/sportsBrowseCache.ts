/**
 * Bounded in-memory Sports browse cache.
 * Distinguishes home / search / hub keys. Never caches aborted or enabled:false
 * forever. Does not store Sports TV pages (TV catalog owns its own memory cache).
 */

type CacheEntry<T> = {
  value: T;
  at: number;
  expiresAt: number;
};

const MAX_ENTRIES = 48;
const HOME_TTL_MS = 45_000;
const HOME_STALE_MS = 60_000;
const SEARCH_TTL_MS = 90_000;
const HUB_TTL_MS = 60_000;

const store = new Map<string, CacheEntry<unknown>>();

function prune() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function sportsHomeCacheKey(
  country: string,
  platform: string,
  accessMode: string,
  userId?: string | null
): string {
  return `home:${accessMode}:${country}:${platform}:${userId || "anon"}`;
}

export function sportsSearchCacheKey(
  q: string,
  page: number,
  limit: number,
  country: string,
  platform: string
): string {
  return `search:${q.toLowerCase()}:${page}:${limit}:${country}:${platform}`;
}

export function sportsSportHubCacheKey(
  slug: string,
  country: string,
  platform: string
): string {
  return `sport-hub:${slug}:${country}:${platform}`;
}

export function sportsCountryHubCacheKey(
  code: string,
  country: string,
  platform: string
): string {
  return `country-hub:${code}:${country}:${platform}`;
}

export function getSportsBrowseCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function peekSportsBrowseCacheAgeMs(key: string): number | null {
  const entry = store.get(key);
  if (!entry) return null;
  return Date.now() - entry.at;
}

export function isSportsBrowseCacheStale(
  key: string,
  staleMs: number = HOME_STALE_MS
): boolean {
  const age = peekSportsBrowseCacheAgeMs(key);
  if (age === null) return true;
  return age >= staleMs;
}

export function setSportsBrowseCache<T>(
  key: string,
  value: T,
  ttlMs: number
): void {
  store.set(key, {
    value,
    at: Date.now(),
    expiresAt: Date.now() + Math.max(1_000, ttlMs),
  });
  prune();
}

export function deleteSportsBrowseCache(key: string): void {
  store.delete(key);
}

export const SPORTS_HOME_CACHE_TTL_MS = HOME_TTL_MS;
export const SPORTS_HOME_STALE_MS = HOME_STALE_MS;
export const SPORTS_SEARCH_CACHE_TTL_MS = SEARCH_TTL_MS;
export const SPORTS_HUB_CACHE_TTL_MS = HUB_TTL_MS;

/** Test / diagnostics helper — not for product UI. */
export function __resetSportsBrowseCacheForTests(): void {
  store.clear();
}

export function __sportsBrowseCacheSizeForTests(): number {
  return store.size;
}
