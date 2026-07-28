/**
 * Historical / archive discovery helpers — sitemaps, JSON-LD VideoObject, Atom archives.
 * Only emit candidates with extractable provider content IDs.
 */

import { toConcertMediaCandidate, type ConcertMediaCandidate } from "../candidate";
import {
  buildYouTubeOfficialEmbedUrl,
  buildYouTubeOfficialWatchUrl,
} from "../providers/youtubeOfficial";
import { extractVimeoId } from "../providers/adapters/vimeo";
import { extractDailymotionId } from "../providers/adapters/dailymotion";

const YT_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/gi;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d{6,12})/gi;
const DM_ID = /dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/gi;

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export async function fetchTextSafe(
  url: string,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xml,application/json,*/*",
        "User-Agent": "HiddenTunesConcertDiscovery/1.0",
      },
      cache: "no-store",
      redirect: "follow",
      signal: options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? 15_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export function extractProviderIdsFromHtml(html: string): {
  youtube: string[];
  vimeo: string[];
  dailymotion: string[];
} {
  const youtube: string[] = [];
  const vimeo: string[] = [];
  const dailymotion: string[] = [];
  let m: RegExpExecArray | null;
  YT_ID.lastIndex = 0;
  while ((m = YT_ID.exec(html))) youtube.push(m[1]);
  VIMEO_ID.lastIndex = 0;
  while ((m = VIMEO_ID.exec(html))) {
    const id = extractVimeoId(m[1]);
    if (id) vimeo.push(id);
  }
  DM_ID.lastIndex = 0;
  while ((m = DM_ID.exec(html))) {
    const id = extractDailymotionId(m[1]);
    if (id) dailymotion.push(id);
  }
  // JSON-LD VideoObject
  const ldBlocks = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const block of ldBlocks || []) {
    const body = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    try {
      const json = JSON.parse(body);
      const nodes = Array.isArray(json) ? json : [json];
      for (const node of nodes) {
        const type = String(node["@type"] || "");
        if (!/VideoObject|BroadcastEvent|MusicEvent/i.test(type)) continue;
        const url = String(node.contentUrl || node.embedUrl || node.url || "");
        for (const id of extractProviderIdsFromHtml(url).youtube) youtube.push(id);
        for (const id of extractProviderIdsFromHtml(url).vimeo) vimeo.push(id);
        for (const id of extractProviderIdsFromHtml(url).dailymotion)
          dailymotion.push(id);
      }
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return {
    youtube: unique(youtube),
    vimeo: unique(vimeo),
    dailymotion: unique(dailymotion),
  };
}

export async function discoverFromSitemapUrls(options: {
  sitemapUrl: string;
  maxUrls?: number;
  maxCandidates?: number;
  signal?: AbortSignal;
}): Promise<ConcertMediaCandidate[]> {
  const xml = await fetchTextSafe(options.sitemapUrl, { signal: options.signal });
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) =>
    m[1].trim()
  );
  const maxUrls = options.maxUrls ?? 20;
  const maxCandidates = options.maxCandidates ?? 40;
  const out: ConcertMediaCandidate[] = [];
  for (const loc of locs.slice(0, maxUrls)) {
    if (out.length >= maxCandidates) break;
    const page = await fetchTextSafe(loc, { signal: options.signal });
    if (!page) continue;
    const ids = extractProviderIdsFromHtml(page);
    for (const id of ids.youtube) {
      if (out.length >= maxCandidates) break;
      const watch = buildYouTubeOfficialWatchUrl(id);
      const embed = buildYouTubeOfficialEmbedUrl(id);
      if (!watch || !embed) continue;
      out.push(
        toConcertMediaCandidate({
          provider: "youtube",
          providerContentId: id,
          title: `Concert media ${id}`,
          description: `Discovered via sitemap ${options.sitemapUrl}`,
          channelTitle: "",
          publishedAt: null,
          durationSeconds: null,
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          tags: ["sitemap"],
          liveBroadcastContent: "none",
          embeddable: true,
          officialWatchUrl: watch,
          embedUrl: embed,
          playbackMethod: "youtube_embed",
        })
      );
    }
  }
  return out;
}

export async function discoverFromArchivePage(options: {
  archiveUrl: string;
  maxCandidates?: number;
  signal?: AbortSignal;
}): Promise<ConcertMediaCandidate[]> {
  const html = await fetchTextSafe(options.archiveUrl, { signal: options.signal });
  if (!html) return [];
  const ids = extractProviderIdsFromHtml(html);
  const max = options.maxCandidates ?? 30;
  const out: ConcertMediaCandidate[] = [];
  for (const id of ids.youtube.slice(0, max)) {
    const watch = buildYouTubeOfficialWatchUrl(id);
    const embed = buildYouTubeOfficialEmbedUrl(id);
    if (!watch || !embed) continue;
    out.push(
      toConcertMediaCandidate({
        provider: "youtube",
        providerContentId: id,
        title: `Archive concert ${id}`,
        description: `Discovered via archive page ${options.archiveUrl}`,
        channelTitle: "",
        publishedAt: null,
        durationSeconds: null,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        tags: ["archive"],
        liveBroadcastContent: "none",
        embeddable: true,
        officialWatchUrl: watch,
        embedUrl: embed,
        playbackMethod: "youtube_embed",
      })
    );
  }
  for (const id of ids.vimeo.slice(0, Math.max(0, max - out.length))) {
    out.push(
      toConcertMediaCandidate({
        provider: "vimeo",
        providerContentId: id,
        title: `Vimeo archive ${id}`,
        description: `Discovered via archive page ${options.archiveUrl}`,
        channelTitle: "",
        publishedAt: null,
        durationSeconds: null,
        thumbnailUrl: null,
        tags: ["archive"],
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
