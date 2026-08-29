import { mapTvCategories } from "@/lib/tvCategoryMapper";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";

export const IPTV_ORG_CHANNELS_URL = "https://iptv-org.github.io/api/channels.json";
export const IPTV_ORG_STREAMS_URL = "https://iptv-org.github.io/api/streams.json";

export type IptvOrgChannel = {
  id: string;
  name: string;
  country?: string;
  categories?: string[];
  languages?: string[];
  logo?: string;
  is_nsfw?: boolean;
};

export type IptvOrgStream = {
  channel: string;
  url: string;
  timeshift?: string;
};

export type IptvOrgSnapshot = {
  channels: IptvOrgChannel[];
  streams: IptvOrgStream[];
};

let cachedSnapshot: Promise<IptvOrgSnapshot> | null = null;

export async function loadIptvOrgSnapshot(options: {
  fetchImpl?: typeof fetch;
  useCache?: boolean;
} = {}): Promise<IptvOrgSnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const useCache = options.useCache ?? fetchImpl === fetch;
  if (useCache && cachedSnapshot) return cachedSnapshot;

  const load = async () => {
    const [channelsResponse, streamsResponse] = await Promise.all([
      fetchImpl(IPTV_ORG_CHANNELS_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      }),
      fetchImpl(IPTV_ORG_STREAMS_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      }),
    ]);

    if (!channelsResponse.ok || !streamsResponse.ok) {
      throw new Error("Failed to load iptv-org channel or stream index.");
    }

    return {
      channels: (await channelsResponse.json()) as IptvOrgChannel[],
      streams: (await streamsResponse.json()) as IptvOrgStream[],
    };
  };

  const pending = load();
  if (useCache) cachedSnapshot = pending;
  try {
    return await pending;
  } catch (error) {
    if (useCache && cachedSnapshot === pending) cachedSnapshot = null;
    throw error;
  }
}

export function indexIptvOrgSnapshot(snapshot: IptvOrgSnapshot) {
  const channelById = new Map<string, IptvOrgChannel>();
  const streamsByChannelId = new Map<string, IptvOrgStream[]>();
  for (const channel of snapshot.channels) {
    if (!channel?.id || !channel?.name || channel.is_nsfw) continue;
    channelById.set(channel.id, channel);
  }
  for (const stream of snapshot.streams) {
    if (!stream?.channel || !stream?.url) continue;
    const current = streamsByChannelId.get(stream.channel) || [];
    current.push(stream);
    streamsByChannelId.set(stream.channel, current);
  }
  return { channelById, streamsByChannelId };
}

export async function fetchIptvOrgCandidates(
  limit = 400,
  options: { offset?: number } = {}
) {
  const snapshot = await loadIptvOrgSnapshot();
  const { channelById } = indexIptvOrgSnapshot(snapshot);
  const { streams } = snapshot;

  const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
  const candidates: TvGrowthCandidate[] = [];
  const seenUrls = new Set<string>();
  let streamCursor = 0;
  let scannedAfterOffset = 0;
  let lastScannedOffset = offset;

  for (const stream of streams) {
    if (candidates.length >= limit) break;
    if (streamCursor < offset) {
      streamCursor += 1;
      continue;
    }

    scannedAfterOffset += 1;
    lastScannedOffset = streamCursor + 1;
    streamCursor += 1;

    const channel = channelById.get(stream.channel);
    if (!channel) continue;

    const urlCheck = validatePublicTvUrl(stream.url);
    if (!urlCheck.ok) continue;

    const urlKey = urlCheck.url.toLowerCase();
    if (seenUrls.has(urlKey)) continue;
    seenUrls.add(urlKey);

    const mapped = mapTvCategories({
      title: channel.name,
      country: channel.country || null,
      iptvCategories: channel.categories || [],
      extraTags: channel.categories || [],
    });

    candidates.push({
      source_type: "hls_stream",
      source_id: `iptv-org-${channel.id}`,
      source_url: urlCheck.url,
      title: channel.name,
      channel_name: channel.name,
      thumbnail_url: channel.logo || null,
      description: null,
      category: mapped.primary,
      categories: mapped.all,
      genre: mapped.all.find((label) =>
        ["News", "Sports", "Movies", "Music TV", "Documentary"].includes(label)
      ) || null,
      country: channel.country || null,
      region: channel.country || null,
      language: channel.languages?.[0] || null,
      tags: mapped.all,
      source_key: `iptv-org:${channel.id}`,
    });
  }

  return {
    scannedStreams: streams.length,
    offset,
    scannedAfterOffset,
    nextOffset: lastScannedOffset >= streams.length ? 0 : lastScannedOffset,
    candidates,
  };
}
