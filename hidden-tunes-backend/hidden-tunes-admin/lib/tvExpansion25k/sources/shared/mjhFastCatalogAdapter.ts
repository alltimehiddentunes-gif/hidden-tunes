import { mapTvCategories } from "@/lib/tvCategoryMapper";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import { fetchGzJson } from "@/lib/tvExpansion25k/sources/shared/gzJsonFetch";
import { loadWithCache, paginateArray } from "@/lib/tvExpansion25k/sources/shared/paginatedCache";
import {
  attachLegalCandidateMeta,
  type TvExpansionSourceAdapter,
  type TvExpansionSourceCursor,
} from "@/lib/tvExpansion25k/sources/types";

export type MjhFlatChannel = {
  id: string;
  title: string;
  url: string;
  logo?: string | null;
  category?: string | null;
  country?: string | null;
  website?: string | null;
};

type MjhRegionChannel = {
  name?: string;
  logo?: string;
  group?: string;
  groups?: string[];
  chno?: number;
  license_url?: string;
  description?: string;
};

type MjhCatalog = {
  slug?: string;
  regions?: Record<string, { name?: string; channels?: Record<string, MjhRegionChannel> }>;
  channels?: Record<string, MjhRegionChannel>;
};

function regionCountryCode(regionKey: string, regionName?: string) {
  const map: Record<string, string> = {
    us: "US",
    ca: "CA",
    gb: "GB",
    uk: "GB",
    au: "AU",
    de: "DE",
    es: "ES",
    fr: "FR",
    it: "IT",
    br: "BR",
    mx: "MX",
    all: "INT",
  };
  const key = regionKey.toLowerCase();
  if (map[key]) return map[key];
  if (regionName && regionName.length >= 2) return regionName.slice(0, 2).toUpperCase();
  return key.slice(0, 2).toUpperCase();
}

function flattenMjhCatalog(
  catalog: MjhCatalog,
  options: {
    streamUrlForId: (
      channelId: string,
      catalog: MjhCatalog,
      regionKey: string | null
    ) => string;
    skipChannel?: (channel: MjhRegionChannel, channelId: string, regionKey: string | null) => boolean;
    defaultWebsite: string;
  }
) {
  const entries: MjhFlatChannel[] = [];
  const seen = new Set<string>();

  const pushChannel = (
    channelId: string,
    channel: MjhRegionChannel,
    regionKey: string | null,
    regionName?: string
  ) => {
    if (options.skipChannel?.(channel, channelId, regionKey)) return;

    const title = String(channel.name || channelId).trim();
    if (!title) return;

    const streamUrl = options.streamUrlForId(channelId, catalog, regionKey);
    const urlCheck = validatePublicTvUrl(streamUrl);
    if (!urlCheck.ok) return;

    const dedupe = `${channelId}::${urlCheck.url.toLowerCase()}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);

    const category = channel.group || channel.groups?.[0] || null;
    entries.push({
      id: regionKey ? `${regionKey}-${channelId}` : channelId,
      title,
      url: urlCheck.url,
      logo: channel.logo || null,
      category,
      country: regionKey ? regionCountryCode(regionKey, regionName) : null,
      website: options.defaultWebsite,
    });
  };

  if (catalog.regions) {
    for (const [regionKey, region] of Object.entries(catalog.regions)) {
      for (const [channelId, channel] of Object.entries(region.channels || {})) {
        pushChannel(channelId, channel, regionKey, region.name);
      }
    }
  } else if (catalog.channels) {
    for (const [channelId, channel] of Object.entries(catalog.channels)) {
      pushChannel(channelId, channel, null);
    }
  }

  return entries;
}

export function createMjhFastCatalogAdapter(options: {
  id: string;
  label: string;
  legalBasis: string;
  catalogUrl: string;
  cacheKey: string;
  defaultWebsite: string;
  streamUrlForId: (
    channelId: string,
    catalog: MjhCatalog,
    regionKey: string | null
  ) => string;
  skipChannel?: (channel: MjhRegionChannel, channelId: string, regionKey: string | null) => boolean;
}): TvExpansionSourceAdapter {
  async function loadEntries() {
    return loadWithCache(options.cacheKey, async () => {
      const catalog = await fetchGzJson<MjhCatalog>(options.catalogUrl);
      return flattenMjhCatalog(catalog, {
        streamUrlForId: options.streamUrlForId,
        skipChannel: options.skipChannel,
        defaultWebsite: options.defaultWebsite,
      });
    });
  }

  return {
    id: options.id,
    label: options.label,
    legalBasis: options.legalBasis,
    async discover(ctx) {
      const nextCursor: TvExpansionSourceCursor = { ...ctx.cursor, source: options.id };

      try {
        const entries = await loadEntries();
        const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
        const page = paginateArray(entries, offset, ctx.limit);
        const discoveredAt = new Date().toISOString();
        const candidates = [];

        for (const entry of page.slice) {
          const mapped = mapTvCategories({
            title: entry.title,
            seedCategory: entry.category || "Entertainment",
            country: entry.country,
            extraTags: entry.category ? [entry.category] : [],
          });

          candidates.push(
            attachLegalCandidateMeta(
              {
                source_type: "hls_stream",
                source_id: entry.id,
                source_url: entry.url,
                title: entry.title,
                channel_name: entry.title,
                thumbnail_url: entry.logo,
                category: mapped.primary,
                categories: mapped.all,
                country: entry.country,
                region: entry.country,
                tags: mapped.all,
                source_key: `${options.id}:${entry.id}`,
              },
              {
                provider: options.id,
                officialPage: entry.website || options.defaultWebsite,
                officialStationId: entry.id,
                country: entry.country,
                category: entry.category || mapped.primary,
                legalBasis: options.legalBasis,
                discoveredAt,
              }
            )
          );
        }

        nextCursor.cursor = String(page.nextOffset);
        nextCursor.page += 1;
        nextCursor.processed += page.slice.length;
        nextCursor.exhausted = page.exhausted;
        nextCursor.status = page.exhausted ? "exhausted" : "active";
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
        nextCursor.status = "temporarily_failed";
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
