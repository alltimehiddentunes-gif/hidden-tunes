import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_PUBLIC_VIDEO_SELECT,
  TV_VIDEO_SOURCE_TYPE,
  TvPublicVideo,
  buildYouTubeEmbedUrl,
  buildYouTubeThumbnailUrl,
  buildYouTubeWatchUrl,
  cleanText,
  extractYouTubeVideoId,
  hasYouTubeDataApiKey,
  inferCategoryGenreMoodFormat,
  normalizeTvTags,
  parsePositiveInt,
  toTvPublicVideo,
} from "@/lib/tvCatalog";

const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type TvSearchResult = {
  videos: TvPublicVideo[];
  catalogCount: number;
  liveCount: number;
  liveSearchEnabled: boolean;
  nextPageToken: string | null;
  total: number;
  error: string | null;
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

function getYouTubeApiKey() {
  return String(process.env.YOUTUBE_DATA_API_KEY || "").trim();
}

function mapYouTubeSearchItem(item: YouTubeSearchItem): TvPublicVideo | null {
  const videoId = extractYouTubeVideoId(item?.id?.videoId || "");
  const title = cleanText(item?.snippet?.title, 300);

  if (!videoId || !title) return null;

  const channelName = cleanText(item?.snippet?.channelTitle, 200);
  const thumbnailUrl =
    cleanText(item?.snippet?.thumbnails?.high?.url, 2000) ||
    cleanText(item?.snippet?.thumbnails?.medium?.url, 2000) ||
    cleanText(item?.snippet?.thumbnails?.default?.url, 2000) ||
    buildYouTubeThumbnailUrl(videoId);

  const inferred = inferCategoryGenreMoodFormat(title, channelName, {});

  return {
    id: `tv-search-${videoId}`,
    title,
    source_type: TV_VIDEO_SOURCE_TYPE,
    source_id: videoId,
    source_url: buildYouTubeWatchUrl(videoId),
    embed_url: buildYouTubeEmbedUrl(videoId),
    thumbnail_url: thumbnailUrl,
    channel_name: channelName,
    category: inferred.category,
    genre: inferred.genre,
    mood: inferred.mood,
    format: inferred.format,
    tags: normalizeTvTags([...inferred.tags, "tv-search", "youtube-live"]),
  };
}

export async function searchTvCatalogPlayable(
  query: string,
  page: number,
  limit: number
) {
  const escaped = query.replace(/[%_]/g, "\\$&");
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabaseAdmin
    .from("tv_videos")
    .select(TV_PUBLIC_VIDEO_SELECT, { count: "exact" })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .or(`title.ilike.%${escaped}%,channel_name.ilike.%${escaped}%`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const videos = ((data || []) as Record<string, unknown>[]).map((row) =>
    toTvPublicVideo(row)
  );

  return {
    videos,
    total: count || videos.length,
  };
}

export async function searchYouTubeLivePlayable(
  query: string,
  limit: number,
  pageToken?: string | null
) {
  const apiKey = getYouTubeApiKey();

  if (!apiKey || !hasYouTubeDataApiKey()) {
    return {
      videos: [] as TvPublicVideo[],
      nextPageToken: null,
      error: "YouTube Data API is not configured on the server.",
    };
  }

  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, limit));
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(safeLimit),
    videoEmbeddable: "true",
    safeSearch: "moderate",
    key: apiKey,
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const response = await fetch(`${YOUTUBE_SEARCH_API}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    let message = `YouTube search failed (${response.status}).`;

    try {
      const parsed = JSON.parse(bodyText) as {
        error?: { message?: string };
      };
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {}

    return {
      videos: [] as TvPublicVideo[],
      nextPageToken: null,
      error: message,
    };
  }

  const payload = JSON.parse(bodyText) as {
    items?: YouTubeSearchItem[];
    nextPageToken?: string;
  };

  const videos = (payload.items || [])
    .map((item) => mapYouTubeSearchItem(item))
    .filter((item): item is TvPublicVideo => item !== null);

  return {
    videos,
    nextPageToken: cleanText(payload.nextPageToken, 200),
    error: null,
  };
}

function dedupeBySourceId(videos: TvPublicVideo[]) {
  const seen = new Set<string>();
  const merged: TvPublicVideo[] = [];

  for (const video of videos) {
    const sourceId = String(video.source_id || "").trim();
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);
    merged.push(video);
  }

  return merged;
}

export async function runTvLiveSearch(options: {
  query: string;
  page?: number;
  limit?: number;
  pageToken?: string | null;
}): Promise<TvSearchResult> {
  const query = cleanText(options.query, 200) || "";
  const page = parsePositiveInt(String(options.page || 1), 1, 10_000);
  const limit = parsePositiveInt(String(options.limit || DEFAULT_LIMIT), DEFAULT_LIMIT, MAX_LIMIT);
  const incomingToken = cleanText(options.pageToken, 200);

  if (!query) {
    return {
      videos: [],
      catalogCount: 0,
      liveCount: 0,
      liveSearchEnabled: hasYouTubeDataApiKey(),
      nextPageToken: null,
      total: 0,
      error: null,
    };
  }

  if (incomingToken) {
    const live = await searchYouTubeLivePlayable(query, limit, incomingToken);

    return {
      videos: live.videos,
      catalogCount: 0,
      liveCount: live.videos.length,
      liveSearchEnabled: hasYouTubeDataApiKey(),
      nextPageToken: live.nextPageToken,
      total: live.videos.length,
      error: live.error,
    };
  }

  const catalog = await searchTvCatalogPlayable(query, page, limit);
  const remaining = Math.max(0, limit - catalog.videos.length);
  let liveVideos: TvPublicVideo[] = [];
  let nextPageToken: string | null = null;
  let liveError: string | null = null;

  if (remaining > 0) {
    const catalogIds = new Set(catalog.videos.map((video) => video.source_id));
    const live = await searchYouTubeLivePlayable(query, remaining, null);
    liveError = live.error;
    nextPageToken = live.nextPageToken;
    liveVideos = live.videos.filter((video) => !catalogIds.has(video.source_id));
  }

  const videos = dedupeBySourceId([...catalog.videos, ...liveVideos]);
  const catalogTotal = catalog.total;
  const hasMore =
    page * limit < catalogTotal || Boolean(nextPageToken && liveVideos.length > 0);

  return {
    videos,
    catalogCount: catalog.videos.length,
    liveCount: liveVideos.length,
    liveSearchEnabled: hasYouTubeDataApiKey(),
    nextPageToken,
    total: hasMore ? videos.length + 1 : videos.length,
    error: liveError,
  };
}
