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
import type { HiddenTunesStation } from "../../types/radio";
import { logRadioDiscoveryFetch } from "../../utils/radioDiscoveryDiagnostics";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import {
  ensureHiddenTunesStationStream,
  fetchRadioCatalogSearchPage,
  fetchRadioCatalogStationsPage,
} from "./radioCatalogApi";
import {
  isMatureRadioCategory,
  loadMatureRadioCategoryPage,
} from "../mature/matureRadioDiscovery";
import {
  sortStationsByClicks,
  sortStationsByQuality,
  sortStationsByVotes,
} from "./radioQualityScore";
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
    if (streamKey) {
      if (seenStreams.has(streamKey)) continue;
      seenStreams.add(streamKey);
    }
    seenIds.add(station.id);
    deduped.push(station);
  }

  return deduped;
}

function curateCatalogStations(
  stations: HiddenTunesStation[],
  category: RadioCategory,
  limit: number
) {
  let curated = dedupeRadioStations(stations);

  if (category.laneKind === "featured") {
    curated = sortStationsByQuality(
      curated.filter((station) => (station.quality_score || 0) >= RADIO_FEATURED_MIN_QUALITY)
    );
  } else if (category.laneKind === "trending") {
    curated = sortStationsByClicks(curated);
  } else if (category.laneKind === "popular") {
    curated = sortStationsByVotes(
      curated.filter((station) => (station.quality_score || 0) >= RADIO_POPULAR_MIN_QUALITY)
    );
  }

  return filterMatureStations(curated.slice(0, limit));
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

  const page = Math.floor(offset / limit) + 1;
  const catalogResult = await fetchRadioCatalogStationsPage({
    category,
    page,
    limit,
    signal,
  });

  if (!catalogResult.success) return [];

  return curateCatalogStations(catalogResult.stations, category, limit);
}

export async function fetchRadioSearchPage(
  query: string,
  offset = 0,
  limit = RADIO_STATION_PAGE_SIZE,
  signal?: AbortSignal
) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return [];

  const page = Math.floor(offset / limit) + 1;
  const catalogResult = await fetchRadioCatalogSearchPage(safeQuery, {
    page,
    limit,
    signal,
  });

  if (!catalogResult.success) return [];

  return filterMatureStations(
    dedupeRadioStations(catalogResult.stations).slice(0, limit)
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
      .then((page) => {
        logRadioDiscoveryFetch("radio-page", `${safeKey}@${offset}`);
        return writeCachedRadioStations(safeKey, page, { append: append || offset > 0 });
      })
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
    (pageOffset, limit, signal) => fetchRadioSearchPage(safeQuery, pageOffset, limit, signal),
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
  let station: HiddenTunesStation | null = null;

  if (fallback?.id === stationId) {
    station = fallback;
  }

  if (!station) {
    station = readCachedRadioStations(cacheKey)?.find((entry) => entry.id === stationId) || null;
  }

  if (!station) {
    const hydrated = await hydrateCachedRadioStations(cacheKey);
    station = hydrated?.find((entry) => entry.id === stationId) || fallback || null;
  }

  return ensureHiddenTunesStationStream(station);
}

export { ensureHiddenTunesStationStream } from "./radioCatalogApi";
