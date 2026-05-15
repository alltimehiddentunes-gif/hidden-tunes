import { YOUTUBE_CONFIG } from "../constants/youtube";

const API_BASE_URL = "https://www.googleapis.com/youtube/v3";

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
      track.id ||
      (typeof apiId === "object" ? apiId.videoId : "") ||
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

async function fetchJson(url: string): Promise<any | null> {
  if (!hasYouTubeApiConfig()) return null;

  try {
    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      return null;
    }

    if (!text.trim()) return null;

    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function checkYouTubeBackendStatus(): Promise<BackendStatus> {
  if (!hasYouTubeApiConfig()) {
    return {
      online: false,
      statusText: "Missing YouTube config",
      baseUrl: API_BASE_URL,
    };
  }

  return {
    online: true,
    statusText: "YouTube Data API ready",
    baseUrl: API_BASE_URL,
  };
}

export async function getHiddenTunesYouTubeCatalog(): Promise<
  BackendYouTubeTrack[]
> {
  if (!hasYouTubeApiConfig()) return [];

  const data = await fetchJson(
    `${API_BASE_URL}/search?part=snippet&channelId=${encodeURIComponent(
      YOUTUBE_CONFIG.CHANNEL_ID
    )}&maxResults=${Math.min(
      YOUTUBE_CONFIG.MAX_RESULTS || 12,
      20
    )}&order=date&type=video&videoEmbeddable=true&key=${encodeURIComponent(
      YOUTUBE_CONFIG.API_KEY
    )}`
  );

  return safeTracks(data);
}

export async function fetchHiddenTunesFeed(
  limit = 20
): Promise<BackendYouTubeTrack[]> {
  if (!hasYouTubeApiConfig()) return [];

  const safeLimit = Math.min(Number(limit || 20), 20);

  const data = await fetchJson(
    `${API_BASE_URL}/search?part=snippet&channelId=${encodeURIComponent(
      YOUTUBE_CONFIG.CHANNEL_ID
    )}&maxResults=${safeLimit}&order=date&type=video&videoEmbeddable=true&key=${encodeURIComponent(
      YOUTUBE_CONFIG.API_KEY
    )}`
  );

  return safeTracks(data);
}

export async function searchYouTubeBackend(
  query: string
): Promise<BackendYouTubeTrack[]> {
  if (!hasYouTubeApiConfig()) return [];

  const safeQuery = String(query || "").trim();

  if (!safeQuery) return [];

  const data = await fetchJson(
    `${API_BASE_URL}/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=moderate&maxResults=20&q=${encodeURIComponent(
      safeQuery
    )}&key=${encodeURIComponent(YOUTUBE_CONFIG.API_KEY)}`
  );

  return safeTracks(data);
}

export async function getTrendingYouTubeBackend(): Promise<
  BackendYouTubeTrack[]
> {
  if (!hasYouTubeApiConfig()) return [];

  const data = await fetchJson(
    `${API_BASE_URL}/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=moderate&maxResults=20&q=${encodeURIComponent(
      "Hidden Tunes music"
    )}&key=${encodeURIComponent(YOUTUBE_CONFIG.API_KEY)}`
  );

  return safeTracks(data);
}

export async function getYouTubeBackendStream(_videoId: string): Promise<string> {
  throw new Error(
    "YouTube audio extraction is disabled. Use WebView playback for YouTube results."
  );
}

export async function getYouTubeAudioUrl(videoId: string): Promise<string> {
  return getYouTubeBackendStream(videoId);
}
