import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildTvBrowseCategoryFallback,
  TV_LANE_FALLBACK_QUERIES,
  type TvBrowseCategory,
} from "../constants/tvBrowseCategories";
import { getVideoDisplayCreator, normalizeVideoItem } from "./videos/videoNormalizer";
import { fetchArchiveConcertVideos } from "./videos/archiveVideoDiscovery";

export type { TvBrowseCategory };

export const TV_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const TV_CATALOG_API_PATH = "/api/tv/videos";
export const TV_CATEGORIES_API_PATH = "/api/tv/categories";
export const TV_PLAY_API_PATH = "/api/tv/videos";
export const TV_DEFAULT_PAGE_LIMIT = 20;
export const TV_LANE_PAGE_LIMIT = 12;
export const TV_HOME_CACHE_KEY = "hidden_tunes_tv_home_cache_v3";
export const TV_HOME_CACHE_TTL_MS = 1000 * 60 * 30;

const BLOCKED_BROWSE_KEYS = new Set([
  "audioUrl",
  "audio_url",
  "source_url",
  "sourceUrl",
  "embed_url",
  "embedUrl",
  "stream_url",
  "streamUrl",
  "playbackUrl",
  "backup_stream_url",
  "hls_url",
  "manifest_url",
]);

export type HiddenTunesTvVideo = {
  id: string;
  title: string;
  description?: string | null;
  logo?: string | null;
  thumbnail_url?: string | null;
  country?: string | null;
  language?: string | null;
  categories: string[];
  reliability_score?: number;
  is_featured?: boolean;
  channel_name?: string | null;
  source_type?: string;
  source_id?: string;
  /** Archive-only / legacy browse payloads — stripped from backend catalog rows */
  source_url?: string;
  embed_url?: string | null;
  category?: string | null;
  genre?: string | null;
  mood?: string | null;
  format?: string | null;
  tags?: string[];
};

export type HiddenTunesTvPlayback = {
  id: string;
  source_type: string;
  source_id: string;
  stream_url: string;
  embed_url: string | null;
};

export type TvCatalogQuery = {
  page?: number;
  limit?: number;
  q?: string;
  genre?: string;
  mood?: string;
  format?: string;
  category?: string;
  country?: string;
  language?: string;
  featured?: boolean;
};

export type TvCatalogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type TvCatalogResponse = {
  success: boolean;
  videos: HiddenTunesTvVideo[];
  pagination: TvCatalogPagination;
  error?: string;
};

export type TvCatalogLane = {
  id: string;
  title: string;
  query: TvCatalogQuery;
};

export type TvHomeCachePayload = {
  version: 1;
  savedAt: string;
  lanes: Array<{
    id: string;
    title: string;
    videos: HiddenTunesTvVideo[];
  }>;
};

export const TV_HOME_LANES: TvCatalogLane[] = [
  {
    id: "featured",
    title: "Featured Now",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, featured: true },
  },
  {
    id: "recent",
    title: "Recently Added",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT },
  },
  {
    id: "news",
    title: "News",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "News" },
  },
  {
    id: "sports",
    title: "Sports",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Sports" },
  },
  {
    id: "movies",
    title: "Movies",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Movies" },
  },
  {
    id: "entertainment",
    title: "Entertainment",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Entertainment" },
  },
  {
    id: "documentary",
    title: "Documentary",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Documentary" },
  },
  {
    id: "music-tv",
    title: "Music TV",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Music TV" },
  },
  {
    id: "motivation",
    title: "Motivation",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Motivation" },
  },
  {
    id: "faith",
    title: "Faith & Worship",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Faith & Worship" },
  },
  {
    id: "africa",
    title: "Africa",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Africa" },
  },
  {
    id: "emotional-worlds",
    title: "Emotional Worlds",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, category: "Emotional Worlds" },
  },
];

/** @deprecated Use TV_HOME_LANES */
export const TV_PREMIUM_LANES = TV_HOME_LANES;

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function normalizeTags(value: unknown) {
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
      .slice(0, 24);
  }

  return [];
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

export function normalizeTvCatalogVideo(raw: Record<string, unknown>): HiddenTunesTvVideo | null {
  const safe = stripBrowsableFields(raw);
  const id = String(safe.id || "").trim();
  const title = String(safe.title || "").trim();

  if (!id || !title) return null;

  const logo = cleanText(safe.logo, 2000) || cleanText(safe.thumbnail_url, 2000);
  const categories = Array.isArray(safe.categories)
    ? (safe.categories as unknown[])
        .map((entry) => cleanText(entry, 120))
        .filter(Boolean) as string[]
    : [];

  const category = cleanText(safe.category, 120);
  const genre = cleanText(safe.genre, 120);
  const mood = cleanText(safe.mood, 120);
  const format = cleanText(safe.format, 120);

  if (!categories.length) {
    for (const value of [category, genre, mood, format]) {
      if (value) categories.push(value);
    }
  }

  return {
    id,
    title,
    description: cleanText(safe.description, 2000),
    logo,
    thumbnail_url: logo,
    country: cleanText(safe.country, 120) || cleanText(safe.region, 120),
    language: cleanText(safe.language, 80),
    categories,
    reliability_score:
      typeof safe.reliability_score === "number"
        ? safe.reliability_score
        : Number(safe.reliability_score) || undefined,
    is_featured: safe.is_featured === true,
    channel_name: cleanText(safe.channel_name, 200),
    source_type: cleanText(safe.source_type, 80) || undefined,
    source_id: cleanText(safe.source_id, 120) || undefined,
    category,
    genre,
    mood,
    format,
    tags: normalizeTags(safe.tags),
  };
}

function buildPlayUrl(videoId: string) {
  return `${TV_CATALOG_BASE_URL}${TV_PLAY_API_PATH}/${encodeURIComponent(videoId)}/play`;
}

const TV_PLAYBACK_CACHE_TTL_MS = 5 * 60 * 1000;
const tvPlaybackCache = new Map<string, { value: HiddenTunesTvPlayback; at: number }>();

export async function fetchTvPlayback(
  video: HiddenTunesTvVideo,
  options?: { signal?: AbortSignal }
): Promise<HiddenTunesTvPlayback | null> {
  const cacheKey = String(video.id || "").trim();
  if (cacheKey) {
    const cached = tvPlaybackCache.get(cacheKey);
    if (cached && Date.now() - cached.at < TV_PLAYBACK_CACHE_TTL_MS) {
      return cached.value;
    }
  }

  try {
    const response = await fetch(buildPlayUrl(video.id), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: options?.signal,
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.success === false) return null;

    const streamUrl = cleanText(payload.stream_url, 2000);
    if (!streamUrl) return null;

    const playback = {
      id: String(payload.id || video.id),
      source_type: String(payload.source_type || video.source_type || "youtube_video"),
      source_id: String(payload.source_id || video.source_id || video.id),
      stream_url: streamUrl,
      embed_url: cleanText(payload.embed_url, 2000),
    };

    if (cacheKey) {
      tvPlaybackCache.set(cacheKey, { value: playback, at: Date.now() });
    }

    return playback;
  } catch {
    return null;
  }
}

function buildCatalogUrl(query: TvCatalogQuery = {}) {
  const params = new URLSearchParams();
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(query.limit || TV_DEFAULT_PAGE_LIMIT)));

  params.set("page", String(page));
  params.set("limit", String(limit));

  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.genre?.trim()) params.set("genre", query.genre.trim());
  if (query.mood?.trim()) params.set("mood", query.mood.trim());
  if (query.format?.trim()) params.set("format", query.format.trim());
  if (query.category?.trim()) params.set("category", query.category.trim());
  if (query.country?.trim()) params.set("country", query.country.trim());
  if (query.language?.trim()) params.set("language", query.language.trim());
  if (query.featured) params.set("featured", "true");

  return `${TV_CATALOG_BASE_URL}${TV_CATALOG_API_PATH}?${params.toString()}`;
}

export async function fetchTvCatalog(
  query: TvCatalogQuery = {},
  options?: { signal?: AbortSignal }
): Promise<TvCatalogResponse> {
  const url = buildCatalogUrl(query);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: options?.signal,
    });

    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok || payload.success === false) {
      return {
        success: false,
        videos: [],
        pagination: {
          page: query.page || 1,
          limit: query.limit || TV_DEFAULT_PAGE_LIMIT,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
        error: String(payload.error || "Failed to load TV catalog."),
      };
    }

    const videos = ((payload.videos || []) as Record<string, unknown>[])
      .map((row) => normalizeTvCatalogVideo(row))
      .filter((row): row is HiddenTunesTvVideo => row !== null);

    const paginationRaw = (payload.pagination || {}) as Record<string, unknown>;

    return {
      success: true,
      videos,
      pagination: {
        page: Number(paginationRaw.page || query.page || 1),
        limit: Number(paginationRaw.limit || query.limit || TV_DEFAULT_PAGE_LIMIT),
        total: Number(paginationRaw.total || videos.length),
        totalPages: Number(paginationRaw.totalPages || 0),
        hasMore: Boolean(paginationRaw.hasMore),
      },
    };
  } catch {
    return {
      success: false,
      videos: [],
      pagination: {
        page: query.page || 1,
        limit: query.limit || TV_DEFAULT_PAGE_LIMIT,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
      error: "Network error while loading TV catalog.",
    };
  }
}

export async function loadTvHomeCache() {
  try {
    const raw = await AsyncStorage.getItem(TV_HOME_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TvHomeCachePayload;
    if (!parsed?.lanes?.length) return null;

    const savedAt = new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(savedAt)) return parsed;

    if (Date.now() - savedAt > TV_HOME_CACHE_TTL_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function saveTvHomeCache(payload: TvHomeCachePayload) {
  try {
    await AsyncStorage.setItem(TV_HOME_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

export const ARCHIVE_CONCERT_LANE_ID = "archive-concerts";
export const ARCHIVE_CONCERT_LANE_TITLE = "Concert Vault";

export type TvHomeLane = {
  id: string;
  title: string;
  videos: HiddenTunesTvVideo[];
};

export async function fetchTvCategories(options?: {
  signal?: AbortSignal;
}): Promise<TvBrowseCategory[]> {
  try {
    const response = await fetch(`${TV_CATALOG_BASE_URL}${TV_CATEGORIES_API_PATH}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: options?.signal,
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.success === false) {
      return buildTvBrowseCategoryFallback();
    }

    const categories = ((payload.categories || []) as Record<string, unknown>[])
      .map((row) => {
        const name = String(row.name || "").trim();
        const slug = String(row.slug || row.id || "").trim();
        if (!name || !slug) return null;

        return {
          id: slug,
          name,
          slug,
          parentSlug: cleanText(row.parent_slug, 120) || null,
        } satisfies TvBrowseCategory;
      })
      .filter((row): row is TvBrowseCategory => row !== null);

    return categories.length ? categories : buildTvBrowseCategoryFallback();
  } catch {
    return buildTvBrowseCategoryFallback();
  }
}

async function fetchLaneVideos(lane: TvCatalogLane, options?: { signal?: AbortSignal }) {
  const attempts = [
    lane.query,
    ...(TV_LANE_FALLBACK_QUERIES[lane.id] || []).map((fallback) => ({
      ...lane.query,
      ...fallback,
    })),
  ];

  for (const query of attempts) {
    const response = await fetchTvCatalog(query, options);
    if (response.success && response.videos.length > 0) {
      return response.videos;
    }
  }

  return [] as HiddenTunesTvVideo[];
}

export async function fetchTvCategoryLane(
  category: TvBrowseCategory,
  options?: { signal?: AbortSignal }
): Promise<TvHomeLane> {
  const response = await fetchTvCatalog(
    {
      page: 1,
      limit: TV_LANE_PAGE_LIMIT,
      category: category.name,
    },
    options
  );

  return {
    id: `category-${category.slug}`,
    title: category.name,
    videos: response.success ? response.videos : [],
  };
}

export async function fetchArchiveConcertLane(options?: {
  signal?: AbortSignal;
  query?: string;
}): Promise<TvHomeLane> {
  const videos = await fetchArchiveConcertVideos({
    query: options?.query,
    signal: options?.signal,
  });

  return {
    id: ARCHIVE_CONCERT_LANE_ID,
    title: ARCHIVE_CONCERT_LANE_TITLE,
    videos,
  };
}

export async function fetchTvSearchVideos(
  query: string,
  options?: { signal?: AbortSignal; limit?: number }
) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) return [] as HiddenTunesTvVideo[];

  const limit = Math.max(1, Number(options?.limit || TV_LANE_PAGE_LIMIT * 2));
  const backendResponse = await fetchTvCatalog(
    { q: cleanQuery, page: 1, limit },
    { signal: options?.signal }
  );

  return backendResponse.success ? backendResponse.videos.slice(0, limit) : [];
}

export async function fetchTvHomeLanes(options?: { signal?: AbortSignal }) {
  const laneResults = await Promise.all(
    TV_HOME_LANES.map(async (lane) => {
      const videos = await fetchLaneVideos(lane, options);
      return {
        id: lane.id,
        title: lane.title,
        videos,
      };
    })
  );

  const payload: TvHomeCachePayload = {
    version: 1,
    savedAt: new Date().toISOString(),
    lanes: laneResults,
  };

  const hasAnyVideos = laneResults.some((lane) => lane.videos.length > 0);
  if (hasAnyVideos) {
    await saveTvHomeCache(payload);
  }

  return {
    lanes: laneResults,
    hasAnyVideos,
  };
}

export function filterAdminHomeLanes(lanes: TvHomeLane[]) {
  return lanes.filter((lane) => lane.id !== ARCHIVE_CONCERT_LANE_ID);
}

/** @deprecated Archive lane is no longer merged into the admin home cache. */
export function mergeArchiveLaneIntoLanes(
  lanes: TvHomeLane[],
  archiveLane: TvHomeLane
) {
  if (!archiveLane.videos.length) {
    return filterAdminHomeLanes(lanes);
  }

  return [...filterAdminHomeLanes(lanes), archiveLane];
}

export function buildTvPlayerQueueItem(
  video: HiddenTunesTvVideo,
  playback?: HiddenTunesTvPlayback | null
) {
  const item = normalizeVideoItem(
    playback
      ? {
          ...video,
          source_type: playback.source_type,
          source_id: playback.source_id,
          source_url: playback.stream_url,
          embed_url: playback.embed_url,
        }
      : video
  );
  const creator = getVideoDisplayCreator(item);
  const sourceId =
    playback?.source_id || item.externalVideoId || video.source_id || video.id;

  return {
    id: sourceId,
    videoId: item.videoSource === "youtube" ? sourceId : sourceId,
    externalVideoId: item.externalVideoId || sourceId,
    videoSource: item.videoSource,
    title: item.title,
    artist: creator,
    channelTitle: creator,
    thumbnail: item.thumbnailUrl || video.logo || video.thumbnail_url || "",
    source_url: playback?.stream_url || item.playbackUrl,
    embed_url: playback?.embed_url || item.embedUrl,
    playbackUrl: playback?.stream_url || item.playbackUrl,
  };
}

export function buildTvPlayerQueue(
  videos: HiddenTunesTvVideo[],
  playbackById?: Record<string, HiddenTunesTvPlayback | null>
) {
  return videos
    .map((video) => buildTvPlayerQueueItem(video, playbackById?.[video.id] || null))
    .filter((item) => item.videoId);
}
