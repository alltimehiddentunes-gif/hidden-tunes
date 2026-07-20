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

/**
 * Catalog-search caches store playable rows, not backend pages.
 * Serving offset>0 from that list and deriving hasMore from cache length
 * stops search early (e.g. jazz at ~199) while backend pages remain.
 *
 * Return true when loadRadioPage must hit the network instead of cache.
 */
export function shouldBypassCatalogSearchCacheForOffset(
  cacheKey: string,
  offset: number
) {
  return isCatalogRadioSearchCacheKey(cacheKey) && Math.max(0, Number(offset) || 0) > 0;
}

/**
 * At the end of a local catalog-search cache, only stop if the backend
 * previously reported exhaustion. Unknown/legacy meta must fall through.
 */
export function shouldFallThroughCatalogSearchCacheEnd(options: {
  cacheKey: string;
  offset: number;
  pageLength: number;
  cacheTotal: number;
  backendHasMore?: boolean | null;
}) {
  if (!isCatalogRadioSearchCacheKey(options.cacheKey)) return false;
  if (options.backendHasMore === false) return false;

  const offset = Math.max(0, Number(options.offset) || 0);
  const pageLength = Math.max(0, Number(options.pageLength) || 0);
  const cacheTotal = Math.max(0, Number(options.cacheTotal) || 0);
  const atEndOfCache = pageLength === 0 || offset + pageLength >= cacheTotal;
  return atEndOfCache;
}

/** Bounded empty-page guard: keep paging while backend hasMore. */
export const RADIO_SEARCH_MAX_CONSECUTIVE_EMPTY_PAGES = 8;
