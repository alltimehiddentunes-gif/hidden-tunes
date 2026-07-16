import type { PodcastMatureLevel, PodcastShow } from "../types/podcast";
import {
  catalogJsonFetch,
  isCatalogTimeoutError,
} from "./catalogJsonFetch";

export const PODCAST_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const PODCAST_HOME_API_PATH = "/api/podcasts/shows";
export const PODCAST_SHOWS_API_PATH = "/api/podcasts/shows";
export const PODCAST_EPISODES_API_PATH = "/api/podcasts/episodes";
export const PODCAST_CATEGORIES_API_PATH = "/api/podcasts/categories";
export const PODCAST_HOME_PAGE_LIMIT = 24;
export const PODCAST_CATALOG_PAGE_LIMIT = 40;

export const BACKEND_PODCAST_CATEGORY_SLUGS = [
  "sports",
  "music",
  "society-culture",
  "science",
  "history",
  "education",
  "faith",
  "news",
  "comedy",
  "business",
  "technology",
  "health",
  "true-crime",
] as const;

export type BackendPodcastCategorySlug = (typeof BACKEND_PODCAST_CATEGORY_SLUGS)[number];

export type PodcastHomeMetadataSection = {
  id: string;
  title: string;
  shows: PodcastShow[];
};

export type PodcastHomeMetadataResponse = {
  success: boolean;
  sections: PodcastHomeMetadataSection[];
  error?: string;
};

export type PodcastCatalogCategory = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  sortOrder: number;
};

export type PodcastCatalogEpisodeMetadata = {
  id: string;
  showId: string;
  title: string;
  description?: string;
  artworkUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  episodeNumber?: number;
  seasonNumber?: number;
};

export type PodcastCatalogShowMetadata = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  artworkUrl?: string;
  hostName?: string;
  primaryCategory?: string;
  categories: string[];
  episodeCount?: number;
  publisher?: string;
};

export type PodcastEpisodePlay = {
  id: string;
  showId: string;
  title: string;
  audioUrl: string;
  durationSeconds?: number;
  publishedAt?: string;
};

export type PodcastCatalogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type PodcastCatalogEpisodesResponse = {
  success: boolean;
  episodes: PodcastCatalogEpisodeMetadata[];
  pagination: PodcastCatalogPagination;
  error?: string;
};

export type PodcastCatalogShowsResponse = {
  success: boolean;
  shows: PodcastCatalogShowMetadata[];
  pagination: PodcastCatalogPagination;
  error?: string;
};

export type PodcastCatalogCategoriesResponse = {
  success: boolean;
  categories: PodcastCatalogCategory[];
  error?: string;
};

const BLOCKED_PLAYABLE_KEYS = new Set([
  "audioUrl",
  "audio_url",
  "enclosureUrl",
  "enclosure_url",
  "streamUrl",
  "stream_url",
  "url",
  "playbackUrl",
  "playback_url",
]);

const CLEAN_TO_BACKEND_CATEGORY_SLUG: Record<string, BackendPodcastCategorySlug> = {
  society: "society-culture",
  comedy: "comedy",
  health: "health",
  business: "business",
  sports: "sports",
  music: "music",
  science: "science",
  history: "history",
  education: "education",
  faith: "faith",
  news: "news",
  technology: "technology",
  "true-crime": "true-crime",
  "society-culture": "society-culture",
};

const BACKEND_CATEGORY_LABELS: Record<BackendPodcastCategorySlug, string> = {
  sports: "Sports",
  music: "Music",
  "society-culture": "Society & Culture",
  science: "Science",
  history: "History",
  education: "Education",
  faith: "Faith",
  news: "News",
  comedy: "Comedy",
  business: "Business",
  technology: "Technology",
  health: "Health",
  "true-crime": "True Crime",
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanOptionalString(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned || undefined;
}

function normalizeCategories(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanString(entry))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  return [];
}

function normalizeMatureLevel(value: unknown): PodcastMatureLevel {
  return value === "explicit" || value === "adult" ? value : "safe";
}

function stripPlayableFields(raw: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!BLOCKED_PLAYABLE_KEYS.has(key)) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function emptyPagination(page = 1, limit = PODCAST_CATALOG_PAGE_LIMIT): PodcastCatalogPagination {
  return {
    page,
    limit,
    total: 0,
    totalPages: 0,
    hasMore: false,
  };
}

function parsePagination(
  payload: Record<string, unknown>,
  page: number,
  limit: number,
  count: number
): PodcastCatalogPagination {
  const paginationRaw = (payload.pagination || {}) as Record<string, unknown>;

  return {
    page: Number(paginationRaw.page || page),
    limit: Number(paginationRaw.limit || limit),
    total: Number(paginationRaw.total ?? count),
    totalPages: Number(paginationRaw.totalPages || 0),
    hasMore: Boolean(paginationRaw.hasMore),
  };
}

function normalizePodcastShow(raw: unknown): PodcastShow | null {
  if (!raw || typeof raw !== "object") return null;
  const safe = stripPlayableFields(raw as Record<string, unknown>);

  const id = cleanString(safe.id);
  const title = cleanString(safe.title);
  if (!id || !title) return null;

  const publisher = cleanString(safe.publisher, title) || title;
  const matureLevel = normalizeMatureLevel(safe.matureLevel ?? safe.mature_level);
  const categories = normalizeCategories(safe.categories);
  const feedUrl = cleanString(safe.feedUrl ?? safe.feed_url);

  return {
    id,
    title,
    publisher,
    description: cleanString(safe.description),
    artworkUrl: cleanString(safe.artworkUrl ?? safe.artwork_url ?? safe.imageUrl),
    feedUrl,
    websiteUrl: cleanOptionalString(safe.websiteUrl ?? safe.website_url),
    language: cleanString(safe.language, "unknown") || "unknown",
    country: cleanOptionalString(safe.country),
    categories,
    emotionalWorld: cleanOptionalString(safe.emotionalWorld ?? safe.emotional_world),
    isExplicit: Boolean(safe.isExplicit ?? safe.is_explicit),
    matureLevel,
    lastEpisodeDate: cleanOptionalString(safe.lastEpisodeDate ?? safe.last_episode_date),
    source: "rss",
  };
}

function normalizeCatalogEpisode(raw: unknown): PodcastCatalogEpisodeMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const safe = stripPlayableFields(raw as Record<string, unknown>);

  const id = cleanString(safe.id);
  const showId = cleanString(safe.showId ?? safe.show_id);
  const title = cleanString(safe.title);
  if (!id || !title) return null;

  const durationRaw = Number(safe.durationSeconds ?? safe.duration_seconds);

  return {
    id,
    showId,
    title,
    description: cleanOptionalString(safe.description),
    artworkUrl: cleanOptionalString(safe.artworkUrl ?? safe.artwork_url),
    durationSeconds:
      Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : undefined,
    publishedAt: cleanOptionalString(safe.publishedAt ?? safe.published_at),
    episodeNumber: Number.isFinite(Number(safe.episodeNumber ?? safe.episode_number))
      ? Number(safe.episodeNumber ?? safe.episode_number)
      : undefined,
    seasonNumber: Number.isFinite(Number(safe.seasonNumber ?? safe.season_number))
      ? Number(safe.seasonNumber ?? safe.season_number)
      : undefined,
  };
}

function normalizeCatalogShow(raw: unknown): PodcastCatalogShowMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const safe = stripPlayableFields(raw as Record<string, unknown>);

  const id = cleanString(safe.id);
  const title = cleanString(safe.title);
  if (!id || !title) return null;

  const slug = cleanString(safe.slug, id) || id;
  const episodeCountRaw = Number(safe.episodeCount ?? safe.episode_count);

  return {
    id,
    slug,
    title,
    description: cleanOptionalString(safe.description),
    artworkUrl: cleanOptionalString(safe.artworkUrl ?? safe.artwork_url),
    hostName: cleanOptionalString(safe.hostName ?? safe.host_name),
    primaryCategory: cleanOptionalString(safe.primaryCategory ?? safe.primary_category),
    categories: normalizeCategories(safe.categories ?? safe.primary_category),
    episodeCount:
      Number.isFinite(episodeCountRaw) && episodeCountRaw >= 0
        ? Math.round(episodeCountRaw)
        : undefined,
    publisher: cleanOptionalString(safe.publisher ?? safe.host_name) || title,
  };
}

function normalizeCatalogCategory(raw: unknown): PodcastCatalogCategory | null {
  if (!raw || typeof raw !== "object") return null;
  const safe = raw as Record<string, unknown>;

  const slug = cleanString(safe.slug);
  const name = cleanString(safe.name ?? safe.title);
  const id = cleanString(safe.id, slug) || slug;
  if (!id || !slug || !name) return null;

  const sortOrderRaw = Number(safe.sortOrder ?? safe.sort_order);

  return {
    id,
    slug,
    name,
    description: cleanOptionalString(safe.description),
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : 0,
  };
}

function normalizeSection(raw: unknown, fallbackIndex: number): PodcastHomeMetadataSection | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const shows = Array.isArray(row.shows)
    ? row.shows.map(normalizePodcastShow).filter((show): show is PodcastShow => show !== null)
    : [];

  if (!shows.length) return null;

  return {
    id: cleanString(row.id, `podcast-section-${fallbackIndex}`),
    title: cleanString(row.title, "Podcasts"),
    shows,
  };
}

function buildCatalogUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
) {
  const url = new URL(`${PODCAST_CATALOG_BASE_URL}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function podcastTransportError(error: unknown, fallback: string) {
  if (isCatalogTimeoutError(error)) {
    return "Request timed out while contacting the podcast catalog.";
  }
  return fallback;
}

async function fetchPodcastCatalogPayload(url: string, signal?: AbortSignal) {
  const { response, json } = await catalogJsonFetch(url, { signal });
  return {
    response,
    payload: (json && typeof json === "object" ? json : {}) as Record<string, unknown>,
  };
}

function buildPodcastHomeUrl(options?: { page?: number; limit?: number; includeMature?: boolean }) {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, Number(options?.page || 1))));
  params.set(
    "limit",
    String(Math.min(50, Math.max(1, Number(options?.limit || PODCAST_HOME_PAGE_LIMIT))))
  );
  params.set("includeMature", options?.includeMature ? "true" : "false");

  return `${PODCAST_CATALOG_BASE_URL}${PODCAST_HOME_API_PATH}?${params.toString()}`;
}

export function resolveBackendPodcastCategorySlug(
  categoryId: string
): BackendPodcastCategorySlug | null {
  const normalized = String(categoryId || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  if ((BACKEND_PODCAST_CATEGORY_SLUGS as readonly string[]).includes(normalized)) {
    return normalized as BackendPodcastCategorySlug;
  }

  return CLEAN_TO_BACKEND_CATEGORY_SLUG[normalized] || null;
}

export function getBackendPodcastCategoryLabel(slug: BackendPodcastCategorySlug) {
  return BACKEND_CATEGORY_LABELS[slug] || slug.replace(/-/g, " ");
}

export function isBackendPodcastShowId(showId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(showId || "").trim()
  );
}

export async function fetchPodcastCategories(): Promise<PodcastCatalogCategoriesResponse> {
  try {
    const { response, payload } = await fetchPodcastCatalogPayload(
      buildCatalogUrl(PODCAST_CATEGORIES_API_PATH)
    );

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        categories: [],
        error: cleanString(payload.error, "Failed to load podcast categories."),
      };
    }

    const categories = ((payload.categories || []) as Record<string, unknown>[])
      .map(normalizeCatalogCategory)
      .filter((category): category is PodcastCatalogCategory => category !== null);

    return {
      success: true,
      categories,
    };
  } catch (error) {
    return {
      success: false,
      categories: [],
      error: podcastTransportError(error, "Network error while loading podcast categories."),
    };
  }
}

export async function fetchPodcastEpisodesByCategory(
  categorySlug: string,
  page = 1,
  limit = PODCAST_CATALOG_PAGE_LIMIT
): Promise<PodcastCatalogEpisodesResponse> {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(50, Math.max(1, Number(limit || PODCAST_CATALOG_PAGE_LIMIT)));
  const slug = String(categorySlug || "").trim();

  if (!slug) {
    return {
      success: false,
      episodes: [],
      pagination: emptyPagination(safePage, safeLimit),
      error: "Category is required.",
    };
  }

  try {
    const { response, payload } = await fetchPodcastCatalogPayload(
      buildCatalogUrl(PODCAST_EPISODES_API_PATH, {
        category: slug,
        page: safePage,
        limit: safeLimit,
      })
    );

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        episodes: [],
        pagination: emptyPagination(safePage, safeLimit),
        error: cleanString(payload.error, "Failed to load podcast episodes."),
      };
    }

    const episodes = ((payload.episodes || []) as Record<string, unknown>[])
      .map(normalizeCatalogEpisode)
      .filter((episode): episode is PodcastCatalogEpisodeMetadata => episode !== null);

    return {
      success: true,
      episodes,
      pagination: parsePagination(payload, safePage, safeLimit, episodes.length),
    };
  } catch (error) {
    return {
      success: false,
      episodes: [],
      pagination: emptyPagination(safePage, safeLimit),
      error: podcastTransportError(error, "Network error while loading podcast episodes."),
    };
  }
}

export async function fetchPodcastShowsByCategory(
  categorySlug: string,
  page = 1,
  limit = PODCAST_CATALOG_PAGE_LIMIT
): Promise<PodcastCatalogShowsResponse> {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(50, Math.max(1, Number(limit || PODCAST_CATALOG_PAGE_LIMIT)));
  const slug = String(categorySlug || "").trim();

  if (!slug) {
    return {
      success: false,
      shows: [],
      pagination: emptyPagination(safePage, safeLimit),
      error: "Category is required.",
    };
  }

  try {
    const { response, payload } = await fetchPodcastCatalogPayload(
      buildCatalogUrl(PODCAST_SHOWS_API_PATH, {
        category: slug,
        page: safePage,
        limit: safeLimit,
      })
    );

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        shows: [],
        pagination: emptyPagination(safePage, safeLimit),
        error: cleanString(payload.error, "Failed to load podcast shows."),
      };
    }

    const shows = ((payload.shows || []) as Record<string, unknown>[])
      .map(normalizeCatalogShow)
      .filter((show): show is PodcastCatalogShowMetadata => show !== null);

    return {
      success: true,
      shows,
      pagination: parsePagination(payload, safePage, safeLimit, shows.length),
    };
  } catch (error) {
    return {
      success: false,
      shows: [],
      pagination: emptyPagination(safePage, safeLimit),
      error: podcastTransportError(error, "Network error while loading podcast shows."),
    };
  }
}

export async function fetchPodcastEpisodesByShow(
  showId: string,
  page = 1,
  limit = PODCAST_CATALOG_PAGE_LIMIT
): Promise<PodcastCatalogEpisodesResponse> {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(50, Math.max(1, Number(limit || PODCAST_CATALOG_PAGE_LIMIT)));
  const id = String(showId || "").trim();

  if (!id) {
    return {
      success: false,
      episodes: [],
      pagination: emptyPagination(safePage, safeLimit),
      error: "Show id is required.",
    };
  }

  try {
    const { response, payload } = await fetchPodcastCatalogPayload(
      buildCatalogUrl(PODCAST_EPISODES_API_PATH, {
        show_id: id,
        page: safePage,
        limit: safeLimit,
      })
    );

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        episodes: [],
        pagination: emptyPagination(safePage, safeLimit),
        error: cleanString(payload.error, "Failed to load podcast episodes."),
      };
    }

    const episodes = ((payload.episodes || []) as Record<string, unknown>[])
      .map(normalizeCatalogEpisode)
      .filter((episode): episode is PodcastCatalogEpisodeMetadata => episode !== null);

    return {
      success: true,
      episodes,
      pagination: parsePagination(payload, safePage, safeLimit, episodes.length),
    };
  } catch (error) {
    return {
      success: false,
      episodes: [],
      pagination: emptyPagination(safePage, safeLimit),
      error: podcastTransportError(error, "Network error while loading podcast episodes."),
    };
  }
}

export async function fetchPodcastShowById(
  showId: string
): Promise<{ success: boolean; show: PodcastCatalogShowMetadata | null; error?: string }> {
  const id = String(showId || "").trim();
  if (!id) {
    return { success: false, show: null, error: "Show id is required." };
  }

  try {
    const { response, payload } = await fetchPodcastCatalogPayload(
      buildCatalogUrl(`${PODCAST_SHOWS_API_PATH}/${encodeURIComponent(id)}`)
    );

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        show: null,
        error: cleanString(payload.error, "Failed to load podcast show."),
      };
    }

    const show = normalizeCatalogShow(payload.show);
    return {
      success: Boolean(show),
      show,
      error: show ? undefined : "Podcast show not found.",
    };
  } catch (error) {
    return {
      success: false,
      show: null,
      error: podcastTransportError(error, "Network error while loading podcast show."),
    };
  }
}

export async function fetchPodcastEpisodePlay(episodeId: string): Promise<{
  success: boolean;
  play: PodcastEpisodePlay | null;
  error?: string;
}> {
  const id = String(episodeId || "").trim();
  if (!id) {
    return { success: false, play: null, error: "Episode id is required." };
  }

  try {
    const { response, payload } = await fetchPodcastCatalogPayload(
      buildCatalogUrl(`${PODCAST_EPISODES_API_PATH}/${encodeURIComponent(id)}/play`)
    );

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        play: null,
        error: cleanString(payload.error, "Failed to resolve podcast playback."),
      };
    }

    const audioUrl = cleanString(payload.audio_url ?? payload.audioUrl);
    if (!audioUrl) {
      return {
        success: false,
        play: null,
        error: "Episode audio is unavailable.",
      };
    }

    const durationRaw = Number(payload.duration_seconds ?? payload.durationSeconds);

    return {
      success: true,
      play: {
        id: cleanString(payload.episode_id ?? payload.id, id),
        showId: cleanString(payload.show_id ?? payload.showId),
        title: cleanString(payload.title, "Untitled Episode"),
        audioUrl,
        durationSeconds:
          Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : undefined,
        publishedAt: cleanOptionalString(payload.published_at ?? payload.publishedAt),
      },
    };
  } catch (error) {
    return {
      success: false,
      play: null,
      error: podcastTransportError(error, "Network error while resolving podcast playback."),
    };
  }
}

export async function fetchPodcastHomeMetadata(options?: {
  page?: number;
  limit?: number;
  includeMature?: boolean;
  signal?: AbortSignal;
}): Promise<PodcastHomeMetadataResponse> {
  try {
    const { response, payload } = await fetchPodcastCatalogPayload(
      buildPodcastHomeUrl(options),
      options?.signal
    );

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        sections: [],
        error: cleanString(payload.error, "Failed to load podcast metadata."),
      };
    }

    const rawSections = Array.isArray(payload.sections)
      ? payload.sections
      : Array.isArray(payload.shows)
      ? [
          {
            id: "all-podcasts",
            title: "Podcasts",
            shows: payload.shows,
          },
        ]
      : [];
    const sections = rawSections
      .map(normalizeSection)
      .filter((section): section is PodcastHomeMetadataSection => section !== null);

    return {
      success: sections.length > 0,
      sections,
      error: sections.length > 0 ? undefined : "Podcast metadata response was empty.",
    };
  } catch (error) {
    return {
      success: false,
      sections: [],
      error: podcastTransportError(error, "Network error while loading podcast metadata."),
    };
  }
}
