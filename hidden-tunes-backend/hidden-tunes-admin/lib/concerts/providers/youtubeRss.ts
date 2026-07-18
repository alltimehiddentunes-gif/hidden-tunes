/**
 * YouTube Atom RSS discovery — no Data API key required.
 * Returns recent uploads (~15) per channel. Use for live expansion when
 * YOUTUBE_API_KEY is absent; prefer Data API when present for pagination.
 */

import {
  buildYouTubeOfficialEmbedUrl,
  buildYouTubeOfficialWatchUrl,
  isValidYouTubeChannelId,
} from "./youtubeOfficial";
import type { ConcertYouTubeVideoCandidate } from "./youtubeClient";

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(re);
  return match ? decodeXml(match[1].trim()) : null;
}

export async function discoverYouTubeChannelPageViaRss(options: {
  channelId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{
  candidates: ConcertYouTubeVideoCandidate[];
  nextPageToken: string | null;
  uploadsPlaylistId: string | null;
  method: "youtube_atom_rss";
}> {
  if (!isValidYouTubeChannelId(options.channelId)) {
    return {
      candidates: [],
      nextPageToken: null,
      uploadsPlaylistId: null,
      method: "youtube_atom_rss",
    };
  }

  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
    options.channelId
  )}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/atom+xml,application/xml,text/xml,*/*" },
    cache: "no-store",
    signal:
      options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 15_000),
  });
  if (!response.ok) {
    throw new Error(`YouTube RSS ${response.status}`);
  }
  const xml = await response.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  const candidates: ConcertYouTubeVideoCandidate[] = [];

  for (const entry of entries) {
    const videoId =
      extractTag(entry, "yt:videoId") ||
      (entry.match(/videoId[>:]?\s*([\w-]{11})/i)?.[1] ?? null);
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) continue;
    const title = extractTag(entry, "title") || "Untitled";
    const publishedAt = extractTag(entry, "published");
    const authorName =
      extractTag(entry, "name") ||
      extractTag(entry, "author") ||
      null;
    const mediaDesc =
      extractTag(entry, "media:description") ||
      extractTag(entry, "summary") ||
      "";
    const thumb =
      entry.match(/url="(https:\/\/i\.ytimg\.com[^"]+)"/i)?.[1] || null;
    const watchUrl = buildYouTubeOfficialWatchUrl(videoId);
    const embedUrl = buildYouTubeOfficialEmbedUrl(videoId);
    if (!watchUrl || !embedUrl) continue;

    candidates.push({
      provider: "youtube",
      providerContentId: videoId,
      title,
      description: mediaDesc,
      channelId: options.channelId,
      channelTitle: authorName || "",
      publishedAt,
      durationSeconds: null,
      thumbnailUrl: thumb,
      tags: [],
      liveBroadcastContent: "none",
      embedHtmlPresent: true,
      embeddable: null,
      regionRestriction: {},
      officialWatchUrl: watchUrl,
      embedUrl,
    });
  }

  return {
    candidates,
    nextPageToken: null, // Atom feed is not cursor-paginated
    uploadsPlaylistId: null,
    method: "youtube_atom_rss",
  };
}

/** Resolve UC… from a YouTube handle/channel page HTML without Data API. */
export async function resolveYouTubeChannelIdFromPage(
  handleOrUrl: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<string | null> {
  const raw = String(handleOrUrl || "").trim();
  if (!raw) return null;
  if (isValidYouTubeChannelId(raw)) return raw;

  let url = raw;
  if (raw.startsWith("@")) url = `https://www.youtube.com/${raw}`;
  else if (!/^https?:\/\//i.test(raw)) url = `https://www.youtube.com/@${raw}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html",
      "User-Agent": "HiddenTunesConcertDiscovery/1.0",
    },
    redirect: "follow",
    cache: "no-store",
    signal:
      options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? 15_000),
  });
  if (!response.ok) return null;
  const html = await response.text();
  const match =
    html.match(/"channelId":"(UC[\w-]{22})"/) ||
    html.match(/\/channel\/(UC[\w-]{22})/);
  const id = match?.[1] || null;
  return id && isValidYouTubeChannelId(id) ? id : null;
}
