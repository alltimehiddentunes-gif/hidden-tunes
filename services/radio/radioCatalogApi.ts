/**
 * Production radio catalog client (admin.hiddentunes.com).
 * Search path only — category browse still uses Radio Browser until a later swap.
 */
import { MEDIA_DISCOVERY_PAGE_SIZE } from "../../constants/mediaDiscovery";
import type { HiddenTunesStation } from "../../types/radio";
import { isMatureContentItem } from "../../types/matureContent";
import {
  catalogJsonFetch,
  isCatalogAbortError,
} from "../catalogJsonFetch";
import { shouldIncludeMatureInApi, getMatureContentSettings } from "../../utils/matureContentSettings";
import { sanitizeStationTagsForDisplay } from "./radioNormalizer";

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

function pickHttpsStreamUrl(value: unknown) {
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

export function mapRadioCatalogStationToHiddenTunes(
  station: RadioCatalogPublicStation
): HiddenTunesStation | null {
  const id = String(station.id || "").trim().toLowerCase();
  const name = String(station.name || "").trim();
  const streamUrl = pickHttpsStreamUrl(station.stream_url);

  if (!id || !name || !streamUrl) return null;

  const tags = normalizeCatalogTags(station);
  const country =
    String(station.country_code || station.country || "")
      .trim()
      .toUpperCase()
      .slice(0, 2) || undefined;

  const base: HiddenTunesStation = {
    id,
    name,
    streamUrl,
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

  return base;
}

function dedupeCatalogStations(stations: HiddenTunesStation[]) {
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

function filterMatureStations(stations: HiddenTunesStation[]) {
  if (shouldIncludeMatureInApi()) return stations;
  return stations.filter((station) => !isMatureContentItem(station));
}

function buildCatalogSearchUrl(query: string, page: number, limit: number) {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    limit: String(limit),
    https_only: "1",
    include_stream: "1",
  });

  if (shouldIncludeMatureInApi()) {
    const settings = getMatureContentSettings();
    if (settings.enabled && settings.hasConsent) {
      params.set("includeMature", "true");
      params.set("mature_enabled", "true");
      params.set("age_confirmed", "true");
    }
  }

  return `${RADIO_CATALOG_BASE_URL}${RADIO_CATALOG_STATIONS_PATH}?${params.toString()}`;
}

function buildPlayUrl(stationId: string) {
  return `${RADIO_CATALOG_BASE_URL}${RADIO_CATALOG_STATIONS_PATH}/${encodeURIComponent(stationId)}/play`;
}

function abortAttachError() {
  const error = new Error("radio_catalog_attach_aborted");
  error.name = "AbortError";
  return error;
}

async function attachHttpsStreamUrls(
  stations: RadioCatalogPublicStation[],
  signal?: AbortSignal
): Promise<RadioCatalogPublicStation[]> {
  const attached: RadioCatalogPublicStation[] = [];

  for (const station of stations) {
    // Never return a partial attach as a successful catalog page.
    if (signal?.aborted) throw abortAttachError();

    let streamUrl = pickHttpsStreamUrl(station.stream_url);
    if (!streamUrl && station.id) {
      try {
        const { response, json } = await catalogJsonFetch(buildPlayUrl(String(station.id)), {
          signal,
        });
        if (response.ok) {
          const payload = json as { stream_url?: string };
          streamUrl = pickHttpsStreamUrl(payload?.stream_url);
        }
      } catch (error) {
        if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") {
          throw error;
        }
      }
    }

    if (!streamUrl) continue;
    attached.push({ ...station, stream_url: streamUrl });
  }

  if (signal?.aborted) throw abortAttachError();
  return attached;
}

export type RadioCatalogSearchPageResult = {
  stations: HiddenTunesStation[];
  hasMore: boolean;
};

/**
 * Full-catalog radio search against production Hidden Tunes radio_stations.
 * Paginates with the same 40/page contract as the rest of media discovery.
 */
export async function fetchRadioCatalogSearchPage(
  query: string,
  offset = 0,
  limit = RADIO_CATALOG_PAGE_SIZE,
  signal?: AbortSignal
): Promise<RadioCatalogSearchPageResult> {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return { stations: [], hasMore: false };

  const safeLimit = Math.max(1, Math.min(Number(limit) || RADIO_CATALOG_PAGE_SIZE, 40));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const page = Math.floor(safeOffset / safeLimit) + 1;

  const { response, json } = await catalogJsonFetch(
    buildCatalogSearchUrl(safeQuery, page, safeLimit),
    { signal }
  );

  if (!response.ok) {
    throw new Error(`radio_catalog_search_${response.status}`);
  }

  const payload = json as RadioCatalogStationsResponse;
  if (!payload?.success || !Array.isArray(payload.stations)) {
    throw new Error("radio_catalog_search_invalid_payload");
  }

  const withStreams = await attachHttpsStreamUrls(payload.stations, signal);

  const mapped = dedupeCatalogStations(
    withStreams
      .map((station) => mapRadioCatalogStationToHiddenTunes(station))
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );

  return {
    stations: filterMatureStations(mapped).slice(0, safeLimit),
    hasMore: Boolean(payload.pagination?.hasMore),
  };
}
