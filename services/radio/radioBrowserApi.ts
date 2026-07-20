import { MEDIA_DISCOVERY_PAGE_SIZE } from "../../constants/mediaDiscovery";
import {
  getRadioCategory,
  resolveRadioCategoryId,
  type RadioCategory,
} from "../../constants/radioCategories";
import {
  RADIO_FEATURED_MIN_QUALITY,
  RADIO_POPULAR_MIN_QUALITY,
  radioHomeLaneCacheKey,
  type RadioHomeLaneId,
} from "../../constants/radioFoundation";
import { isMatureContentItem } from "../../types/matureContent";
import type { HiddenTunesStation, RadioBrowserStationRaw } from "../../types/radio";
import { logRadioDiscoveryFetch } from "../../utils/radioDiscoveryDiagnostics";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { normalizeRadioBrowserStation } from "./radioNormalizer";
import {
  isMatureRadioCategory,
  loadMatureRadioCategoryPage,
} from "../mature/matureRadioDiscovery";
import {
  enrichStationWithQuality,
  sortStationsByClicks,
  sortStationsByQuality,
  sortStationsByVotes,
} from "./radioQualityScore";
import { fetchRadioCatalogSearchPage } from "./radioCatalogApi";
import {
  countCachedRadioStations,
  getRadioStationInflight,
  hydrateCachedRadioStations,
  normalizeRadioSearchCacheKey,
  readCachedRadioPage,
  readCachedRadioStations,
  readRadioCachePaginationMeta,
  setRadioStationInflight,
  writeCachedRadioStations,
} from "./radioCache";
import {
  isCatalogRadioSearchCacheKey,
  shouldBypassCatalogSearchCacheForOffset,
  shouldFallThroughCatalogSearchCacheEnd,
  shouldPersistRadioSearchResult,
  shouldRevalidateShortRadioSearchCache,
  resolveRadioSearchHasMore,
  type RadioSearchResultSource,
} from "../../utils/radioSearchCachePolicy";
import { isCatalogAbortError, isCatalogTimeoutError } from "../catalogJsonFetch";

const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
] as const;

const RADIO_BROWSER_USER_AGENT = "HiddenTunes/1.0 (mobile radio browser)";
const STATION_FETCH_TIMEOUT_MS = 12000;

export const RADIO_STATION_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;
const browseAbortControllers = new Map<string, AbortController>();

export function cancelRadioBrowseRequest(requestKey: string) {
  const key = String(requestKey || "").trim();
  if (!key) return;

  const controller = browseAbortControllers.get(key);
  if (!controller) return;

  controller.abort();
  browseAbortControllers.delete(key);
}

function beginBrowseRequest(requestKey: string) {
  cancelRadioBrowseRequest(requestKey);
  const controller = new AbortController();
  browseAbortControllers.set(requestKey, controller);
  return controller.signal;
}

function endBrowseRequest(requestKey: string, signal: AbortSignal) {
  const controller = browseAbortControllers.get(requestKey);
  if (controller?.signal === signal) {
    browseAbortControllers.delete(requestKey);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parentSignal = init.signal;

  const onAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onAbort);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

function buildCategoryPath(category: RadioCategory, offset: number, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 40));
  const safeOffset = Math.max(0, offset);

  if (category.useTopClick) {
    return `/json/stations/topclick/${safeLimit + safeOffset}`;
  }

  if (category.useTopVotes) {
    return `/json/stations/topvote/${safeLimit + safeOffset}`;
  }

  if (category.countryCode) {
    return `/json/stations/bycountrycodeexact/${encodeURIComponent(
      category.countryCode
    )}?limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
  }

  const tag = encodeURIComponent(String(category.tag || category.id));
  return `/json/stations/search?tag=${tag}&limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
}

function buildSearchPath(query: string, offset: number, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 40));
  const safeOffset = Math.max(0, offset);
  const safeQuery = encodeURIComponent(String(query || "").trim());

  return `/json/stations/search?name=${safeQuery}&limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
}

async function fetchRadioBrowserJson(path: string, signal?: AbortSignal) {
  let lastError: unknown = null;

  for (const server of RADIO_BROWSER_SERVERS) {
    if (signal?.aborted) {
      const error = new Error("radio_browse_aborted");
      error.name = "AbortError";
      throw error;
    }

    try {
      const response = await fetchWithTimeout(
        `${server}${path}`,
        {
          headers: {
            "User-Agent": RADIO_BROWSER_USER_AGENT,
            Accept: "application/json",
          },
          signal,
        },
        STATION_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        lastError = new Error(`radio_browser_${response.status}`);
        continue;
      }

      const text = await response.text();
      if (!text.trim().startsWith("[")) {
        lastError = new Error("radio_browser_invalid_json");
        continue;
      }

      return JSON.parse(text) as RadioBrowserStationRaw[];
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("radio_browser_failed");
}

function filterMatureStations(stations: HiddenTunesStation[]) {
  if (shouldIncludeMatureInApi()) return stations;
  return stations.filter((station) => !isMatureContentItem(station));
}

function dedupeRadioStations(stations: HiddenTunesStation[]) {
  const seenIds = new Set<string>();
  const seenStreams = new Set<string>();
  const deduped: HiddenTunesStation[] = [];

  for (const station of stations) {
    if (seenIds.has(station.id)) continue;
    const streamKey = station.streamUrl.trim().toLowerCase();
    if (seenStreams.has(streamKey)) continue;
    seenIds.add(station.id);
    seenStreams.add(streamKey);
    deduped.push(station);
  }

  return deduped;
}

function normalizeAndCurateStations(
  raw: RadioBrowserStationRaw[],
  category: RadioCategory,
  offset: number,
  limit: number
) {
  let stations = dedupeRadioStations(
    raw
      .map((rawStation) => {
        const base = normalizeRadioBrowserStation(rawStation, category.id);
        if (!base) return null;
        return enrichStationWithQuality(base, rawStation);
      })
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );

  if (category.useTopClick || category.useTopVotes) {
    if (offset > 0) {
      stations = stations.slice(offset);
    }
  }

  if (category.laneKind === "featured") {
    stations = sortStationsByQuality(
      stations.filter((station) => (station.quality_score || 0) >= RADIO_FEATURED_MIN_QUALITY)
    );
  } else if (category.laneKind === "trending") {
    stations = sortStationsByClicks(stations);
  } else if (category.laneKind === "popular") {
    stations = sortStationsByVotes(
      stations.filter((station) => (station.quality_score || 0) >= RADIO_POPULAR_MIN_QUALITY)
    );
  }

  return filterMatureStations(stations.slice(0, limit));
}

function resolveCategoryCacheKey(categoryId: string) {
  const resolvedId = resolveRadioCategoryId(categoryId);
  const category = getRadioCategory(resolvedId);
  if (!category) return resolvedId;

  if (category.tier === "home-lane" && category.laneKind && category.laneKind !== "recommended") {
    return radioHomeLaneCacheKey(category.laneKind as RadioHomeLaneId);
  }

  if (category.laneKind === "recommended") {
    return radioHomeLaneCacheKey("recommended");
  }

  return resolvedId;
}

export async function fetchRadioStationsPage(
  categoryId: string,
  offset = 0,
  limit = RADIO_STATION_PAGE_SIZE,
  signal?: AbortSignal
) {
  const resolvedId = resolveRadioCategoryId(categoryId);
  const category = getRadioCategory(resolvedId);
  if (!category) return [];
  if (category.isMature && !shouldIncludeMatureInApi()) return [];
  if (category.laneKind === "recommended") return [];

  if (category.tier === "mature" && isMatureRadioCategory(resolvedId)) {
    if (signal?.aborted) return [];
    const result = await loadMatureRadioCategoryPage(resolvedId, offset);
    return result.stations.slice(0, limit);
  }

  const raw = await fetchRadioBrowserJson(
    buildCategoryPath(category, offset, limit),
    signal
  );

  return normalizeAndCurateStations(raw, category, offset, limit);
}

export async function fetchRadioSearchPage(
  query: string,
  offset = 0,
  limit = RADIO_STATION_PAGE_SIZE,
  signal?: AbortSignal
): Promise<{
  stations: HiddenTunesStation[];
  source: RadioSearchResultSource;
  persist: boolean;
  hasMore: boolean;
  backendTotal?: number;
  backendPageRowCount?: number;
  backendNextOffset?: number;
  rawBackendRowsReturned?: number;
  catalogError?: string;
}> {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) {
    return { stations: [], source: "catalog", persist: false, hasMore: false };
  }

  // Full-catalog search must use production pagination. Do NOT replace a catalog
  // timeout/failure with Radio Browser subset results — that yields 1–2 rows,
  // undefined backendTotal, and false "backend-exhausted-no-persist".
  try {
    const catalog = await fetchRadioCatalogSearchPage(safeQuery, offset, limit, signal);
    return {
      stations: catalog.stations,
      source: "catalog",
      persist: shouldPersistRadioSearchResult("catalog"),
      hasMore: catalog.hasMore,
      backendTotal: catalog.backendTotal,
      backendPageRowCount: catalog.backendPageRowCount,
      backendNextOffset: catalog.backendNextOffset,
      rawBackendRowsReturned: catalog.rawBackendRowsReturned,
    };
  } catch (error) {
    if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") throw error;
    // Propagate timeout to loadRadioPage ownership boundary (cache preserve + no LogBox).
    if (isCatalogTimeoutError(error)) throw error;

    const message = error instanceof Error ? error.message : String(error);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[RadioSearch] catalog request failed (no RB substitute)", {
        query: safeQuery,
        offset,
        message,
      });
    }
    throw error;
  }
}

type LoadRadioPageOptions = {
  offset?: number;
  limit?: number;
  forceRefresh?: boolean;
  append?: boolean;
  requestKey?: string;
};

type LoadRadioPageResult = {
  stations: HiddenTunesStation[];
  hasMore: boolean;
  fromCache: boolean;
  backendTotal?: number;
  backendPageRowCount?: number;
  backendNextOffset?: number;
  rawBackendRowsReturned?: number;
  source?: string;
  /** Dev/test: why pagination continued or stopped for this page. */
  stopReason?: string;
};

type RadioPageFetchResult =
  | HiddenTunesStation[]
  | {
      stations: HiddenTunesStation[];
      persist?: boolean;
      hasMore?: boolean;
      backendTotal?: number;
      backendPageRowCount?: number;
      backendNextOffset?: number;
      rawBackendRowsReturned?: number;
      source?: string;
    };

function normalizeRadioPageFetchResult(page: RadioPageFetchResult) {
  if (Array.isArray(page)) {
    return {
      stations: page,
      persist: true,
      hasMore: undefined as boolean | undefined,
      backendTotal: undefined as number | undefined,
      backendPageRowCount: undefined as number | undefined,
      backendNextOffset: undefined as number | undefined,
      rawBackendRowsReturned: undefined as number | undefined,
      source: undefined as string | undefined,
    };
  }
  return {
    stations: page.stations,
    persist: page.persist !== false,
    hasMore: page.hasMore,
    backendTotal: page.backendTotal,
    backendPageRowCount: page.backendPageRowCount,
    backendNextOffset: page.backendNextOffset,
    rawBackendRowsReturned: page.rawBackendRowsReturned,
    source: page.source,
  };
}

function logRadioSearchTrace(payload: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log("[RadioSearchTrace]", payload);
}

async function loadCachedOrHydratedPage(
  cacheKey: string,
  offset: number,
  limit: number
) {
  const memoryPage = readCachedRadioPage(cacheKey, offset, limit);
  if (memoryPage.length) {
    const total = countCachedRadioStations(cacheKey);
    return {
      stations: filterMatureStations(memoryPage),
      hasMore: total > offset + memoryPage.length || memoryPage.length >= limit,
      fromCache: true,
      cacheTotal: total,
    };
  }

  const hydrated = await hydrateCachedRadioStations(cacheKey);
  if (!hydrated?.length) return null;

  const page = hydrated.slice(offset, offset + limit);
  if (!page.length) return null;

  return {
    stations: filterMatureStations(page),
    hasMore: hydrated.length > offset + page.length || page.length >= limit,
    fromCache: true,
    cacheTotal: hydrated.length,
  };
}

async function loadRadioPage(
  cacheKey: string,
  fetchPage: (
    offset: number,
    limit: number,
    signal?: AbortSignal
  ) => Promise<RadioPageFetchResult>,
  options?: LoadRadioPageOptions
): Promise<LoadRadioPageResult> {
  const safeKey = String(cacheKey || "").trim();
  if (!safeKey) return { stations: [], hasMore: false, fromCache: false };

  const offset = Math.max(0, Number(options?.offset) || 0);
  const limit = Math.max(1, Math.min(Number(options?.limit) || RADIO_STATION_PAGE_SIZE, 40));
  const append = Boolean(options?.append);
  const requestKey = options?.requestKey || safeKey;
  const signal = beginBrowseRequest(requestKey);
  const catalogSearch = isCatalogRadioSearchCacheKey(safeKey);

  try {
    if (!options?.forceRefresh) {
      // Catalog-search playable cache must not own the backend cursor.
      const bypassCache = shouldBypassCatalogSearchCacheForOffset(safeKey, offset);

      if (!bypassCache) {
        const cached = await loadCachedOrHydratedPage(safeKey, offset, limit);
        if (cached) {
          const mustRevalidate =
            offset === 0 &&
            !append &&
            shouldRevalidateShortRadioSearchCache(safeKey, cached.stations.length, limit);

          const meta = readRadioCachePaginationMeta(safeKey);
          const fallThroughEnd =
            !mustRevalidate &&
            shouldFallThroughCatalogSearchCacheEnd({
              cacheKey: safeKey,
              offset,
              pageLength: cached.stations.length,
              cacheTotal: cached.cacheTotal,
              backendHasMore: meta?.backendHasMore,
            });

          if (!mustRevalidate && !fallThroughEnd) {
            const hasMore = catalogSearch
              ? meta?.backendHasMore !== false &&
                (cached.hasMore || meta?.backendHasMore === true)
              : cached.hasMore;

            logRadioSearchTrace({
              query: safeKey,
              requestOffset: offset,
              requestLimit: limit,
              rawBackendRowsReturned: cached.stations.length,
              backendTotal: meta?.backendTotal,
              backendHasMore: hasMore,
              backendNextOffset: hasMore ? offset + limit : undefined,
              normalizedRows: cached.stations.length,
              uniqueAdded: cached.stations.length,
              source: "cache",
              stopReason: hasMore ? "cache-page" : "cache-exhausted-backend-done",
            });

            return {
              stations: cached.stations,
              hasMore,
              fromCache: true,
              backendTotal: meta?.backendTotal,
              backendNextOffset: hasMore ? offset + limit : undefined,
              rawBackendRowsReturned: cached.stations.length,
              source: "cache",
              stopReason: hasMore ? "cache-page" : "cache-exhausted-backend-done",
            };
          }
          // Short / incomplete catalog-search cache: fall through to network.
        }
      }

      if (offset === 0 && !append) {
        const inflight = getRadioStationInflight(safeKey);
        if (inflight) {
          const stations = await inflight;
          return {
            stations: filterMatureStations(stations.slice(0, limit)),
            hasMore: stations.length >= limit,
            fromCache: true,
            stopReason: "inflight",
          };
        }
      }
    }

    const fetchPromise = fetchPage(offset, limit, signal)
      .then(async (page) => {
        logRadioDiscoveryFetch("radio-page", `${safeKey}@${offset}`);
        const normalized = normalizeRadioPageFetchResult(page);
        const backendHasMore = normalized.hasMore;
        // Page-based backend: always advance by request limit when hasMore, never by
        // normalized/raw row count (short last pages must not rematerialize page 1).
        const nextBackendOffset =
          typeof normalized.backendNextOffset === "number"
            ? normalized.backendNextOffset
            : backendHasMore === true
              ? offset + limit
              : undefined;

        if (normalized.persist) {
          await writeCachedRadioStations(safeKey, normalized.stations, {
            append: append || offset > 0,
            backendTotal: normalized.backendTotal,
            backendHasMore:
              typeof backendHasMore === "boolean" ? backendHasMore : undefined,
            nextBackendOffset,
          });
          const hasMore = resolveRadioSearchHasMore(
            normalized.stations.length,
            limit,
            backendHasMore
          );
          const stopReason = hasMore ? "backend-has-more" : "backend-exhausted";

          logRadioSearchTrace({
            query: safeKey,
            requestOffset: offset,
            requestLimit: limit,
            rawBackendRowsReturned: normalized.rawBackendRowsReturned ?? normalized.backendPageRowCount,
            backendTotal: normalized.backendTotal,
            backendHasMore: hasMore,
            backendNextOffset: nextBackendOffset,
            normalizedRows: normalized.stations.length,
            uniqueAdded: normalized.stations.length,
            source: normalized.source || "catalog",
            stopReason,
          });

          return {
            stations: normalized.stations,
            hasMore,
            backendTotal: normalized.backendTotal,
            backendPageRowCount: normalized.backendPageRowCount,
            backendNextOffset: nextBackendOffset,
            rawBackendRowsReturned: normalized.rawBackendRowsReturned,
            source: normalized.source || "catalog",
            stopReason,
          };
        }
        const hasMore = resolveRadioSearchHasMore(
          normalized.stations.length,
          limit,
          backendHasMore
        );
        const stopReason = hasMore
          ? "backend-has-more-no-persist"
          : "backend-exhausted-no-persist";
        logRadioSearchTrace({
          query: safeKey,
          requestOffset: offset,
          requestLimit: limit,
          rawBackendRowsReturned: normalized.rawBackendRowsReturned ?? normalized.stations.length,
          backendTotal: normalized.backendTotal,
          backendHasMore: hasMore,
          backendNextOffset: nextBackendOffset,
          normalizedRows: normalized.stations.length,
          uniqueAdded: normalized.stations.length,
          source: normalized.source || "unknown",
          stopReason,
        });
        return {
          stations: normalized.stations,
          hasMore,
          backendTotal: normalized.backendTotal,
          backendPageRowCount: normalized.backendPageRowCount,
          backendNextOffset: nextBackendOffset,
          rawBackendRowsReturned: normalized.rawBackendRowsReturned,
          source: normalized.source,
          stopReason,
        };
      })
      .catch(async (error) => {
        if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") {
          throw error;
        }

        const fallback =
          readCachedRadioStations(safeKey) || (await hydrateCachedRadioStations(safeKey)) || [];
        const stations = filterMatureStations(fallback.slice(offset, offset + limit));

        // Bounded catalog timeout: keep cache visible, do not mark backend exhausted.
        if (isCatalogTimeoutError(error)) {
          const meta = readRadioCachePaginationMeta(safeKey);
          const hasMore =
            catalogSearch
              ? meta?.backendHasMore !== false
              : stations.length >= limit || Boolean(fallback.length);
          logRadioSearchTrace({
            query: safeKey,
            requestOffset: offset,
            requestLimit: limit,
            rawBackendRowsReturned: stations.length,
            backendTotal: meta?.backendTotal,
            backendHasMore: hasMore,
            normalizedRows: stations.length,
            uniqueAdded: stations.length,
            source: "cache-timeout",
            stopReason: "catalog-timeout-cache-preserved",
          });
          return {
            stations,
            hasMore,
            backendTotal: meta?.backendTotal,
            backendPageRowCount: stations.length,
            backendNextOffset: hasMore ? offset + limit : undefined,
            rawBackendRowsReturned: stations.length,
            stopReason: "catalog-timeout-cache-preserved",
            source: "cache-timeout",
          };
        }

        return {
          stations,
          hasMore: stations.length >= limit,
          stopReason: "network-error-cache-fallback",
          source: "cache-fallback",
        };
      });

    if (offset === 0 && !append && !options?.forceRefresh) {
      setRadioStationInflight(
        safeKey,
        fetchPromise
          .then((result) => result.stations)
          .catch((error) => {
            // Prevent unhandled rejection on abort / expected catalog timeout.
            if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") {
              return [] as HiddenTunesStation[];
            }
            if (isCatalogTimeoutError(error)) {
              return [] as HiddenTunesStation[];
            }
            throw error;
          })
      );
    }

    try {
      const result = await fetchPromise;

      return {
        stations: filterMatureStations(result.stations),
        hasMore: result.hasMore,
        fromCache: Boolean(
          result.source === "cache-timeout" || result.source === "cache-fallback"
        ),
        backendTotal: result.backendTotal,
        backendPageRowCount: result.backendPageRowCount,
        backendNextOffset: result.backendNextOffset,
        rawBackendRowsReturned: result.rawBackendRowsReturned,
        source: result.source,
        stopReason: result.stopReason,
      };
    } catch (error) {
      // External cancellation (unmount / query replace) — silent empty page.
      if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") {
        return {
          stations: [],
          hasMore: false,
          fromCache: false,
          stopReason: "aborted",
        };
      }
      // Timeout should already be settled above; swallow as last resort (no LogBox).
      if (isCatalogTimeoutError(error)) {
        const fallback =
          readCachedRadioStations(safeKey) || (await hydrateCachedRadioStations(safeKey)) || [];
        const stations = filterMatureStations(fallback.slice(offset, offset + limit));
        const meta = readRadioCachePaginationMeta(safeKey);
        return {
          stations,
          hasMore: catalogSearch ? meta?.backendHasMore !== false : stations.length >= limit,
          fromCache: true,
          backendTotal: meta?.backendTotal,
          backendPageRowCount: stations.length,
          rawBackendRowsReturned: stations.length,
          stopReason: "catalog-timeout-cache-preserved",
          source: "cache-timeout",
        };
      }
      throw error;
    }
  } finally {
    endBrowseRequest(requestKey, signal);
  }
}

export async function loadRadioCategoryPage(
  categoryId: string,
  options?: LoadRadioPageOptions
) {
  const resolvedId = resolveRadioCategoryId(String(categoryId || "").trim());
  if (!resolvedId) return { stations: [], hasMore: false, fromCache: false };

  const category = getRadioCategory(resolvedId);
  if (category?.isMature && !shouldIncludeMatureInApi()) {
    return { stations: [], hasMore: false, fromCache: false };
  }

  if (category?.laneKind === "recommended") {
    const { loadRecommendedRadioLanePage } = await import("./radioHomeLanes");
    return loadRecommendedRadioLanePage(options);
  }

  const cacheKey = resolveCategoryCacheKey(resolvedId);

  return loadRadioPage(
    cacheKey,
    (offset, limit, signal) => fetchRadioStationsPage(resolvedId, offset, limit, signal),
    {
      ...options,
      requestKey: `category:${resolvedId}`,
    }
  );
}

export async function loadRadioSearchPage(query: string, options?: LoadRadioPageOptions) {
  const safeQuery = String(query || "").trim();
  const cacheKey = normalizeRadioSearchCacheKey(safeQuery);
  if (!cacheKey) return { stations: [], hasMore: false, fromCache: false };

  return loadRadioPage(
    cacheKey,
    async (pageOffset, limit, signal) => {
      const result = await fetchRadioSearchPage(safeQuery, pageOffset, limit, signal);
      return {
        stations: result.stations,
        persist: result.persist,
        hasMore: result.hasMore,
        backendTotal: result.backendTotal,
        backendPageRowCount: result.backendPageRowCount,
        backendNextOffset: result.backendNextOffset,
        rawBackendRowsReturned: result.rawBackendRowsReturned,
        source: result.source,
      };
    },
    {
      ...options,
      requestKey: `search:${cacheKey}`,
    }
  );
}

export async function resolveRadioStationForPlayback(
  cacheKey: string,
  stationId: string,
  fallback?: HiddenTunesStation | null
) {
  if (fallback?.id === stationId && fallback.streamUrl) {
    return fallback;
  }

  const cached = readCachedRadioStations(cacheKey)?.find((station) => station.id === stationId);
  if (cached) return cached;

  const hydrated = await hydrateCachedRadioStations(cacheKey);
  return hydrated?.find((station) => station.id === stationId) || fallback || null;
}
