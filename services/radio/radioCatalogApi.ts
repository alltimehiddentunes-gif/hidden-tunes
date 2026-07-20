/**
 * Production radio catalog client (admin.hiddentunes.com).
 * Search path only — category browse still uses Radio Browser until a later swap.
 *
 * Search is metadata-first and uncapped by client policy:
 * - 40 rows per request
 * - zero /play calls during list load
 * - id + name are enough for a visible row
 * - playback resolves on tap via fetchRadioStationPlay
 *
 * Backend paging contract (verified against production):
 * - stations[] at payload.stations
 * - pagination: { page, limit, total, totalPages, hasMore }
 * - page= is honored; offset= is IGNORED (same page 1 results)
 * - Client maps offset → page via floor(offset/limit)+1 and advances by limit
 */
import { MEDIA_DISCOVERY_PAGE_SIZE } from "../../constants/mediaDiscovery";
import type { HiddenTunesStation } from "../../types/radio";
import { isMatureContentItem } from "../../types/matureContent";
import {
  catalogJsonFetch,
  isCatalogAbortError,
} from "../catalogJsonFetch";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { sanitizeStationTagsForDisplay } from "./radioNormalizer";
import { isPlayableLiveRadioStreamUrl } from "./radioPlaybackSession";

export const RADIO_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const RADIO_CATALOG_STATIONS_PATH = "/api/radio/stations";
export const RADIO_CATALOG_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;

export type RadioCatalogPublicStation = {
  id?: string;
  name?: string;
  artwork_url?: string | null;
  country?: string | null;
  country_code?: string | null;
  state?: string | null;
  language?: string | null;
  tags?: string[] | null;
  categories?: string[] | null;
  bitrate?: number | null;
  codec?: string | null;
  quality_score?: number | null;
  reliability_score?: number | null;
  is_mature?: boolean | null;
  content_rating?: string | null;
  stream_url?: string | null;
};

export type RadioCatalogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type RadioCatalogStationsResponse = {
  success?: boolean;
  stations?: RadioCatalogPublicStation[];
  pagination?: RadioCatalogPagination;
  error?: string;
};

/** Keep direct HTTPS when list payload includes it; never require it for visibility. */
export function pickOptionalHttpsStreamUrl(value: unknown) {
  const candidate = String(value || "").trim();
  if (!candidate.startsWith("https://")) return "";
  return candidate;
}

function normalizeCatalogTags(station: RadioCatalogPublicStation) {
  const fromTags = Array.isArray(station.tags) ? station.tags : [];
  const fromCategories = Array.isArray(station.categories) ? station.categories : [];
  return sanitizeStationTagsForDisplay(
    [...fromTags, ...fromCategories]
      .map((tag) => String(tag || "").trim().toLowerCase())
      .filter(Boolean)
  ).slice(0, 8);
}

/**
 * Metadata-first map: stable id + name are enough for discovery cards.
 * streamUrl may be empty until tap-time /play resolve.
 */
export function mapRadioCatalogStationToHiddenTunes(
  station: RadioCatalogPublicStation
): HiddenTunesStation | null {
  const id = String(station.id || "").trim().toLowerCase();
  const name = String(station.name || "").trim();

  if (!id || !name) return null;

  const tags = normalizeCatalogTags(station);
  const country =
    String(station.country_code || station.country || "")
      .trim()
      .toUpperCase()
      .slice(0, 2) || undefined;

  return {
    id,
    name,
    streamUrl: pickOptionalHttpsStreamUrl(station.stream_url),
    favicon: String(station.artwork_url || "").trim() || undefined,
    country,
    language: String(station.language || "").trim() || undefined,
    tags,
    bitrate: Number.isFinite(Number(station.bitrate))
      ? Number(station.bitrate)
      : undefined,
    codec: String(station.codec || "").trim() || undefined,
    quality_score: Number.isFinite(Number(station.reliability_score))
      ? Number(station.reliability_score)
      : Number.isFinite(Number(station.quality_score))
        ? Number(station.quality_score)
        : undefined,
    categoryId: "search",
    cachedAt: Date.now(),
    is_mature: station.is_mature === true,
    content_rating: (station.content_rating as HiddenTunesStation["content_rating"]) || undefined,
  };
}

/** Exact-ID dedupe. Empty streams must not collapse distinct stations. */
export function dedupeCatalogStations(stations: HiddenTunesStation[]) {
  const seenIds = new Set<string>();
  const seenStreams = new Set<string>();
  const deduped: HiddenTunesStation[] = [];

  for (const station of stations) {
    if (!station?.id || seenIds.has(station.id)) continue;
    const streamKey = String(station.streamUrl || "").trim().toLowerCase();
    if (streamKey && seenStreams.has(streamKey)) continue;
    seenIds.add(station.id);
    if (streamKey) seenStreams.add(streamKey);
    deduped.push(station);
  }

  return deduped;
}

function filterMatureStations(stations: HiddenTunesStation[]) {
  if (shouldIncludeMatureInApi()) return stations;
  return stations.filter((station) => !isMatureContentItem(station));
}

/**
 * Map production pagination fields. Does not invent values.
 * Production shape: pagination.{ page, limit, total, totalPages, hasMore }
 */
export function parseRadioCatalogPagination(
  payload: unknown,
  options: { requestOffset: number; requestLimit: number; rawBackendRowsReturned: number }
) {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const pagRaw = root.pagination;
  const pag =
    pagRaw && typeof pagRaw === "object"
      ? (pagRaw as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const totalNum = Number(pag.total ?? pag.total_count ?? root.total);
  const backendTotal = Number.isFinite(totalNum) ? totalNum : undefined;

  const hasMoreRaw = pag.hasMore ?? pag.has_more ?? root.hasMore ?? root.has_more;
  let backendHasMore: boolean | undefined =
    typeof hasMoreRaw === "boolean" ? hasMoreRaw : undefined;

  const pageNum = Number(pag.page ?? root.page);
  const limitNum = Number(pag.limit ?? options.requestLimit);
  const totalPagesNum = Number(pag.totalPages ?? pag.total_pages);

  // Derive hasMore only when explicit flag missing but page math is complete.
  if (
    backendHasMore === undefined &&
    Number.isFinite(pageNum) &&
    Number.isFinite(limitNum) &&
    Number.isFinite(totalNum)
  ) {
    backendHasMore = pageNum * limitNum < totalNum;
  } else if (
    backendHasMore === undefined &&
    Number.isFinite(pageNum) &&
    Number.isFinite(totalPagesNum)
  ) {
    backendHasMore = pageNum < totalPagesNum;
  }

  // Backend is page-based (offset= is ignored). Advance by requestLimit, not raw row count.
  const pageSize = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : options.requestLimit;
  const backendNextOffset =
    backendHasMore === true ? options.requestOffset + pageSize : undefined;

  return {
    backendTotal,
    backendHasMore,
    backendNextOffset,
    backendPage: Number.isFinite(pageNum) ? pageNum : undefined,
    backendLimit: Number.isFinite(limitNum) ? limitNum : undefined,
    rawBackendRowsReturned: options.rawBackendRowsReturned,
  };
}

/**
 * Full-catalog metadata search. No https_only gate.
 * include_stream=1 is optional enrichment only (direct HTTPS when present).
 *
 * IMPORTANT: Do not append includeMature / mature_enabled / age_confirmed.
 * Production currently returns HTTP 500 ("Failed to load public radio stations.")
 * when includeMature=true is combined with age_confirmed=true. That caused every
 * search on mature-enabled devices to fail with radio_catalog_search_500.
 * Client-side filterMatureStations still honors local mature settings.
 */
export function buildCatalogSearchUrl(query: string, page: number, limit: number) {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    limit: String(limit),
    include_stream: "1",
  });

  return `${RADIO_CATALOG_BASE_URL}${RADIO_CATALOG_STATIONS_PATH}?${params.toString()}`;
}

function buildPlayUrl(stationId: string) {
  return `${RADIO_CATALOG_BASE_URL}${RADIO_CATALOG_STATIONS_PATH}/${encodeURIComponent(stationId)}/play`;
}

export type RadioCatalogPlayResult = {
  stationId: string;
  streamUrl: string;
  delivery?: string;
};

/** Tap-time play resolver only — never used during search list load. */
export async function fetchRadioStationPlay(
  stationId: string,
  signal?: AbortSignal
): Promise<RadioCatalogPlayResult | null> {
  const id = String(stationId || "").trim();
  if (!id) return null;

  try {
    const { response, json } = await catalogJsonFetch(buildPlayUrl(id), {
      signal,
      requestOwner: "radio-play",
    });
    if (!response.ok) return null;

    const payload = json as {
      success?: boolean;
      stream_url?: string;
      delivery?: string;
    };
    const streamUrl = pickOptionalHttpsStreamUrl(payload?.stream_url);
    if (!streamUrl || !isPlayableLiveRadioStreamUrl(streamUrl)) return null;

    return {
      stationId: id.toLowerCase(),
      streamUrl,
      delivery: String(payload?.delivery || "").trim() || undefined,
    };
  } catch (error) {
    if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") {
      throw error;
    }
    return null;
  }
}

export async function resolveRadioStationStreamUrl(
  station: Pick<HiddenTunesStation, "id" | "streamUrl">,
  signal?: AbortSignal
): Promise<string | null> {
  const existing = pickOptionalHttpsStreamUrl(station.streamUrl);
  if (existing) return existing;
  const play = await fetchRadioStationPlay(station.id, signal);
  return play?.streamUrl || null;
}

export type RadioCatalogSearchPageResult = {
  stations: HiddenTunesStation[];
  hasMore: boolean;
  backendTotal?: number;
  backendPageRowCount?: number;
  backendNextOffset?: number;
  rawBackendRowsReturned: number;
  /** Always 0 — search must not call /play. */
  listTimePlayCalls: number;
  source: "catalog";
};

/**
 * Full-catalog radio search — metadata page only, backend hasMore is source of truth.
 */
export async function fetchRadioCatalogSearchPage(
  query: string,
  offset = 0,
  limit = RADIO_CATALOG_PAGE_SIZE,
  signal?: AbortSignal
): Promise<RadioCatalogSearchPageResult> {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) {
    return {
      stations: [],
      hasMore: false,
      listTimePlayCalls: 0,
      rawBackendRowsReturned: 0,
      source: "catalog",
    };
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || RADIO_CATALOG_PAGE_SIZE, 40));
  const safeOffset = Math.max(0, Number(offset) || 0);
  // Production honors page=, not offset=.
  const page = Math.floor(safeOffset / safeLimit) + 1;

  const { response, json } = await catalogJsonFetch(
    buildCatalogSearchUrl(safeQuery, page, safeLimit),
    { signal, requestOwner: "radio-search" }
  );

  if (!response.ok) {
    throw new Error(`radio_catalog_search_${response.status}`);
  }

  const payload = json as RadioCatalogStationsResponse;
  if (!payload?.success || !Array.isArray(payload.stations)) {
    throw new Error("radio_catalog_search_invalid_payload");
  }

  const rawBackendRowsReturned = payload.stations.length;
  const paging = parseRadioCatalogPagination(payload, {
    requestOffset: safeOffset,
    requestLimit: safeLimit,
    rawBackendRowsReturned,
  });

  const mapped = dedupeCatalogStations(
    payload.stations
      .map((station) => mapRadioCatalogStationToHiddenTunes(station))
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );

  // Completion follows backend hasMore only — never normalized/deduped length.
  const hasMore = paging.backendHasMore === true;

  return {
    stations: filterMatureStations(mapped).slice(0, safeLimit),
    hasMore,
    backendTotal: paging.backendTotal,
    backendPageRowCount: rawBackendRowsReturned,
    backendNextOffset: paging.backendNextOffset,
    rawBackendRowsReturned,
    listTimePlayCalls: 0,
    source: "catalog",
  };
}
