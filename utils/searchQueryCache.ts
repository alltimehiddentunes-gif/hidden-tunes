import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "hidden_tunes_search_results_v1";
type SearchSource = "all" | "hidden" | "audius" | "archive" | "youtube" | string;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 24;

type CachedSearchPayload = {
  results: unknown[];
  cachedAt: number;
};

const memoryCache = new Map<string, CachedSearchPayload>();

export function normalizeSearchQueryKey(query: string, source: SearchSource) {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return `${String(source || "all")}:${normalizedQuery}`;
}

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt < CACHE_TTL_MS;
}

function trimMemoryCache() {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;

  const oldestKey = memoryCache.keys().next().value;
  if (oldestKey) memoryCache.delete(oldestKey);
}

export async function getCachedSearchResults<T = unknown>(
  query: string,
  source: SearchSource
): Promise<T[] | null> {
  const key = normalizeSearchQueryKey(query, source);
  const memoryEntry = memoryCache.get(key);

  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.results as T[];
  }

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedSearchPayload;
    if (!Array.isArray(parsed?.results) || !isFresh(parsed.cachedAt)) {
      await AsyncStorage.removeItem(`${STORAGE_PREFIX}:${key}`);
      return null;
    }

    memoryCache.set(key, parsed);
    return parsed.results as T[];
  } catch {
    return null;
  }
}

export async function setCachedSearchResults<T = unknown>(
  query: string,
  source: SearchSource,
  results: T[]
) {
  const key = normalizeSearchQueryKey(query, source);
  const payload: CachedSearchPayload = {
    results,
    cachedAt: Date.now(),
  };

  memoryCache.set(key, payload);
  trimMemoryCache();

  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(payload));
  } catch {}
}

export function clearSearchQueryCache() {
  memoryCache.clear();
}

/**
 * Read-only peek at in-memory search query cache for Home personalisation.
 * Does not change Search behaviour or touch AsyncStorage.
 */
export function listFreshCachedSearchQueries(limit = 24): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  for (const [key, entry] of memoryCache.entries()) {
    if (!entry || !isFresh(entry.cachedAt)) continue;
    const separator = key.indexOf(":");
    const query = separator >= 0 ? key.slice(separator + 1).trim() : "";
    if (!query || seen.has(query)) continue;
    seen.add(query);
    queries.push(query);
    if (queries.length >= limit) break;
  }

  return queries;
}

export function hasFreshSearchResults(query: string, source: SearchSource) {
  const key = normalizeSearchQueryKey(query, source);
  const memoryEntry = memoryCache.get(key);
  return Boolean(memoryEntry && isFresh(memoryEntry.cachedAt));
}
