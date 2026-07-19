/**
 * Narrow policy helpers for Radio Search catalog vs fallback caching.
 * Keep Radio Browser fallback available, but never let it poison catalog-search caches.
 */

export type RadioSearchResultSource = "catalog" | "fallback";

export function isCatalogRadioSearchCacheKey(cacheKey: string) {
  return String(cacheKey || "")
    .trim()
    .toLowerCase()
    .startsWith("catalog-search:");
}

/** Only successful Hidden Tunes catalog pages may persist under catalog-search:*. */
export function shouldPersistRadioSearchResult(source: RadioSearchResultSource) {
  return source === "catalog";
}

/**
 * Short first pages under catalog-search must revalidate — they are often
 * poisoned Radio Browser HTTPS leftovers (e.g. 9 of 40) and must not lock hasMore=false.
 */
export function shouldRevalidateShortRadioSearchCache(
  cacheKey: string,
  cachedLength: number,
  pageSize: number
) {
  if (!isCatalogRadioSearchCacheKey(cacheKey)) return false;
  const length = Math.max(0, Number(cachedLength) || 0);
  const limit = Math.max(1, Number(pageSize) || 1);
  return length > 0 && length < limit;
}

/** Prefer backend hasMore when present; otherwise fall back to page-length heuristic. */
export function resolveRadioSearchHasMore(
  stationsLength: number,
  pageSize: number,
  backendHasMore?: boolean
) {
  if (typeof backendHasMore === "boolean") return backendHasMore;
  return stationsLength >= Math.max(1, Number(pageSize) || 1);
}
