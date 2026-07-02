import AsyncStorage from "@react-native-async-storage/async-storage";

export const TV_CATALOG_BASE_URL = "https://admin.hiddentunes.com";
export const TV_CATALOG_API_PATH = "/api/tv/videos";
export const TV_PLAY_API_PATH = "/api/tv/videos";
export const TV_DEFAULT_PAGE_LIMIT = 20;
export const TV_LANE_PAGE_LIMIT = 12;
export const TV_HOME_CACHE_KEY = "hidden_tunes_tv_home_cache_v1";
export const TV_HOME_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

export type HiddenTunesTvVideo = {
  id: string;
  title: string;
  source_type: string;
  source_id: string;
  source_url?: string;
  embed_url?: string | null;
  thumbnail_url: string | null;
  channel_name: string | null;
  category: string | null;
  genre: string | null;
  mood: string | null;
  format: string | null;
  tags: string[];
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

export const TV_PREMIUM_LANES: TvCatalogLane[] = [
  {
    id: "featured",
    title: "Featured Now",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT },
  },
  {
    id: "recent",
    title: "Recently Added",
    query: { page: 2, limit: TV_LANE_PAGE_LIMIT },
  },
  {
    id: "blues",
    title: "Blues TV",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, genre: "Blues" },
  },
  {
    id: "afro-soul",
    title: "Afro Soul TV",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, genre: "Afro Soul" },
  },
  {
    id: "jazz",
    title: "Jazz Lounge",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, genre: "Jazz" },
  },
  {
    id: "gospel",
    title: "Gospel Inspiration",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, genre: "Gospel" },
  },
  {
    id: "documentary",
    title: "Documentary Nights",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, format: "Documentaries" },
  },
  {
    id: "live",
    title: "Live Performances",
    query: { page: 1, limit: TV_LANE_PAGE_LIMIT, format: "Live Performances" },
  },
];

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
  const sourceId = String(raw.source_id || "").trim();
  const title = String(raw.title || "").trim();

  if (!id || !sourceId || !title) return null;

  return {
    id,
    title,
    source_type: String(raw.source_type || "youtube_video"),
    source_id: sourceId,
    source_url: undefined,
    embed_url: null,
    thumbnail_url: cleanText(raw.thumbnail_url, 2000),
    channel_name: cleanText(raw.channel_name, 200),
    category: cleanText(raw.category, 120),
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

  return `${TV_CATALOG_BASE_URL}${TV_CATALOG_API_PATH}?${params.toString()}`;
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

export async function fetchTvHomeLanes() {
  const laneResults = await Promise.all(
    TV_PREMIUM_LANES.map(async (lane) => {
      const response = await fetchTvCatalog(lane.query);
      return {
        id: lane.id,
        title: lane.title,
        videos: response.success ? response.videos : [],
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
  const thumbnail =
    video.thumbnail_url ||
    `https://i.ytimg.com/vi/${video.source_id}/hqdefault.jpg`;

  return {
    id: video.source_id,
    videoId: video.source_id,
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
