import { mapTvCategories } from "@/lib/tvCategoryMapper";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import { retryFetchJson } from "@/lib/tvExpansion25k/sources/shared/retryFetch";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
  type TvExpansionSourceCursor,
} from "@/lib/tvExpansion25k/sources/types";

const IPTV_ORG_CHANNELS_URL = "https://iptv-org.github.io/api/channels.json";
const IPTV_ORG_STREAMS_URL = "https://iptv-org.github.io/api/streams.json";

type IptvOrgChannel = {
  id: string;
  name: string;
  country?: string;
  categories?: string[];
  languages?: string[];
  logo?: string;
  website?: string;
  is_nsfw?: boolean;
};

type IptvOrgStream = {
  channel: string;
  url: string;
};

type CategoryIndex = {
  loadedAt: number;
  streamIndices: number[];
  streams: IptvOrgStream[];
  channelById: Map<string, IptvOrgChannel>;
};

const indexCache = new Map<string, CategoryIndex>();

function categoriesMatch(channelCategories: string[] | undefined, wanted: string[]) {
  const wantedSet = new Set(wanted.map((value) => value.toLowerCase()));
  return (channelCategories || []).some((category) => wantedSet.has(category.toLowerCase()));
}

async function loadCategoryIndex(categories: string[]) {
  const cacheKey = categories.slice().sort().join("|");
  const cached = indexCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < 30 * 60_000) return cached;

  const [channels, streams] = await Promise.all([
    retryFetchJson<IptvOrgChannel[]>(IPTV_ORG_CHANNELS_URL),
    retryFetchJson<IptvOrgStream[]>(IPTV_ORG_STREAMS_URL),
  ]);

  const channelById = new Map<string, IptvOrgChannel>();
  for (const channel of channels) {
    if (!channel?.id || !channel?.name || channel.is_nsfw) continue;
    channelById.set(channel.id, channel);
  }

  const streamIndices: number[] = [];
  for (let index = 0; index < streams.length; index += 1) {
    const channel = channelById.get(streams[index].channel);
    if (!channel) continue;
    if (!categoriesMatch(channel.categories, categories)) continue;
    streamIndices.push(index);
  }

  const built = {
    loadedAt: Date.now(),
    streamIndices,
    streams,
    channelById,
  };
  indexCache.set(cacheKey, built);
  return built;
}

export function createIptvOrgCategoryAdapter(options: {
  id: string;
  label: string;
  categories: string[];
  legalBasis: string;
}): TvExpansionSourceAdapter {
  return {
    id: options.id,
    label: options.label,
    legalBasis: options.legalBasis,
    async discover(ctx) {
      const nextCursor: TvExpansionSourceCursor = {
        ...ctx.cursor,
        source: options.id,
      };

      try {
        const index = await loadCategoryIndex(options.categories);
        const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
        const discoveredAt = new Date().toISOString();
        const candidates = [];
        let processed = 0;
        const seenUrls = new Set<string>();

        for (
          let position = offset;
          position < index.streamIndices.length && candidates.length < ctx.limit;
          position += 1
        ) {
          processed += 1;
          const stream = index.streams[index.streamIndices[position]];
          const channel = index.channelById.get(stream.channel);
          if (!channel) continue;

          const urlCheck = validatePublicTvUrl(stream.url);
          if (!urlCheck.ok) continue;

          const urlKey = urlCheck.url.toLowerCase();
          if (seenUrls.has(urlKey)) continue;
          seenUrls.add(urlKey);

          const mapped = mapTvCategories({
            title: channel.name,
            country: channel.country || null,
            iptvCategories: channel.categories || options.categories,
            extraTags: channel.categories || options.categories,
          });

          candidates.push(
            attachLegalCandidateMeta(
              {
                source_type: "hls_stream",
                source_id: `${options.id}-${channel.id}`,
                source_url: urlCheck.url,
                title: channel.name,
                channel_name: channel.name,
                thumbnail_url: channel.logo || null,
                description: null,
                category: mapped.primary,
                categories: mapped.all,
                country: channel.country || null,
                region: channel.country || null,
                language: channel.languages?.[0] || null,
                tags: mapped.all,
                source_key: `${options.id}:${channel.id}`,
              },
              {
                provider: options.id,
                officialPage: channel.website || "https://iptv-org.github.io/",
                officialStationId: channel.id,
                country: channel.country || null,
                language: channel.languages?.[0] || null,
                category: mapped.primary,
                legalBasis: options.legalBasis,
                discoveredAt,
              }
            )
          );
        }

        const nextOffset = offset + processed;
        nextCursor.cursor = String(nextOffset);
        nextCursor.page = ctx.cursor.page + 1;
        nextCursor.processed += processed;
        nextCursor.exhausted = nextOffset >= index.streamIndices.length;
        nextCursor.lastError = null;

        return {
          candidates,
          nextCursor,
          stats: {
            discovered: candidates.length,
            preRejected: 0,
            fingerprintSkipped: 0,
            unsupported: 0,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        nextCursor.lastError = message;
        return {
          candidates: [],
          nextCursor,
          stats: {
            discovered: 0,
            preRejected: 0,
            fingerprintSkipped: 0,
            unsupported: 0,
            error: message,
          },
        };
      }
    },
  };
}

export function createInitialCategoryCursor(sourceId: string) {
  return createInitialSourceCursor(sourceId);
}
