import type { RadioCategory } from "../../constants/radioCategories";
import type { HiddenTunesStation } from "../../types/radio";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { normalizeRadioCatalogStation } from "./radioNormalizer";

export const RADIO_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const RADIO_STATIONS_API_PATH = "/api/radio/stations";
export const RADIO_SEARCH_API_PATH = "/api/radio/search";
export const RADIO_PLAY_API_PATH = "/api/radio/stations";

const BLOCKED_BROWSE_KEYS = new Set([
  "streamUrl",
  "stream_url",
  "url",
  "url_resolved",
  "playbackUrl",
  "hls_url",
  "hlsUrl",
  "audio_url",
  "audioUrl",
]);

export type RadioCatalogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type RadioCatalogPageResult = {
  success: boolean;
  stations: HiddenTunesStation[];
  pagination: RadioCatalogPagination;
  error?: string;
};

export type RadioStationPlayResponse = {
  id: string;
  stream_url: string;
};

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function stripBrowsableFields(raw: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!BLOCKED_BROWSE_KEYS.has(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function clampPage(value: number) {
  return Math.max(1, Number(value) || 1);
}

function clampLimit(value: number) {
  return Math.min(40, Math.max(1, Number(value) || 40));
}

function emptyPagination(page: number, limit: number): RadioCatalogPagination {
  return {
    page,
    limit,
    total: 0,
    totalPages: 0,
    hasMore: false,
  };
}

function normalizePagination(
  raw: unknown,
  fallback: { page: number; limit: number }
): RadioCatalogPagination {
  const pagination = (raw || {}) as Record<string, unknown>;
  return {
    page: Number(pagination.page || fallback.page),
    limit: Number(pagination.limit || fallback.limit),
    total: Number(pagination.total || 0),
    totalPages: Number(pagination.totalPages || 0),
    hasMore: pagination.hasMore === true,
  };
}

function buildRadioCatalogUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>
) {
  const url = new URL(`${RADIO_CATALOG_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchRadioCatalogJson<T>(
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (!response.ok) {
    throw new Error(`radio_catalog_${response.status}`);
  }

  if (!isJson) {
    throw new Error("radio_catalog_non_json");
  }

  return (await response.json()) as T;
}

export function mapRadioCategoryToCatalogQuery(category: RadioCategory): {
  category?: string;
  country?: string;
  featured?: boolean;
} {
  if (category.laneKind === "featured" || category.useTopVotes) {
    return { featured: true };
  }

  if (category.laneKind === "trending" || category.useTopClick) {
    return { category: "trending" };
  }

  if (category.laneKind === "popular") {
    return { category: "popular" };
  }

  if (category.countryCode) {
    return { country: category.countryCode };
  }

  if (category.tag) {
    return { category: category.tag };
  }

  return { category: category.id };
}

export async function fetchRadioCatalogStationsPage(
  options: {
    category?: RadioCategory;
    categoryId?: string;
    country?: string;
    featured?: boolean;
    page?: number;
    limit?: number;
    includeMature?: boolean;
    signal?: AbortSignal;
  }
): Promise<RadioCatalogPageResult> {
  const page = clampPage(options.page || 1);
  const limit = clampLimit(options.limit || 40);
  const includeMature =
    options.includeMature === true || shouldIncludeMatureInApi();

  const categoryQuery = options.category
    ? mapRadioCategoryToCatalogQuery(options.category)
    : options.categoryId
      ? { category: options.categoryId }
      : ({} as { category?: string; country?: string; featured?: boolean });

  const url = buildRadioCatalogUrl(RADIO_STATIONS_API_PATH, {
    page,
    limit,
    includeMature: includeMature ? true : undefined,
    country: options.country || categoryQuery.country,
    featured: options.featured || categoryQuery.featured ? true : undefined,
    category: categoryQuery.category || options.categoryId,
  });

  try {
    const payload = await fetchRadioCatalogJson<{
      success?: boolean;
      stations?: Record<string, unknown>[];
      pagination?: Record<string, unknown>;
      error?: string;
    }>(url, options.signal);

    if (payload.success === false) {
      return {
        success: false,
        stations: [],
        pagination: emptyPagination(page, limit),
        error: String(payload.error || "Failed to load radio stations."),
      };
    }

    const categoryId = options.category?.id || options.categoryId || "browse";
    const stations = (payload.stations || [])
      .map((row) => normalizeRadioCatalogStation(stripBrowsableFields(row), categoryId))
      .filter((station): station is HiddenTunesStation => Boolean(station));

    return {
      success: true,
      stations,
      pagination: normalizePagination(payload.pagination, { page, limit }),
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw error;
    }

    return {
      success: false,
      stations: [],
      pagination: emptyPagination(page, limit),
      error: "Network error while loading radio stations.",
    };
  }
}

export async function fetchRadioCatalogSearchPage(
  query: string,
  options?: {
    page?: number;
    limit?: number;
    includeMature?: boolean;
    signal?: AbortSignal;
  }
): Promise<RadioCatalogPageResult> {
  const safeQuery = String(query || "").trim();
  const page = clampPage(options?.page || 1);
  const limit = clampLimit(options?.limit || 40);

  if (!safeQuery) {
    return {
      success: true,
      stations: [],
      pagination: emptyPagination(page, limit),
    };
  }

  const includeMature =
    options?.includeMature === true || shouldIncludeMatureInApi();

  const url = buildRadioCatalogUrl(RADIO_SEARCH_API_PATH, {
    q: safeQuery,
    page,
    limit,
    includeMature: includeMature ? true : undefined,
  });

  try {
    const payload = await fetchRadioCatalogJson<{
      success?: boolean;
      stations?: Record<string, unknown>[];
      pagination?: Record<string, unknown>;
      error?: string;
    }>(url, options?.signal);

    if (payload.success === false) {
      return {
        success: false,
        stations: [],
        pagination: emptyPagination(page, limit),
        error: String(payload.error || "Failed to search radio stations."),
      };
    }

    const stations = (payload.stations || [])
      .map((row) => normalizeRadioCatalogStation(stripBrowsableFields(row), "search"))
      .filter((station): station is HiddenTunesStation => Boolean(station));

    return {
      success: true,
      stations,
      pagination: normalizePagination(payload.pagination, { page, limit }),
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw error;
    }

    return {
      success: false,
      stations: [],
      pagination: emptyPagination(page, limit),
      error: "Network error while searching radio stations.",
    };
  }
}

export async function fetchRadioStationPlay(
  stationId: string,
  signal?: AbortSignal
): Promise<RadioStationPlayResponse | null> {
  const id = String(stationId || "").trim();
  if (!id) return null;

  try {
    const payload = await fetchRadioCatalogJson<{
      success?: boolean;
      id?: string;
      stream_url?: string;
    }>(
      `${RADIO_CATALOG_BASE_URL}${RADIO_PLAY_API_PATH}/${encodeURIComponent(id)}/play`,
      signal
    );

    if (payload.success === false) return null;

    const streamUrl = cleanText(payload.stream_url, 2000);
    if (!streamUrl?.startsWith("https://")) return null;

    return {
      id: String(payload.id || id),
      stream_url: streamUrl,
    };
  } catch {
    return null;
  }
}

export async function ensureHiddenTunesStationStream(
  station: HiddenTunesStation | null,
  signal?: AbortSignal
): Promise<HiddenTunesStation | null> {
  if (!station) return null;

  const existing = String(station.streamUrl || "").trim();
  if (existing.startsWith("https://")) return station;

  const play = await fetchRadioStationPlay(station.id, signal);
  if (!play?.stream_url) return null;

  return {
    ...station,
    streamUrl: play.stream_url,
  };
}
