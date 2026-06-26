import type { ContentRating } from "../types/matureContent";
import { parseContentRating } from "../types/matureContent";
import {
  fetchItunesPodcastEpisodes,
  fetchItunesPodcastShows,
} from "./podcast/podcastItunesRssSource";
import {
  logPodcastDiscoveryBatch,
  logPodcastEpisodeBatch,
  logPodcastRuntime,
} from "../utils/podcastRuntimeDiagnostics";
import { resolvePodcastMatureFields } from "../utils/matureContentDetection";
import {
  noteHiddenTunesPodcastEpisodesApi404,
  noteHiddenTunesPodcastShowsApi404,
  shouldSkipHiddenTunesPodcastEpisodesApi,
  shouldSkipHiddenTunesPodcastShowsApi,
} from "../constants/podcastBackendAvailability";

export const PODCAST_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const PODCAST_SHOWS_API_PATH = "/api/podcasts/shows";
export const PODCAST_EPISODES_API_PATH = "/api/podcasts/episodes";
export const PODCAST_DEFAULT_PAGE_LIMIT = 40;
export const PODCAST_CATEGORY_PAGE_LIMIT = 40;

export type HiddenTunesPodcastShow = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  artwork_url?: string;
  host_name?: string;
  primary_category?: string;
  categories: string[];
  episode_count?: number;
  language?: string;
  last_published_at?: string;
  feed_url?: string;
  quality_score?: number;
  is_featured?: boolean;
  is_exclusive?: boolean;
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: ContentRating;
  sourceName: "Hidden Tunes";
};

export type HiddenTunesPodcastEpisode = {
  id: string;
  show_id: string;
  title: string;
  description?: string;
  artwork_url?: string;
  audio_url?: string;
  duration_seconds?: number;
  published_at?: string;
  episode_number?: number;
  season_number?: number;
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: ContentRating;
  sourceName: "Hidden Tunes";
};

export type PodcastShowsQuery = {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  collection?: string;
  is_featured?: boolean;
  is_exclusive?: boolean;
  includeMature?: boolean;
  signal?: AbortSignal;
};

export type PodcastEpisodesQuery = {
  page?: number;
  limit?: number;
  q?: string;
  show_id?: string;
  category?: string;
  includeMature?: boolean;
  signal?: AbortSignal;
};

export type PodcastCatalogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type PodcastShowsResponse = {
  success: boolean;
  shows: HiddenTunesPodcastShow[];
  pagination: PodcastCatalogPagination;
  error?: string;
};

export type PodcastEpisodesResponse = {
  success: boolean;
  episodes: HiddenTunesPodcastEpisode[];
  pagination: PodcastCatalogPagination;
  error?: string;
};

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function normalizeCategories(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanText(entry, 80))
      .filter(Boolean) as string[];
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  return [];
}

function emptyPagination(query: { page?: number; limit?: number }) {
  return {
    page: query.page || 1,
    limit: query.limit || PODCAST_DEFAULT_PAGE_LIMIT,
    total: 0,
    totalPages: 0,
    hasMore: false,
  };
}

export function normalizePodcastShow(
  raw: Record<string, unknown>
): HiddenTunesPodcastShow | null {
  const id = String(raw.id || "").trim();
  const title = String(raw.title || "").trim();
  const slug = String(raw.slug || id || title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");

  if (!id || !title) return null;

  const categories = normalizeCategories(raw.categories || raw.primary_category);
  const mature = resolvePodcastMatureFields({
    title,
    categories,
    primary_category: cleanText(raw.primary_category, 120) || undefined,
    is_mature: Boolean(raw.is_mature),
    mature_reason: cleanText(raw.mature_reason, 200) || undefined,
    content_rating: parseContentRating(raw.content_rating),
  });

  return {
    id,
    slug,
    title,
    description: cleanText(raw.description, 1200) || undefined,
    artwork_url: cleanText(raw.artwork_url, 2000) || undefined,
    host_name: cleanText(raw.host_name, 120) || undefined,
    primary_category: cleanText(raw.primary_category, 120) || undefined,
    categories,
    episode_count: Number.isFinite(Number(raw.episode_count))
      ? Number(raw.episode_count)
      : undefined,
    language: cleanText(raw.language, 40) || undefined,
    last_published_at:
      cleanText(raw.last_published_at, 40) ||
      cleanText(raw.last_episode_at, 40) ||
      undefined,
    feed_url:
      cleanText(raw.feed_url, 2000) ||
      cleanText(raw.rss_url, 2000) ||
      cleanText(raw.feedUrl, 2000) ||
      undefined,
    is_featured: Boolean(raw.is_featured),
    is_exclusive: Boolean(raw.is_exclusive),
    is_mature: mature.is_mature,
    mature_reason: mature.mature_reason,
    content_rating: mature.content_rating,
    sourceName: "Hidden Tunes",
  };
}

export function normalizePodcastEpisode(
  raw: Record<string, unknown>
): HiddenTunesPodcastEpisode | null {
  const id = String(raw.id || "").trim();
  const showId = String(raw.show_id || "").trim();
  const title = String(raw.title || "").trim();

  if (!id || !showId || !title) return null;

  const mature = resolvePodcastMatureFields({
    title,
    is_mature: Boolean(raw.is_mature),
    mature_reason: cleanText(raw.mature_reason, 200) || undefined,
    content_rating: parseContentRating(raw.content_rating),
  });

  return {
    id,
    show_id: showId,
    title,
    description: cleanText(raw.description, 1200) || undefined,
    artwork_url: cleanText(raw.artwork_url, 2000) || undefined,
    audio_url: cleanText(raw.audio_url, 2000) || undefined,
    duration_seconds: Number.isFinite(Number(raw.duration_seconds))
      ? Number(raw.duration_seconds)
      : undefined,
    published_at: cleanText(raw.published_at, 40) || undefined,
    episode_number: Number.isFinite(Number(raw.episode_number))
      ? Number(raw.episode_number)
      : undefined,
    season_number: Number.isFinite(Number(raw.season_number))
      ? Number(raw.season_number)
      : undefined,
    is_mature: mature.is_mature,
    mature_reason: mature.mature_reason,
    content_rating: mature.content_rating,
    sourceName: "Hidden Tunes",
  };
}

function buildShowsUrl(query: PodcastShowsQuery = {}) {
  const params = new URLSearchParams();
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(
    50,
    Math.max(1, Number(query.limit || PODCAST_DEFAULT_PAGE_LIMIT))
  );

  params.set("page", String(page));
  params.set("limit", String(limit));

  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.category?.trim()) params.set("category", query.category.trim());
  if (query.collection?.trim()) params.set("collection", query.collection.trim());
  if (query.is_featured) params.set("is_featured", "true");
  if (query.is_exclusive) params.set("is_exclusive", "true");
  if (query.includeMature) params.set("includeMature", "true");

  return `${PODCAST_CATALOG_BASE_URL}${PODCAST_SHOWS_API_PATH}?${params.toString()}`;
}

function buildEpisodesUrl(query: PodcastEpisodesQuery = {}) {
  const params = new URLSearchParams();
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(
    50,
    Math.max(1, Number(query.limit || PODCAST_DEFAULT_PAGE_LIMIT))
  );

  params.set("page", String(page));
  params.set("limit", String(limit));

  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.show_id?.trim()) params.set("show_id", query.show_id.trim());
  if (query.category?.trim()) params.set("category", query.category.trim());
  if (query.includeMature) params.set("includeMature", "true");

  return `${PODCAST_CATALOG_BASE_URL}${PODCAST_EPISODES_API_PATH}?${params.toString()}`;
}

function parsePagination(
  payload: Record<string, unknown>,
  query: { page?: number; limit?: number },
  count: number
): PodcastCatalogPagination {
  const paginationRaw = (payload.pagination || {}) as Record<string, unknown>;

  return {
    page: Number(paginationRaw.page || query.page || 1),
    limit: Number(paginationRaw.limit || query.limit || PODCAST_DEFAULT_PAGE_LIMIT),
    total: Number(paginationRaw.total || count),
    totalPages: Number(paginationRaw.totalPages || 0),
    hasMore: Boolean(paginationRaw.hasMore),
  };
}

function extractShowsPayload(payload: Record<string, unknown>) {
  const data = payload.data as Record<string, unknown> | undefined;
  return ((payload.shows || data?.shows || []) as Record<string, unknown>[]);
}

function extractEpisodesPayload(payload: Record<string, unknown>) {
  const data = payload.data as Record<string, unknown> | undefined;
  return ((payload.episodes || data?.episodes || []) as Record<string, unknown>[]);
}

async function fetchHiddenTunesPodcastShows(query: PodcastShowsQuery = {}) {
  const url = buildShowsUrl(query);
  logPodcastRuntime("home_request", { url, query: query.q || query.category || query.collection || "browse" });

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: query.signal,
  });

  logPodcastRuntime("home_response", { url, status: response.status, ok: response.ok });

  if (!response.ok) {
    if (response.status === 404) {
      noteHiddenTunesPodcastShowsApi404();
    }
    return {
      success: false as const,
      shows: [] as HiddenTunesPodcastShow[],
      pagination: emptyPagination(query),
      error: "Failed to load Hidden Tunes podcast catalog.",
      source: "hidden-tunes" as const,
    };
  }

  const payload = (await response.json()) as Record<string, unknown>;

  if (payload.success === false) {
    return {
      success: false as const,
      shows: [] as HiddenTunesPodcastShow[],
      pagination: emptyPagination(query),
      error: String(payload.error || "Failed to load Hidden Tunes podcast catalog."),
      source: "hidden-tunes" as const,
    };
  }

  const shows = extractShowsPayload(payload)
    .map((row) => normalizePodcastShow(row))
    .filter((row): row is HiddenTunesPodcastShow => row !== null);

  logPodcastDiscoveryBatch("home", {
    url,
    status: response.status,
    ok: response.ok,
    count: shows.length,
    items: shows,
    error: shows.length ? undefined : "hidden-tunes_empty",
  });

  return {
    success: shows.length > 0,
    shows,
    pagination: parsePagination(payload, query, shows.length),
    source: "hidden-tunes" as const,
  };
}

async function fetchHiddenTunesPodcastEpisodes(query: PodcastEpisodesQuery = {}) {
  const url = buildEpisodesUrl(query);
  logPodcastRuntime("episode_request", { url, showId: query.show_id || "" });

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: query.signal,
  });

  logPodcastRuntime("episode_response", {
    url,
    status: response.status,
    ok: response.ok,
    showId: query.show_id || "",
  });

  if (!response.ok) {
    if (response.status === 404) {
      noteHiddenTunesPodcastEpisodesApi404();
    }
    return {
      success: false as const,
      episodes: [] as HiddenTunesPodcastEpisode[],
      pagination: emptyPagination(query),
      error: "Failed to load Hidden Tunes podcast episodes.",
      source: "hidden-tunes" as const,
    };
  }

  const payload = (await response.json()) as Record<string, unknown>;

  if (payload.success === false) {
    return {
      success: false as const,
      episodes: [] as HiddenTunesPodcastEpisode[],
      pagination: emptyPagination(query),
      error: String(payload.error || "Failed to load Hidden Tunes podcast episodes."),
      source: "hidden-tunes" as const,
    };
  }

  const episodes = extractEpisodesPayload(payload)
    .map((row) => normalizePodcastEpisode(row))
    .filter((row): row is HiddenTunesPodcastEpisode => row !== null);

  logPodcastEpisodeBatch(String(query.show_id || ""), {
    url,
    status: response.status,
    ok: response.ok,
    count: episodes.length,
    titles: episodes.slice(0, 10).map((episode) => episode.title),
    audioUrlsPresent: episodes
      .slice(0, 10)
      .map((episode) => Boolean(episode.audio_url?.startsWith("https://"))),
    error: episodes.length ? undefined : "hidden-tunes_empty",
  });

  return {
    success: episodes.length > 0,
    episodes,
    pagination: parsePagination(payload, query, episodes.length),
    source: "hidden-tunes" as const,
  };
}

export async function fetchPodcastShows(
  query: PodcastShowsQuery = {}
): Promise<PodcastShowsResponse> {
  try {
    if (!shouldSkipHiddenTunesPodcastShowsApi()) {
      const primary = await fetchHiddenTunesPodcastShows(query);
      if (primary.success && primary.shows.length > 0) {
        return {
          success: true,
          shows: primary.shows,
          pagination: primary.pagination,
        };
      }
    }

    const fallback = await fetchItunesPodcastShows(query);
    logPodcastDiscoveryBatch("home", {
      count: fallback.shows.length,
      items: fallback.shows,
      error: fallback.shows.length ? undefined : "itunes_empty",
    });

    if (fallback.shows.length > 0) {
      return {
        success: true,
        shows: fallback.shows,
        pagination: fallback.pagination,
      };
    }

    return {
      success: false,
      shows: [],
      pagination: emptyPagination(query),
      error: "No podcast shows available.",
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    const fallback = await fetchItunesPodcastShows(query).catch(() => null);
    if (fallback?.shows.length) {
      return {
        success: true,
        shows: fallback.shows,
        pagination: fallback.pagination,
      };
    }

    return {
      success: false,
      shows: [],
      pagination: emptyPagination(query),
      error: "Network error while loading Hidden Tunes podcast catalog.",
    };
  }
}

export async function fetchPodcastEpisodes(
  query: PodcastEpisodesQuery = {}
): Promise<PodcastEpisodesResponse> {
  const showId = String(query.show_id || "").trim();

  try {
    if (!shouldSkipHiddenTunesPodcastEpisodesApi(showId)) {
      const primary = await fetchHiddenTunesPodcastEpisodes(query);
      if (primary.success && primary.episodes.length > 0) {
        return {
          success: true,
          episodes: primary.episodes,
          pagination: primary.pagination,
        };
      }
    }

    const fallback = await fetchItunesPodcastEpisodes(query);
    logPodcastEpisodeBatch(showId, {
      count: fallback.episodes.length,
      titles: fallback.episodes.slice(0, 10).map((episode) => episode.title),
      audioUrlsPresent: fallback.episodes
        .slice(0, 10)
        .map((episode) => Boolean(episode.audio_url?.startsWith("https://"))),
      error: fallback.episodes.length ? undefined : "itunes_empty",
    });

    if (fallback.episodes.length > 0) {
      return {
        success: true,
        episodes: fallback.episodes,
        pagination: fallback.pagination,
      };
    }

    return {
      success: false,
      episodes: [],
      pagination: emptyPagination(query),
      error: "No playable podcast episodes available.",
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    const fallback = await fetchItunesPodcastEpisodes(query).catch(() => null);
    if (fallback?.episodes.length) {
      return {
        success: true,
        episodes: fallback.episodes,
        pagination: fallback.pagination,
      };
    }

    return {
      success: false,
      episodes: [],
      pagination: emptyPagination(query),
      error: "Network error while loading Hidden Tunes podcast episodes.",
    };
  }
}

export function formatPodcastEpisodeDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}
