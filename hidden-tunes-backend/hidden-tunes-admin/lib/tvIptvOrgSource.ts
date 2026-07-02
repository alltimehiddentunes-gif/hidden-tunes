import { mapTvCategories } from "@/lib/tvCategoryMapper";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";

const IPTV_ORG_CHANNELS_URL = "https://iptv-org.github.io/api/channels.json";
const IPTV_ORG_STREAMS_URL = "https://iptv-org.github.io/api/streams.json";

type IptvOrgChannel = {
  id: string;
  name: string;
  country?: string;
  categories?: string[];
  languages?: string[];
  logo?: string;
  is_nsfw?: boolean;
};

type IptvOrgStream = {
  channel: string;
  url: string;
  timeshift?: string;
};

export async function fetchIptvOrgCandidates(limit = 400) {
  const [channelsResponse, streamsResponse] = await Promise.all([
    fetch(IPTV_ORG_CHANNELS_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }),
    fetch(IPTV_ORG_STREAMS_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }),
  ]);

  if (!channelsResponse.ok || !streamsResponse.ok) {
    throw new Error("Failed to load iptv-org channel or stream index.");
  }

  const channels = (await channelsResponse.json()) as IptvOrgChannel[];
  const streams = (await streamsResponse.json()) as IptvOrgStream[];

  const channelById = new Map<string, IptvOrgChannel>();
  for (const channel of channels) {
    if (!channel?.id || !channel?.name || channel.is_nsfw) continue;
    channelById.set(channel.id, channel);
  }

  const candidates: TvGrowthCandidate[] = [];
  const seenUrls = new Set<string>();

  for (const stream of streams) {
    if (candidates.length >= limit) break;

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
    candidates,
  };
}
