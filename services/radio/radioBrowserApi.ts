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
import { fetchExpandedRadioSearchPage } from "./radioSearchDiscovery";
import { fetchRadioCatalogSearchPage } from "./radioCatalogApi";
import {
  countCachedRadioStations,
  getRadioStationInflight,
  hydrateCachedRadioStations,
  normalizeRadioSearchCacheKey,
  readCachedRadioPage,
  readCachedRadioStations,
  setRadioStationInflight,
  writeCachedRadioStations,
} from "./radioCache";
import {
  shouldPersistRadioSearchResult,
  shouldRevalidateShortRadioSearchCache,
  resolveRadioSearchHasMore,
  type RadioSearchResultSource,
} from "../../utils/radioSearchCachePolicy";

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
}> {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) {
    return { stations: [], source: "catalog", persist: false, hasMore: false };
  }

  // Production catalog search (full eligible HTTPS set). Radio Browser expansion
  // remains available as last-resort fallback only.
  try {
    const catalog = await fetchRadioCatalogSearchPage(safeQuery, offset, limit, signal);
    return {
      stations: catalog.stations,
      source: "catalog",
      persist: shouldPersistRadioSearchResult("catalog"),
      hasMore: catalog.hasMore,
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    // Last-resort fallback so search is not empty if the catalog API is down.
    // Never persist these rows under catalog-search:* (HTTPS filter can shrink 40→9).
    const stations = await fetchExpandedRadioSearchPage(
      safeQuery,
      offset,
      limit,
      (path, requestSignal) => fetchRadioBrowserJson(path, requestSignal ?? signal),
      signal
    );
    return {
      stations,
      source: "fallback",
      persist: shouldPersistRadioSearchResult("fallback"),
      hasMore: stations.length >= limit,
    };
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
};

type RadioPageFetchResult =
  | HiddenTunesStation[]
  | {
      stations: HiddenTunesStation[];
      persist?: boolean;
      hasMore?: boolean;
    };

function normalizeRadioPageFetchResult(page: RadioPageFetchResult) {
  if (Array.isArray(page)) {
    return {
      stations: page,
      persist: true,
      hasMore: undefined as boolean | undefined,
    };
  }
  return {
    stations: page.stations,
    persist: page.persist !== false,
    hasMore: page.hasMore,
  };
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
    } satisfies LoadRadioPageResult;
  }

  const hydrated = await hydrateCachedRadioStations(cacheKey);
  if (!hydrated?.length) return null;

  const page = hydrated.slice(offset, offset + limit);
  if (!page.length) return null;

  return {
    stations: filterMatureStations(page),
    hasMore: hydrated.length > offset + page.length || page.length >= limit,
    fromCache: true,
  } satisfies LoadRadioPageResult;
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

  try {
    if (!options?.forceRefresh) {
      const cached = await loadCachedOrHydratedPage(safeKey, offset, limit);
      if (cached) {
        const mustRevalidate =
          offset === 0 &&
          !append &&
          shouldRevalidateShortRadioSearchCache(safeKey, cached.stations.length, limit);
        if (!mustRevalidate) {
          return cached;
        }
        // Short catalog-search cache: fall through to network so poisoned 9-row
        // pages cannot permanently skip revalidation.
      }

      if (offset === 0 && !append) {
        const inflight = getRadioStationInflight(safeKey);
        if (inflight) {
          const stations = await inflight;
          return {
            stations: filterMatureStations(stations.slice(0, limit)),
            hasMore: stations.length >= limit,
            fromCache: true,
          };
        }
      }
    }

    const fetchPromise = fetchPage(offset, limit, signal)
      .then(async (page) => {
        logRadioDiscoveryFetch("radio-page", `${safeKey}@${offset}`);
        const normalized = normalizeRadioPageFetchResult(page);
        if (normalized.persist) {
          const written = await writeCachedRadioStations(safeKey, normalized.stations, {
            append: append || offset > 0,
          });
          return {
            stations: written,
            hasMore: resolveRadioSearchHasMore(
              written.length,
              limit,
              normalized.hasMore
            ),
          };
        }
        return {
          stations: normalized.stations,
          hasMore: resolveRadioSearchHasMore(
            normalized.stations.length,
            limit,
            normalized.hasMore
          ),
        };
      })
      .catch(async (error) => {
        if ((error as Error)?.name === "AbortError") {
          throw error;
        }

        const fallback =
          readCachedRadioStations(safeKey) || (await hydrateCachedRadioStations(safeKey)) || [];
        const stations = filterMatureStations(fallback.slice(offset, offset + limit));
        return {
          stations,
          hasMore: stations.length >= limit,
        };
      });

    if (offset === 0 && !append && !options?.forceRefresh) {
      setRadioStationInflight(
        safeKey,
        fetchPromise.then((result) => result.stations)
      );
    }

    const result = await fetchPromise;

    return {
      stations: filterMatureStations(result.stations),
      hasMore: result.hasMore,
      fromCache: false,
    };
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
