import { MEDIA_DISCOVERY_PAGE_SIZE } from "../../constants/mediaDiscovery";
import { getRadioCategory, type RadioCategory } from "../../constants/radioCategories";
import { isMatureContentItem } from "../../types/matureContent";
import type { HiddenTunesStation, RadioBrowserStationRaw } from "../../types/radio";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { normalizeRadioBrowserStation } from "./radioNormalizer";
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

const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
] as const;

const RADIO_BROWSER_USER_AGENT = "HiddenTunes/1.0 (mobile radio browser)";
const STATION_FETCH_TIMEOUT_MS = 12000;

export const RADIO_STATION_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;
export const RADIO_SEARCH_MAX_RESULTS = 200;

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

export async function fetchRadioStationsPage(
  categoryId: string,
  offset = 0,
  limit = RADIO_STATION_PAGE_SIZE,
  signal?: AbortSignal
) {
  const category = getRadioCategory(categoryId);
  if (!category) return [];
  if (category.isMature && !shouldIncludeMatureInApi()) return [];

  const raw = await fetchRadioBrowserJson(
    buildCategoryPath(category, offset, limit),
    signal
  );

  let normalized = dedupeRadioStations(
    raw
      .map((station) => normalizeRadioBrowserStation(station, category.id))
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );

  if (category.useTopVotes && offset > 0) {
    normalized = normalized.slice(offset);
  }

  return filterMatureStations(normalized.slice(0, limit));
}

export async function fetchRadioSearchPage(
  query: string,
  offset = 0,
  limit = RADIO_STATION_PAGE_SIZE,
  signal?: AbortSignal
) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return [];

  const raw = await fetchRadioBrowserJson(buildSearchPath(safeQuery, offset, limit), signal);

  return filterMatureStations(
    dedupeRadioStations(
      raw
        .map((station) => normalizeRadioBrowserStation(station, "search"))
        .filter((station): station is HiddenTunesStation => Boolean(station))
    ).slice(0, limit)
  );
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
  fetchPage: (offset: number, limit: number, signal?: AbortSignal) => Promise<HiddenTunesStation[]>,
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
      if (cached) return cached;

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
      .then((page) => writeCachedRadioStations(safeKey, page, { append: append || offset > 0 }))
      .catch(async (error) => {
        if ((error as Error)?.name === "AbortError") {
          throw error;
        }

        const fallback =
          readCachedRadioStations(safeKey) || (await hydrateCachedRadioStations(safeKey)) || [];
        return filterMatureStations(fallback.slice(offset, offset + limit));
      });

    if (offset === 0 && !append && !options?.forceRefresh) {
      setRadioStationInflight(safeKey, fetchPromise);
    }

    const stations = await fetchPromise;

    return {
      stations: filterMatureStations(stations),
      hasMore: stations.length >= limit,
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
  const safeId = String(categoryId || "").trim();
  if (!safeId) return { stations: [], hasMore: false, fromCache: false };

  const category = getRadioCategory(safeId);
  if (category?.isMature && !shouldIncludeMatureInApi()) {
    return { stations: [], hasMore: false, fromCache: false };
  }

  return loadRadioPage(
    safeId,
    (offset, limit, signal) => fetchRadioStationsPage(safeId, offset, limit, signal),
    {
      ...options,
      requestKey: `category:${safeId}`,
    }
  );
}

export async function loadRadioSearchPage(query: string, options?: LoadRadioPageOptions) {
  const safeQuery = String(query || "").trim();
  const cacheKey = normalizeRadioSearchCacheKey(safeQuery);
  if (!cacheKey) return { stations: [], hasMore: false, fromCache: false };

  const offset = Math.max(0, Number(options?.offset) || 0);
  if (offset + RADIO_STATION_PAGE_SIZE > RADIO_SEARCH_MAX_RESULTS) {
    return { stations: [], hasMore: false, fromCache: false };
  }

  const result = await loadRadioPage(
    cacheKey,
    (pageOffset, limit, signal) => fetchRadioSearchPage(safeQuery, pageOffset, limit, signal),
    {
      ...options,
      requestKey: `search:${cacheKey}`,
    }
  );

  const cappedHasMore =
    result.hasMore && offset + result.stations.length < RADIO_SEARCH_MAX_RESULTS;

  return {
    ...result,
    hasMore: cappedHasMore,
  };
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
