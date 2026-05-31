import { YOUTUBE_CONFIG } from "../constants/youtube";

const API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const DEFAULT_MAX_RESULTS = 50;
const YOUTUBE_DATA_API_ENABLED = false;

export type BackendYouTubeTrack = {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  channelTitle: string;
  thumbnail: string;
  artwork: string;
  cover: string;
  sourceName: "YouTube";
  source: "youtube";
  type: "youtube_video";
  isYouTube: true;
  isOnline: true;
  duration?: string | number;
  url?: string;
  streamUrl?: string;
  [key: string]: any;
};

export type BackendStatus = {
  online: boolean;
  statusText: string;
  baseUrl: string;
};

export type YouTubePage = {
  tracks: BackendYouTubeTrack[];
  nextPageToken?: string;
  error?: string;
};

function extractYouTubeId(value: any): string {
  const raw = String(value || "").replace("youtube-", "").trim();

  if (!raw) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);

    const watchId = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch?.[1]) return shortsMatch[1];

    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch?.[1]) return embedMatch[1];

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {}

  const match = raw.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function normalizeBackendTrack(item: unknown): BackendYouTubeTrack | null {
  if (!item || typeof item !== "object") return null;

  const track = item as Record<string, any>;
  const snippet = (track.snippet || {}) as Record<string, any>;
  const thumbnails = (snippet.thumbnails || {}) as Record<string, any>;
  const apiId = track.id as Record<string, any> | string | undefined;

  const videoId = extractYouTubeId(
    track.videoId ||
      (typeof apiId === "object" ? apiId.videoId : "") ||
      (typeof apiId === "string" ? apiId : "") ||
      snippet.resourceId?.videoId ||
      snippet.videoId ||
      track.video_id ||
      track.url ||
      track.webpage_url ||
      track.original_url
  );

  if (!videoId) return null;

  const artist = String(
    track.artist ||
      track.channelTitle ||
      snippet.channelTitle ||
      track.uploader ||
      track.channel ||
      "Hidden Tunes TV"
  );

  const thumbnail = String(
    track.thumbnail ||
      track.cover ||
      track.image ||
      track.artwork ||
      thumbnails.maxres?.url ||
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  );

  return {
    id: `youtube-${videoId}`,
    videoId,
    title: String(track.title || snippet.title || "Hidden Tunes TV"),
    artist,
    channelTitle: String(track.channelTitle || artist),
    thumbnail,
    artwork: thumbnail,
    cover: thumbnail,
    sourceName: "YouTube",
    source: "youtube",
    type: "youtube_video",
    isYouTube: true,
    isOnline: true,
    duration: track.duration,
    url: track.url,
    streamUrl: track.streamUrl,
  };
}

function dedupeTracks(tracks: BackendYouTubeTrack[]) {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    if (!track.videoId) return false;
    if (seen.has(track.videoId)) return false;

    seen.add(track.videoId);
    return true;
  });
}

function safeTracks(data: unknown): BackendYouTubeTrack[] {
  const payload = data as any;

  const rawTracks: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.tracks)
    ? payload.tracks
    : Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.entries)
    ? payload.entries
    : [];

  const normalizedTracks = rawTracks
    .map((item) => normalizeBackendTrack(item))
    .filter((item): item is BackendYouTubeTrack => item !== null);

  return dedupeTracks(normalizedTracks);
}

function hasYouTubeApiConfig() {
  return Boolean(YOUTUBE_CONFIG.API_KEY && YOUTUBE_CONFIG.CHANNEL_ID);
}

function getYouTubeConfigError() {
  if (!YOUTUBE_CONFIG.API_KEY && !YOUTUBE_CONFIG.CHANNEL_ID) {
    return "Missing YouTube API key and channel ID.";
  }

  if (!YOUTUBE_CONFIG.API_KEY) return "Missing YouTube API key.";
  if (!YOUTUBE_CONFIG.CHANNEL_ID) return "Missing Hidden Tunes YouTube channel ID.";

  return "";
}

function getYouTubeErrorMessage(status: number, body: string) {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message || "";
    const reason = parsed?.error?.errors?.[0]?.reason || "";

    if (message || reason) {
      return `YouTube API ${status}: ${message || reason}`;
    }
  } catch {}

  if (status === 403) return "YouTube API quota or permission limit reached.";
  if (status === 400) return "YouTube API rejected this request.";

  return `YouTube API request failed with status ${status}.`;
}

function buildSearchUrl(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    key: YOUTUBE_CONFIG.API_KEY,
  });

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.set(key, String(value));
  });

  return `${API_BASE_URL}/search?${query.toString()}`;
}

async function fetchYouTubePage(url: string, label: string): Promise<YouTubePage> {
  if (!YOUTUBE_DATA_API_ENABLED) {
    console.log(
      `Hidden Tunes TV ${label} skipped: YouTube Data API is disabled. Use in-app YouTube WebView discovery.`
    );

    return {
      tracks: [],
      error: "YouTube Data API discovery is disabled. Use Hidden Tunes TV web search.",
    };
  }

  const configError = getYouTubeConfigError();

  if (configError || !hasYouTubeApiConfig()) {
    console.log(`Hidden Tunes TV ${label} config error:`, configError);
    return {
      tracks: [],
      error: configError || "Missing YouTube API configuration.",
    };
  }

  try {
    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      const message = getYouTubeErrorMessage(response.status, text);
      console.log(`Hidden Tunes TV ${label} request failed:`, message);
      return {
        tracks: [],
        error: message,
      };
    }

    if (!text.trim()) {
      console.log(`Hidden Tunes TV ${label} empty response.`);
      return {
        tracks: [],
        error: "YouTube returned an empty response.",
      };
    }

    const data = JSON.parse(text);

    return {
      tracks: safeTracks(data),
      nextPageToken: data?.nextPageToken,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "YouTube request failed.";

    console.log(`Hidden Tunes TV ${label} request error:`, message);

    return {
      tracks: [],
      error: message,
    };
  }
}

export async function checkYouTubeBackendStatus(): Promise<BackendStatus> {
  if (!YOUTUBE_DATA_API_ENABLED) {
    return {
      online: false,
      statusText: "YouTube Data API disabled; TV uses WebView discovery",
      baseUrl: API_BASE_URL,
    };
  }

  const configError = getYouTubeConfigError();

  if (configError) {
    return {
      online: false,
      statusText: configError,
      baseUrl: API_BASE_URL,
    };
  }

  return {
    online: true,
    statusText: "YouTube Data API ready",
    baseUrl: API_BASE_URL,
  };
}

export async function getHiddenTunesYouTubeCatalogPage(
  pageToken = "",
  limit = YOUTUBE_CONFIG.MAX_RESULTS || 12
): Promise<YouTubePage> {
  const safeLimit = Math.min(Number(limit || DEFAULT_MAX_RESULTS), 50);

  return fetchYouTubePage(
    buildSearchUrl({
      channelId: YOUTUBE_CONFIG.CHANNEL_ID,
      maxResults: safeLimit,
      order: "date",
      pageToken,
    }),
    "channel feed"
  );
}

export async function getHiddenTunesYouTubeCatalog(): Promise<
  BackendYouTubeTrack[]
> {
  const page = await getHiddenTunesYouTubeCatalogPage();
  return page.tracks;
}

export async function fetchHiddenTunesFeed(
  limit = DEFAULT_MAX_RESULTS
): Promise<BackendYouTubeTrack[]> {
  const page = await getHiddenTunesYouTubeCatalogPage("", limit);
  return page.tracks;
}

export async function searchYouTubeBackendPage(
  query: string,
  pageToken = "",
  limit = DEFAULT_MAX_RESULTS
): Promise<YouTubePage> {
  const safeQuery = String(query || "").trim();

  if (!safeQuery) return { tracks: [] };

  return fetchYouTubePage(
    buildSearchUrl({
      q: safeQuery,
      maxResults: Math.min(Number(limit || DEFAULT_MAX_RESULTS), 50),
      pageToken,
    }),
    `search "${safeQuery}"`
  );
}

export async function searchYouTubeBackend(
  query: string
): Promise<BackendYouTubeTrack[]> {
  const page = await searchYouTubeBackendPage(query);
  return page.tracks;
}

export async function getRelatedYouTubeVideosPage(
  videoId: string,
  pageToken = "",
  limit = 10
): Promise<YouTubePage> {
  const safeVideoId = extractYouTubeId(videoId);

  if (!safeVideoId) return { tracks: [] };

  return fetchYouTubePage(
    buildSearchUrl({
      relatedToVideoId: safeVideoId,
      maxResults: Math.min(Number(limit || 10), 25),
      pageToken,
    }),
    `related videos for ${safeVideoId}`
  );
}

export async function getTrendingYouTubeBackend(): Promise<
  BackendYouTubeTrack[]
> {
  const page = await searchYouTubeBackendPage("Hidden Tunes music");
  return page.tracks;
}

export async function getYouTubeBackendStream(_videoId: string): Promise<string> {
  throw new Error(
    "YouTube audio extraction is disabled. Use WebView playback for YouTube results."
  );
}

export async function getYouTubeAudioUrl(videoId: string): Promise<string> {
  return getYouTubeBackendStream(videoId);
}
