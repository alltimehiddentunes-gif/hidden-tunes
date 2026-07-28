/**
 * Public feed discovery for non-YouTube providers (no private API keys required).
 */

import { toConcertMediaCandidate, type ConcertMediaCandidate } from "../candidate";
import { extractVimeoId } from "../providers/adapters/vimeo";
import { extractDailymotionId } from "../providers/adapters/dailymotion";
import { extractTwitchTarget } from "../providers/adapters/twitch";

function vimeoUserFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/vimeo\.com/.test(u.hostname)) return null;
    const part = u.pathname.split("/").filter(Boolean)[0];
    if (!part || /^\d+$/.test(part)) return null;
    return part;
  } catch {
    return null;
  }
}

export async function discoverVimeoUserVideos(options: {
  mediaChannelUrl: string;
  max?: number;
  signal?: AbortSignal;
}): Promise<ConcertMediaCandidate[]> {
  const user = vimeoUserFromUrl(options.mediaChannelUrl);
  if (!user) return [];
  const endpoint = `https://vimeo.com/api/v2/${encodeURIComponent(user)}/videos.json`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  const max = options.max ?? 20;
  const out: ConcertMediaCandidate[] = [];
  for (const row of rows.slice(0, max)) {
    const id = extractVimeoId(String(row.id || row.url || ""));
    if (!id) continue;
    out.push(
      toConcertMediaCandidate({
        provider: "vimeo",
        providerContentId: id,
        title: String(row.title || "Vimeo video"),
        description: String(row.description || ""),
        channelTitle: String(row.user_name || user),
        publishedAt: String(row.upload_date || row.created_time || "") || null,
        durationSeconds: Number(row.duration) || null,
        thumbnailUrl: String(row.thumbnail_large || row.thumbnail_medium || "") || null,
        tags: [],
        liveBroadcastContent: "none",
        embeddable: true,
        officialWatchUrl: `https://vimeo.com/${id}`,
        embedUrl: `https://player.vimeo.com/video/${id}`,
        playbackMethod: "vimeo_embed",
      })
    );
  }
  return out;
}

function dailymotionUserFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/dailymotion\.com/.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

export async function discoverDailymotionUserVideos(options: {
  mediaChannelUrl: string;
  max?: number;
  signal?: AbortSignal;
}): Promise<ConcertMediaCandidate[]> {
  const user = dailymotionUserFromUrl(options.mediaChannelUrl);
  if (!user) return [];
  const limit = options.max ?? 20;
  const endpoint = `https://api.dailymotion.com/user/${encodeURIComponent(
    user
  )}/videos?fields=id,title,description,created_time,duration,thumbnail_720_url,channel&limit=${limit}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    list?: Array<Record<string, unknown>>;
  };
  const out: ConcertMediaCandidate[] = [];
  for (const row of payload.list || []) {
    const id = extractDailymotionId(String(row.id || ""));
    if (!id) continue;
    out.push(
      toConcertMediaCandidate({
        provider: "dailymotion",
        providerContentId: id,
        title: String(row.title || "Dailymotion video"),
        description: String(row.description || ""),
        channelTitle: String(row.channel || user),
        publishedAt: row.created_time
          ? new Date(Number(row.created_time) * 1000).toISOString()
          : null,
        durationSeconds: Number(row.duration) || null,
        thumbnailUrl: String(row.thumbnail_720_url || "") || null,
        tags: [],
        liveBroadcastContent: "none",
        embeddable: true,
        officialWatchUrl: `https://www.dailymotion.com/video/${id}`,
        embedUrl: `https://www.dailymotion.com/embed/video/${id}`,
        playbackMethod: "dailymotion_embed",
      })
    );
  }
  return out;
}

export async function discoverTwitchChannelVideos(options: {
  mediaChannelUrl: string;
  clientId?: string | null;
  max?: number;
  signal?: AbortSignal;
}): Promise<ConcertMediaCandidate[]> {
  const target = extractTwitchTarget(options.mediaChannelUrl);
  if (!target || target.kind !== "channel") return [];
  const clientId = String(
    options.clientId || process.env.TWITCH_CLIENT_ID || ""
  ).trim();
  if (!clientId) {
    // Without Twitch client id, return empty — do not invent content.
    return [];
  }
  // Helix requires OAuth app token; without it we skip rather than fabricate.
  return [];
}
