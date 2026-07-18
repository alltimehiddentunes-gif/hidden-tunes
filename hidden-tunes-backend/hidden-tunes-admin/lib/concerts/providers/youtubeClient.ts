/**
 * YouTube Data API helpers for Concerts discovery.
 * Uses YOUTUBE_API_KEY or YOUTUBE_DATA_API_KEY when present.
 * Never extracts progressive media URLs — metadata + official embed/watch only.
 */

import {
  buildYouTubeOfficialEmbedUrl,
  buildYouTubeOfficialWatchUrl,
  isValidYouTubeChannelId,
} from "./youtubeOfficial";

const YT_API = "https://www.googleapis.com/youtube/v3";

export type ConcertYouTubeClientOptions = {
  apiKey?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxResults?: number;
};

export type ConcertYouTubeVideoCandidate = {
  provider: "youtube";
  providerContentId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  tags: string[];
  liveBroadcastContent: "none" | "upcoming" | "live" | "completed" | string;
  embedHtmlPresent: boolean;
  embeddable: boolean | null;
  regionRestriction: {
    allowed?: string[];
    blocked?: string[];
  };
  officialWatchUrl: string;
  embedUrl: string | null;
};

function getApiKey(explicit?: string | null): string | null {
  const key = String(
    explicit ||
      process.env.YOUTUBE_API_KEY ||
      process.env.YOUTUBE_DATA_API_KEY ||
      ""
  ).trim();
  return key || null;
}

export function hasConcertYouTubeApiKey(explicit?: string | null): boolean {
  return Boolean(getApiKey(explicit));
}

async function ytFetch<T>(
  path: string,
  params: Record<string, string>,
  opts: ConcertYouTubeClientOptions
): Promise<T> {
  const apiKey = getApiKey(opts.apiKey);
  if (!apiKey) {
    throw new Error(
      "YOUTUBE_API_KEY (or YOUTUBE_DATA_API_KEY) is required for live Concerts YouTube discovery."
    );
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
      `YouTube API ${response.status}: ${body.slice(0, 240) || response.statusText}`
    );
  }

  return (await response.json()) as T;
}

export async function resolveYouTubeChannelIdForHandle(
  handle: string,
  opts: ConcertYouTubeClientOptions = {}
): Promise<string | null> {
  const cleaned = String(handle || "")
    .trim()
    .replace(/^@/, "");
  if (!cleaned) return null;
  if (isValidYouTubeChannelId(cleaned)) return cleaned;

  type ChannelsResponse = { items?: Array<{ id?: string }> };
  const data = await ytFetch<ChannelsResponse>(
    "channels",
    { part: "id", forHandle: cleaned },
    opts
  );
  const id = String(data.items?.[0]?.id || "").trim();
  return isValidYouTubeChannelId(id) ? id : null;
}

export async function fetchYouTubeUploadsPlaylistId(
  channelId: string,
  opts: ConcertYouTubeClientOptions = {}
): Promise<string | null> {
  if (!isValidYouTubeChannelId(channelId)) return null;
  type ChannelsResponse = {
    items?: Array<{
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };
  const data = await ytFetch<ChannelsResponse>(
    "channels",
    { part: "contentDetails", id: channelId },
    opts
  );
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
}

function parseIsoDurationSeconds(value: string | null | undefined): number | null {
  const raw = String(value || "").trim();
  if (!raw.startsWith("PT")) return null;
  const match = raw.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export async function listYouTubeUploadVideoIds(
  uploadsPlaylistId: string,
  opts: ConcertYouTubeClientOptions & {
    pageToken?: string | null;
  } = {}
): Promise<{ videoIds: string[]; nextPageToken: string | null }> {
  type PlaylistItemsResponse = {
    nextPageToken?: string;
    items?: Array<{
      contentDetails?: { videoId?: string };
      snippet?: { resourceId?: { videoId?: string } };
    }>;
  };

  const params: Record<string, string> = {
    part: "contentDetails,snippet",
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(Math.max(opts.maxResults ?? 25, 1), 50)),
  };
  if (opts.pageToken) params.pageToken = opts.pageToken;

  const data = await ytFetch<PlaylistItemsResponse>("playlistItems", params, opts);
  const videoIds = (data.items || [])
    .map(
      (item) =>
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || ""
    )
    .map((id) => id.trim())
    .filter((id) => /^[\w-]{11}$/.test(id));

  return {
    videoIds,
    nextPageToken: data.nextPageToken || null,
  };
}

export async function fetchYouTubeVideoCandidates(
  videoIds: string[],
  opts: ConcertYouTubeClientOptions = {}
): Promise<ConcertYouTubeVideoCandidate[]> {
  const unique = Array.from(new Set(videoIds.filter((id) => /^[\w-]{11}$/.test(id))));
  if (unique.length === 0) return [];

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
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
      };
      contentDetails?: {
        duration?: string;
        regionRestriction?: { allowed?: string[]; blocked?: string[] };
      };
      status?: { embeddable?: boolean; privacyStatus?: string };
      player?: { embedHtml?: string };
    }>;
  };

  const data = await ytFetch<VideosListResponse>(
    "videos",
    {
      part: "snippet,contentDetails,status,player",
      id: unique.join(","),
    },
    opts
  );

  const out: ConcertYouTubeVideoCandidate[] = [];
  for (const item of data.items || []) {
    const id = String(item.id || "").trim();
    if (!/^[\w-]{11}$/.test(id)) continue;
    const privacy = String(item.status?.privacyStatus || "").toLowerCase();
    if (privacy && privacy !== "public") continue;

    const embeddable =
      typeof item.status?.embeddable === "boolean" ? item.status.embeddable : null;
    const embedHtmlPresent = Boolean(item.player?.embedHtml);
    const watchUrl = buildYouTubeOfficialWatchUrl(id);
    const embedUrl = buildYouTubeOfficialEmbedUrl(id);
    if (!watchUrl || !embedUrl) continue;

    out.push({
      provider: "youtube",
      providerContentId: id,
      title: String(item.snippet?.title || "").trim(),
      description: String(item.snippet?.description || "").trim(),
      channelId: String(item.snippet?.channelId || "").trim(),
      channelTitle: String(item.snippet?.channelTitle || "").trim(),
      publishedAt: item.snippet?.publishedAt || null,
      durationSeconds: parseIsoDurationSeconds(item.contentDetails?.duration),
      thumbnailUrl:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        null,
      tags: Array.isArray(item.snippet?.tags) ? item.snippet!.tags! : [],
      liveBroadcastContent: item.snippet?.liveBroadcastContent || "none",
      embedHtmlPresent,
      embeddable,
      regionRestriction: {
        allowed: item.contentDetails?.regionRestriction?.allowed,
        blocked: item.contentDetails?.regionRestriction?.blocked,
      },
      officialWatchUrl: watchUrl,
      embedUrl,
    });
  }

  return out;
}

export async function discoverYouTubeChannelPage(options: {
  channelId: string;
  pageToken?: string | null;
  maxResults?: number;
  apiKey?: string | null;
  signal?: AbortSignal;
}): Promise<{
  candidates: ConcertYouTubeVideoCandidate[];
  nextPageToken: string | null;
  uploadsPlaylistId: string | null;
}> {
  const uploadsPlaylistId = await fetchYouTubeUploadsPlaylistId(options.channelId, options);
  if (!uploadsPlaylistId) {
    return { candidates: [], nextPageToken: null, uploadsPlaylistId: null };
  }

  const page = await listYouTubeUploadVideoIds(uploadsPlaylistId, {
    ...options,
    pageToken: options.pageToken,
    maxResults: options.maxResults,
  });
  const candidates = await fetchYouTubeVideoCandidates(page.videoIds, options);
  return {
    candidates,
    nextPageToken: page.nextPageToken,
    uploadsPlaylistId,
  };
}
