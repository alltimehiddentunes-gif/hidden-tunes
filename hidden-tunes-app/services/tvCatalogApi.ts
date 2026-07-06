import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildTvBrowseCategoryFallback,
  TV_LANE_FALLBACK_QUERIES,
  type TvBrowseCategory,
} from "../constants/tvBrowseCategories";

export const TV_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const TV_CATALOG_API_PATH = "/api/tv/channels";
export const TV_CATEGORIES_API_PATH = "/api/tv/categories";
export const TV_PLAY_API_PATH = "/api/tv/channels";
export const TV_DEFAULT_PAGE_LIMIT = 20;
export const TV_LANE_PAGE_LIMIT = 12;
export const TV_HOME_CACHE_KEY = "hidden_tunes_tv_home_cache_v2";
export const TV_HOME_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

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

export type { TvBrowseCategory };

export type TvHomeCachePayload = {
  version: 1;
  savedAt: string;
  lanes: Array<{
    id: string;
    title: string;
    videos: HiddenTunesTvVideo[];
  }>;
};

export const TV_STATION_CATEGORY_LANES: TvCatalogLane[] = [
  {
    id: "featured",
    title: "Featured Stations",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, featured: true },
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

/** @deprecated Use TV_STATION_CATEGORY_LANES */
export const TV_PREMIUM_LANES = TV_STATION_CATEGORY_LANES;

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

export function normalizeTvCatalogVideo(raw: Record<string, unknown>): HiddenTunesTvVideo | null {
  const id = String(raw.id || "").trim();
  const title = String(raw.title || "").trim();

  if (!id || !title) return null;

  const logo = cleanText(raw.logo, 2000) || cleanText(raw.thumbnail_url, 2000);
  const categories = Array.isArray(raw.categories)
    ? (raw.categories as unknown[])
        .map((entry) => cleanText(entry, 120))
        .filter(Boolean) as string[]
    : [];

  if (!categories.length) {
    for (const key of ["category", "genre", "mood", "format"] as const) {
      const value = cleanText(raw[key], 120);
      if (value) categories.push(value);
    }
  }

  return {
    id,
    title,
    description: cleanText(raw.description, 2000),
    logo,
    thumbnail_url: logo,
    country: cleanText(raw.country, 120) || cleanText(raw.region, 120),
    language: cleanText(raw.language, 80),
    categories,
    reliability_score:
      typeof raw.reliability_score === "number"
        ? raw.reliability_score
        : Number(raw.reliability_score) || undefined,
    is_featured: raw.is_featured === true,
    channel_name: cleanText(raw.channel_name, 200),
    source_type: cleanText(raw.source_type, 80) || undefined,
    source_id: cleanText(raw.source_id, 120) || undefined,
    genre: cleanText(raw.genre, 120),
    mood: cleanText(raw.mood, 120),
    format: cleanText(raw.format, 120),
    tags: normalizeTags(raw.tags),
  };
}

function buildPlayUrl(videoId: string) {
  return `${TV_CATALOG_BASE_URL}${TV_PLAY_API_PATH}/${encodeURIComponent(
    videoId
  )}/play`;
}

export async function fetchTvPlayback(
  video: HiddenTunesTvVideo
): Promise<HiddenTunesTvPlayback | null> {
  try {
    const response = await fetch(buildPlayUrl(video.id), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.success === false) return null;

    const streamUrl = cleanText(payload.stream_url, 2000);
    if (!streamUrl) return null;

    return {
      id: String(payload.id || video.id),
      source_type: String(payload.source_type || video.source_type),
      source_id: String(payload.source_id || video.source_id),
      stream_url: streamUrl,
      embed_url: cleanText(payload.embed_url, 2000),
    };
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

export async function getTvChannels(query: TvCatalogQuery = {}) {
  return fetchTvCatalog(query);
}

export async function getTvChannelStream(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id) return null;

  return fetchTvPlayback({
    id,
    title: "Hidden Tunes TV",
    categories: [],
  });
}

export async function fetchTvCatalog(
  query: TvCatalogQuery = {}
): Promise<TvCatalogResponse> {
  const url = buildCatalogUrl(query);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
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

export async function fetchTvCategories(): Promise<TvBrowseCategory[]> {
  try {
    const response = await fetch(
      `${TV_CATALOG_BASE_URL}${TV_CATEGORIES_API_PATH}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    );

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

async function fetchLaneStations(lane: TvCatalogLane) {
  const attempts = [
    lane.query,
    ...(TV_LANE_FALLBACK_QUERIES[lane.id] || []).map((fallback) => ({
      ...lane.query,
      ...fallback,
    })),
  ];

  for (const query of attempts) {
    const response = await fetchTvCatalog(query);
    if (response.success && response.videos.length > 0) {
      return response.videos;
    }
  }

  return [];
}

export async function fetchTvHomeLanes() {
  const laneResults = await Promise.all(
    TV_STATION_CATEGORY_LANES.map(async (lane) => {
      const videos = await fetchLaneStations(lane);
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

export function buildTvPlayerQueueItem(
  video: HiddenTunesTvVideo,
  playback?: HiddenTunesTvPlayback | null
) {
  const sourceId =
    playback?.source_id ||
    video.source_id ||
    video.id;
  const thumbnail =
    video.logo ||
    video.thumbnail_url ||
    (sourceId && sourceId.length === 11
      ? `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`
      : "");

  return {
    id: sourceId,
    videoId: sourceId,
    title: video.title,
    artist: video.channel_name || "Hidden Tunes TV",
    channelTitle: video.channel_name || "Hidden Tunes TV",
    thumbnail,
    source_url: playback?.stream_url,
    embed_url: playback?.embed_url || null,
  };
}

export function buildTvPlayerQueue(videos: HiddenTunesTvVideo[]) {
  return videos
    .map((video) => buildTvPlayerQueueItem(video))
    .filter((item) => item.videoId);
}
