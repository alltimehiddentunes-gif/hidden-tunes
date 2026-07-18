import {
  OLYMPICS_ALLOWED_HOSTS,
  OLYMPICS_YOUTUBE_CHANNEL_ID,
  OLYMPICS_YOUTUBE_HANDLE,
  type OlympicsDiscoverResult,
  type OlympicsVideoRecord,
} from "./types";
import { OLYMPICS_FIXTURE_VIDEOS } from "./fixtures";

const YT_API = "https://www.googleapis.com/youtube/v3";

export type OlympicsClientOptions = {
  apiKey?: string | null;
  /** Use local fixtures instead of network (tests / dry-run without key). */
  useFixtures?: boolean;
  timeoutMs?: number;
  maxResults?: number;
  signal?: AbortSignal;
};

function getApiKey(explicit?: string | null): string | null {
  const key = String(explicit || process.env.YOUTUBE_API_KEY || "").trim();
  return key || null;
}

async function ytFetch<T>(
  path: string,
  params: Record<string, string>,
  opts: OlympicsClientOptions
): Promise<T> {
  const apiKey = getApiKey(opts.apiKey);
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required for live Olympics discovery.");
  }

  const url = new URL(`${YT_API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `YouTube API ${response.status}: ${body.slice(0, 200) || response.statusText}`
    );
  }

  return (await response.json()) as T;
}

export async function resolveOlympicsChannelId(
  opts: OlympicsClientOptions = {}
): Promise<string> {
  if (opts.useFixtures) return OLYMPICS_YOUTUBE_CHANNEL_ID;

  type ChannelsResponse = {
    items?: Array<{ id?: string }>;
  };

  const data = await ytFetch<ChannelsResponse>(
    "channels",
    {
      part: "id",
      forHandle: OLYMPICS_YOUTUBE_HANDLE,
    },
    opts
  );

  const id = String(data.items?.[0]?.id || "").trim();
  return id || OLYMPICS_YOUTUBE_CHANNEL_ID;
}

export async function fetchOlympicsUploadsPlaylistId(
  channelId: string,
  opts: OlympicsClientOptions = {}
): Promise<string | null> {
  if (opts.useFixtures) return "UU_PHASE2A_FIXTURE";

  type ChannelsResponse = {
    items?: Array<{
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };

  const data = await ytFetch<ChannelsResponse>(
    "channels",
    {
      part: "contentDetails",
      id: channelId,
    },
    opts
  );

  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
}

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    contentDetails?: { videoId?: string };
    snippet?: { title?: string; resourceId?: { videoId?: string } };
  }>;
};

type VideosListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelId?: string;
      channelTitle?: string;
      tags?: string[];
      liveBroadcastContent?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: { duration?: string };
    status?: {
      embeddable?: boolean;
      privacyStatus?: string;
    };
  }>;
};

function mapVideoItem(
  item: NonNullable<VideosListResponse["items"]>[number]
): OlympicsVideoRecord | null {
  const videoId = String(item.id || "").trim();
  if (!videoId) return null;

  const thumb =
    item.snippet?.thumbnails?.high?.url ||
    item.snippet?.thumbnails?.medium?.url ||
    item.snippet?.thumbnails?.default?.url ||
    null;

  return {
    videoId,
    title: String(item.snippet?.title || "").trim() || `Olympics ${videoId}`,
    description: String(item.snippet?.description || ""),
    publishedAt: String(item.snippet?.publishedAt || new Date().toISOString()),
    channelId: String(item.snippet?.channelId || OLYMPICS_YOUTUBE_CHANNEL_ID),
    channelTitle: String(item.snippet?.channelTitle || "Olympics"),
    thumbnailUrl: thumb,
    durationIso: item.contentDetails?.duration || null,
    embeddable: Boolean(item.status?.embeddable),
    privacyStatus: String(item.status?.privacyStatus || "unknown"),
    liveBroadcastContent: String(item.snippet?.liveBroadcastContent || "none"),
    tags: Array.isArray(item.snippet?.tags) ? item.snippet!.tags! : [],
  };
}

export async function discoverOlympicsVideos(
  opts: OlympicsClientOptions = {}
): Promise<OlympicsDiscoverResult> {
  const limit = Math.min(100, Math.max(1, opts.maxResults ?? 20));

  if (opts.useFixtures || !getApiKey(opts.apiKey)) {
    if (opts.useFixtures || process.env.SPORTS_OLYMPICS_USE_FIXTURES === "1") {
      return {
        supported: true,
        items: OLYMPICS_FIXTURE_VIDEOS.slice(0, limit),
      };
    }
    return {
      supported: false,
      reason:
        "YOUTUBE_API_KEY missing — set key for live discovery or SPORTS_OLYMPICS_USE_FIXTURES=1 for fixtures.",
    };
  }

  const channelId = await resolveOlympicsChannelId(opts);
  const uploadsId = await fetchOlympicsUploadsPlaylistId(channelId, opts);
  if (!uploadsId) {
    return {
      supported: false,
      reason: "Olympics uploads playlist not found.",
    };
  }

  const videoIds: string[] = [];
  let pageToken: string | undefined;

  while (videoIds.length < limit) {
    const pageSize = Math.min(50, limit - videoIds.length);
    const params: Record<string, string> = {
      part: "contentDetails,snippet",
      playlistId: uploadsId,
      maxResults: String(pageSize),
    };
    if (pageToken) params.pageToken = pageToken;

    const page = await ytFetch<PlaylistItemsResponse>(
      "playlistItems",
      params,
      opts
    );

    for (const item of page.items || []) {
      const id =
        item.contentDetails?.videoId ||
        item.snippet?.resourceId?.videoId ||
        "";
      if (id) videoIds.push(id);
      if (videoIds.length >= limit) break;
    }

    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  if (videoIds.length === 0) {
    return { supported: true, items: [] };
  }

  const items: OlympicsVideoRecord[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const data = await ytFetch<VideosListResponse>(
      "videos",
      {
        part: "snippet,contentDetails,status",
        id: chunk.join(","),
      },
      opts
    );
    for (const raw of data.items || []) {
      const mapped = mapVideoItem(raw);
      if (mapped) items.push(mapped);
    }
  }

  return { supported: true, items: items.slice(0, limit) };
}

export function buildOlympicsEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}

export function buildOlympicsWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function isOlympicsAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (OLYMPICS_ALLOWED_HOSTS as readonly string[]).some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}
