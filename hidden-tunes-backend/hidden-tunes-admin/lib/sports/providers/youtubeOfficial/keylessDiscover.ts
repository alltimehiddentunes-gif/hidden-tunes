/**
 * Keyless official YouTube live discovery.
 * Uses public YouTube search HTML + oEmbed. Never extracts HLS.
 * Only returns items from pilot-approved official channel IDs.
 */

import {
  findPilotSourceByChannelId,
  pilotApprovedChannelIds,
  type PilotOfficialSource,
} from "../../broadcast/pilotOfficialSources";
import { buildOfficialYoutubeEmbedUrl } from "./discover";

export type KeylessLiveItem = {
  videoId: string;
  channelId: string;
  title: string;
  authorName: string | null;
  sport: string;
  organization: string;
  sourceId: string;
  live: true;
  embeddable: boolean;
  embedUrl: string;
  watchUrl: string;
  discoveredAt: string;
  discoveryQuery: string;
  provenance: "youtube_public_live_search+oembed";
};

export type KeylessLiveDiscoveryReport = {
  executedAt: string;
  channelsAllowlisted: number;
  queriesRun: number;
  rawLiveHits: number;
  approvedLiveHits: number;
  rejectedUnofficial: number;
  embedDisabled: number;
  items: KeylessLiveItem[];
  notes: string[];
};

const DEFAULT_QUERIES = [
  "FIBA live",
  "FIBA 3x3 live",
  "World Surf League live",
  "AFL live",
  "Asian Cricket Council live",
  "live basketball FIBA",
  "Ballito Pro live",
];

const LIVE_SP = "EgJAAQ%253D%253D";

type FetchFn = typeof fetch;

async function fetchText(url: string, fetchImpl: FetchFn): Promise<string> {
  const res = await fetchImpl(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; HiddenTunesSportsDiscovery/1.0; +https://admin.hiddentunes.com)",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return await res.text();
}

async function oembedOk(
  videoId: string,
  fetchImpl: FetchFn
): Promise<{ ok: boolean; title: string | null; author: string | null }> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;
  try {
    const res = await fetchImpl(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; HiddenTunesSportsDiscovery/1.0)",
      },
    });
    if (!res.ok) return { ok: false, title: null, author: null };
    const json = (await res.json()) as {
      title?: string;
      author_name?: string;
    };
    return {
      ok: true,
      title: json.title || null,
      author: json.author_name || null,
    };
  } catch {
    return { ok: false, title: null, author: null };
  }
}

function parseLiveChunks(html: string): Array<{
  videoId: string;
  channelId: string | null;
  channelName: string | null;
  title: string;
  isLive: boolean;
}> {
  const chunks = html.split('"videoRenderer":{').slice(1);
  const out: Array<{
    videoId: string;
    channelId: string | null;
    channelName: string | null;
    title: string;
    isLive: boolean;
  }> = [];
  for (const ch of chunks.slice(0, 24)) {
    const vid = ch.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1];
    if (!vid) continue;
    const title =
      ch.match(/"title":\{"runs":\[\{"text":"(.*?)"\}/)?.[1] ||
      ch.match(/"text":"(.*?)"/)?.[1] ||
      "";
    const owner = ch.match(
      /"ownerText":\{"runs":\[\{"text":"(.*?)".*?"browseId":"(UC[A-Za-z0-9_-]{22})"/
    );
    const channelName = owner?.[1] || null;
    const channelId =
      owner?.[2] ||
      ch.match(/"browseId":"(UC[A-Za-z0-9_-]{22})"/)?.[1] ||
      null;
    const isLive = /BADGE_STYLE_TYPE_LIVE_NOW|"isLive"\s*:\s*true/.test(ch);
    out.push({ videoId: vid, channelId, channelName, title, isLive });
  }
  return out;
}

/**
 * Discover currently live official broadcasts for pilot-approved channels.
 */
export async function discoverKeylessOfficialLives(input?: {
  queries?: string[];
  fetchImpl?: FetchFn;
  maxItems?: number;
}): Promise<KeylessLiveDiscoveryReport> {
  const fetchImpl = input?.fetchImpl || fetch;
  const queries = input?.queries || DEFAULT_QUERIES;
  const allow = new Set(pilotApprovedChannelIds());
  const notes: string[] = [];
  const items: KeylessLiveItem[] = [];
  const seen = new Set<string>();
  let rawLiveHits = 0;
  let rejectedUnofficial = 0;
  let embedDisabled = 0;
  const maxItems = Math.min(input?.maxItems || 12, 25);

  for (const query of queries) {
    if (items.length >= maxItems) break;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&sp=${LIVE_SP}`;
    let html = "";
    try {
      html = await fetchText(url, fetchImpl);
    } catch (e) {
      notes.push(
        `query_fail:${query}:${e instanceof Error ? e.message : "error"}`
      );
      continue;
    }
    const chunks = parseLiveChunks(html);
    for (const chunk of chunks) {
      if (!chunk.isLive) continue;
      rawLiveHits += 1;
      if (!chunk.channelId || !allow.has(chunk.channelId)) {
        rejectedUnofficial += 1;
        continue;
      }
      if (seen.has(chunk.videoId)) continue;
      const source = findPilotSourceByChannelId(chunk.channelId) as PilotOfficialSource;
      const oe = await oembedOk(chunk.videoId, fetchImpl);
      if (!oe.ok) {
        embedDisabled += 1;
        notes.push(`embed_disabled:${chunk.videoId}`);
        continue;
      }
      seen.add(chunk.videoId);
      items.push({
        videoId: chunk.videoId,
        channelId: chunk.channelId,
        title: oe.title || chunk.title || `${source.organization} live`,
        authorName: oe.author,
        sport: source.sport,
        organization: source.organization,
        sourceId: source.id,
        live: true,
        embeddable: true,
        embedUrl: buildOfficialYoutubeEmbedUrl(chunk.videoId),
        watchUrl: `https://www.youtube.com/watch?v=${chunk.videoId}`,
        discoveredAt: new Date().toISOString(),
        discoveryQuery: query,
        provenance: "youtube_public_live_search+oembed",
      });
      if (items.length >= maxItems) break;
    }
  }

  notes.push(
    "Keyless discovery uses public YouTube live search + oEmbed only; no HLS extraction."
  );
  notes.push(
    "playable_in_app requires DB promote + validated broadcast + resolver success."
  );

  return {
    executedAt: new Date().toISOString(),
    channelsAllowlisted: allow.size,
    queriesRun: queries.length,
    rawLiveHits,
    approvedLiveHits: items.length,
    rejectedUnofficial,
    embedDisabled,
    items,
    notes: [...new Set(notes)].slice(0, 40),
  };
}
