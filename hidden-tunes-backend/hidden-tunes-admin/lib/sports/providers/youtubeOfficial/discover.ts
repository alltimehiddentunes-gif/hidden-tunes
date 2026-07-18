/**
 * Official YouTube live/upcoming discovery for approved official channels.
 * Uses embeddable + syndicated filters. Never extracts HLS.
 */

import {
  allowlistedYoutubeChannelIds,
  canProduceLiveInApp,
  listActiveBroadcastSources,
  type BroadcastSourceRecord,
} from "../../broadcast/sourceRegistry";

export type YoutubeLiveDiscoveryItem = {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  scheduledStart: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  liveBroadcastContent: "live" | "upcoming" | "none" | string;
  embeddable: boolean;
  syndicated: boolean;
  privacyStatus: string;
  regionRestriction: { allowed?: string[]; blocked?: string[] } | null;
  concurrentViewers: number | null;
  thumbnails: Record<string, string>;
  embedUrl: string;
  rejectReason: string | null;
};

export type YoutubeLiveDiscoveryReport = {
  apiKeyPresent: boolean;
  allowlistedChannels: string[];
  searchedLive: number;
  searchedUpcoming: number;
  discovered: number;
  embeddable: number;
  syndicated: number;
  live: number;
  upcoming: number;
  rejected: number;
  rejectReasons: string[];
  items: YoutubeLiveDiscoveryItem[];
  /** Server-side eligible before device probe — NOT playable=true yet */
  serverEligible: number;
  liveInAppEligible: number;
  notes: string[];
};

export function getYoutubeApiKey(): string {
  return String(
    process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY || ""
  ).trim();
}

export function buildOfficialYoutubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`;
}

export function isStorefrontRegionAllowed(
  region: { allowed?: string[]; blocked?: string[] } | null,
  storefrontCountry: string
): boolean {
  const cc = storefrontCountry.toUpperCase();
  if (!region) return true;
  if (region.blocked?.map((c) => c.toUpperCase()).includes(cc)) return false;
  if (region.allowed && region.allowed.length > 0) {
    return region.allowed.map((c) => c.toUpperCase()).includes(cc);
  }
  return true;
}

export type YoutubeCandidateValidation = {
  ok: boolean;
  reasons: string[];
  status:
    | "ready_candidate"
    | "not_started"
    | "ended"
    | "geo_blocked"
    | "rejected";
};

/**
 * Server-side gate before device probe. Does not set playable=true.
 */
export function validateYoutubeLiveCandidate(input: {
  item: YoutubeLiveDiscoveryItem;
  channelApprovedForEmbed: boolean;
  storefrontCountry: string;
  nowMs?: number;
}): YoutubeCandidateValidation {
  const reasons: string[] = [];
  const now = input.nowMs ?? Date.now();

  if (!input.channelApprovedForEmbed) {
    return {
      ok: false,
      reasons: ["channel_not_approved_embed"],
      status: "rejected",
    };
  }
  if (!input.item.embeddable) {
    return { ok: false, reasons: ["not_embeddable"], status: "rejected" };
  }
  if (!input.item.syndicated) {
    return { ok: false, reasons: ["not_syndicated"], status: "rejected" };
  }
  if (input.item.privacyStatus !== "public") {
    return {
      ok: false,
      reasons: [`privacy_${input.item.privacyStatus}`],
      status: "rejected",
    };
  }
  if (
    !isStorefrontRegionAllowed(
      input.item.regionRestriction,
      input.storefrontCountry
    )
  ) {
    return { ok: false, reasons: ["geo_blocked"], status: "geo_blocked" };
  }
  if (input.item.actualEnd) {
    return { ok: false, reasons: ["broadcast_ended"], status: "ended" };
  }
  if (input.item.liveBroadcastContent === "upcoming") {
    return { ok: false, reasons: ["not_started"], status: "not_started" };
  }
  if (input.item.liveBroadcastContent !== "live") {
    // Scheduled start in future without live flag
    if (input.item.scheduledStart) {
      const start = Date.parse(input.item.scheduledStart);
      if (Number.isFinite(start) && start > now) {
        return { ok: false, reasons: ["not_started"], status: "not_started" };
      }
    }
    return {
      ok: false,
      reasons: [`broadcast_state_${input.item.liveBroadcastContent}`],
      status: "rejected",
    };
  }

  reasons.push("server_live_embed_ok");
  return { ok: true, reasons, status: "ready_candidate" };
}

type FetchFn = typeof fetch;

async function searchChannelEvent(input: {
  apiKey: string;
  channelId: string;
  eventType: "live" | "upcoming";
  maxResults: number;
  fetchImpl: FetchFn;
}): Promise<string[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", input.channelId);
  url.searchParams.set("eventType", input.eventType);
  url.searchParams.set("type", "video");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("videoSyndicated", "true");
  url.searchParams.set("maxResults", String(input.maxResults));
  url.searchParams.set("key", input.apiKey);

  const res = await input.fetchImpl(url.toString());
  if (!res.ok) throw new Error(`search_http_${res.status}`);
  const json = (await res.json()) as {
    items?: Array<{ id?: { videoId?: string } }>;
  };
  return (json.items || [])
    .map((i) => i.id?.videoId)
    .filter(Boolean) as string[];
}

async function fetchVideoDetails(input: {
  apiKey: string;
  videoIds: string[];
  fetchImpl: FetchFn;
}): Promise<Array<Record<string, unknown>>> {
  if (!input.videoIds.length) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set(
    "part",
    "snippet,status,contentDetails,liveStreamingDetails,player"
  );
  url.searchParams.set("id", input.videoIds.join(","));
  url.searchParams.set("key", input.apiKey);
  const res = await input.fetchImpl(url.toString());
  if (!res.ok) throw new Error(`videos_http_${res.status}`);
  const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
  return json.items || [];
}

function mapVideoItem(
  v: Record<string, unknown>,
  fallbackChannel: string
): YoutubeLiveDiscoveryItem {
  const id = String(v.id || "");
  const snippet = (v.snippet || {}) as Record<string, unknown>;
  const status = (v.status || {}) as Record<string, unknown>;
  const live = (v.liveStreamingDetails || {}) as Record<string, unknown>;
  const thumbs = (snippet.thumbnails || {}) as Record<
    string,
    { url?: string }
  >;
  const region = (status.regionRestriction || null) as {
    allowed?: string[];
    blocked?: string[];
  } | null;

  const embeddable = status.embeddable === true;
  // YouTube status.publicStatsViewable is unrelated; syndication is often under status
  // For Data API, license/embed path: use status.embeddable + search videoSyndicated filter.
  // When details lack explicit syndicated flag, treat search filter success as syndicated=true
  // unless status says otherwise.
  const syndicated =
    status.embeddable === true &&
    (status.privacyStatus === "public" || !status.privacyStatus);

  let rejectReason: string | null = null;
  if (!embeddable) rejectReason = "not_embeddable";
  else if (status.privacyStatus && status.privacyStatus !== "public") {
    rejectReason = `privacy_${status.privacyStatus}`;
  }

  return {
    videoId: id,
    channelId: String(snippet.channelId || fallbackChannel),
    title: String(snippet.title || ""),
    description: String(snippet.description || ""),
    scheduledStart: live.scheduledStartTime
      ? String(live.scheduledStartTime)
      : null,
    actualStart: live.actualStartTime ? String(live.actualStartTime) : null,
    actualEnd: live.actualEndTime ? String(live.actualEndTime) : null,
    liveBroadcastContent: String(snippet.liveBroadcastContent || "none"),
    embeddable,
    syndicated,
    privacyStatus: String(status.privacyStatus || "unknown"),
    regionRestriction: region,
    concurrentViewers: live.concurrentViewers
      ? Number(live.concurrentViewers)
      : null,
    thumbnails: Object.fromEntries(
      Object.entries(thumbs)
        .map(([k, val]) => [k, val?.url || ""])
        .filter(([, u]) => Boolean(u))
    ),
    embedUrl: buildOfficialYoutubeEmbedUrl(id),
    rejectReason,
  };
}

/**
 * Discover live + upcoming videos for allowlisted official channels only.
 */
export async function discoverOfficialYoutubeLives(input?: {
  sources?: BroadcastSourceRecord[];
  maxPerChannel?: number;
  storefrontCountry?: string;
  fetchImpl?: FetchFn;
}): Promise<YoutubeLiveDiscoveryReport> {
  const sources = input?.sources || listActiveBroadcastSources();
  const channelIds = allowlistedYoutubeChannelIds(sources);
  const apiKey = getYoutubeApiKey();
  const apiKeyPresent = Boolean(apiKey);
  const notes: string[] = [];
  const rejectReasons: string[] = [];
  const fetchImpl = input?.fetchImpl || fetch;
  const storefront = (input?.storefrontCountry || "GB").toUpperCase();

  const empty = (
    extra: Partial<YoutubeLiveDiscoveryReport>
  ): YoutubeLiveDiscoveryReport => ({
    apiKeyPresent,
    allowlistedChannels: channelIds,
    searchedLive: 0,
    searchedUpcoming: 0,
    discovered: 0,
    embeddable: 0,
    syndicated: 0,
    live: 0,
    upcoming: 0,
    rejected: 0,
    rejectReasons: [],
    items: [],
    serverEligible: 0,
    liveInAppEligible: 0,
    notes,
    ...extra,
  });

  if (!channelIds.length) {
    notes.push("No allowlisted official channel IDs with usable approval.");
    return empty({ rejectReasons: ["no_allowlisted_channels"] });
  }

  if (!apiKeyPresent) {
    notes.push(
      "YOUTUBE_API_KEY / YOUTUBE_DATA_API_KEY absent — cannot discover live embeds."
    );
    return empty({ rejectReasons: ["youtube_api_key_absent"] });
  }

  const maxPerChannel = Math.min(input?.maxPerChannel || 5, 10);
  const items: YoutubeLiveDiscoveryItem[] = [];
  let rejected = 0;
  let searchedLive = 0;
  let searchedUpcoming = 0;

  const sourceByChannel = new Map(
    sources
      .filter((s) => s.officialChannelId)
      .map((s) => [s.officialChannelId!, s])
  );

  for (const channelId of channelIds) {
    try {
      const liveIds = await searchChannelEvent({
        apiKey,
        channelId,
        eventType: "live",
        maxResults: maxPerChannel,
        fetchImpl,
      });
      searchedLive += 1;
      const upcomingIds = await searchChannelEvent({
        apiKey,
        channelId,
        eventType: "upcoming",
        maxResults: maxPerChannel,
        fetchImpl,
      });
      searchedUpcoming += 1;

      const videoIds = [...new Set([...liveIds, ...upcomingIds])];
      const details = await fetchVideoDetails({
        apiKey,
        videoIds,
        fetchImpl,
      });

      for (const v of details) {
        const mapped = mapVideoItem(v, channelId);
        if (mapped.rejectReason) {
          rejected += 1;
          rejectReasons.push(`${mapped.rejectReason}:${mapped.videoId}`);
          continue;
        }
        if (
          !isStorefrontRegionAllowed(mapped.regionRestriction, storefront)
        ) {
          rejected += 1;
          rejectReasons.push(`geo_blocked:${mapped.videoId}`);
          mapped.rejectReason = "geo_blocked";
          continue;
        }
        items.push(mapped);
      }
    } catch (e) {
      rejected += 1;
      rejectReasons.push(
        e instanceof Error ? e.message : `channel_error_${channelId}`
      );
    }
  }

  let serverEligible = 0;
  let liveInAppEligible = 0;
  for (const item of items) {
    const src = sourceByChannel.get(item.channelId);
    const approvedEmbed =
      Boolean(src) &&
      canProduceLiveInApp(src!) &&
      src!.approvalStatus === "approved_embed";
    // For discovery reporting, also count metadata-approved channels as candidates
    // only when commercial + embedding flags would allow after promotion.
    const validation = validateYoutubeLiveCandidate({
      item,
      channelApprovedForEmbed: approvedEmbed,
      storefrontCountry: storefront,
    });
    if (validation.ok) {
      serverEligible += 1;
      liveInAppEligible += 1;
    } else if (
      src &&
      (src.approvalStatus === "approved_metadata_only" ||
        src.approvalStatus === "needs_review") &&
      item.embeddable &&
      item.liveBroadcastContent === "live"
    ) {
      // Track as discovered live but not playable until approved_embed + device probe
      notes.push(
        `live_seen_pending_embed_approval:${item.videoId}:${item.channelId}`
      );
    }
  }

  notes.push(
    "Do not extract HLS, proxy, or strip YouTube player branding/controls."
  );
  notes.push(
    "playable=true requires approved_embed + server validation + device probe."
  );

  return {
    apiKeyPresent: true,
    allowlistedChannels: channelIds,
    searchedLive,
    searchedUpcoming,
    discovered: items.length,
    embeddable: items.filter((i) => i.embeddable).length,
    syndicated: items.filter((i) => i.syndicated).length,
    live: items.filter((i) => i.liveBroadcastContent === "live").length,
    upcoming: items.filter((i) => i.liveBroadcastContent === "upcoming")
      .length,
    rejected,
    rejectReasons: rejectReasons.slice(0, 40),
    items,
    serverEligible,
    liveInAppEligible,
    notes: [...new Set(notes)].slice(0, 30),
  };
}
