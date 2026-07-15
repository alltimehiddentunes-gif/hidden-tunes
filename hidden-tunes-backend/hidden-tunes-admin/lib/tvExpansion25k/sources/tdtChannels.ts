import { mapTvCategories } from "@/lib/tvCategoryMapper";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import { loadWithCache, paginateArray } from "@/lib/tvExpansion25k/sources/shared/paginatedCache";
import { parseM3uPlaylist } from "@/lib/tvExpansion25k/sources/shared/m3uParser";
import { retryFetchJson, retryFetchText } from "@/lib/tvExpansion25k/sources/shared/retryFetch";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
  type TvExpansionSourceCursor,
} from "@/lib/tvExpansion25k/sources/types";

const TDT_CHANNELS_JSON = "https://www.tdtchannels.com/lists/tv.json";
const TDT_CHANNELS_M3U8 = "https://www.tdtchannels.com/lists/tv.m3u8";

type TdtStreamOption = {
  format?: string;
  url?: string;
};

type TdtChannel = {
  name?: string;
  web?: string;
  logo?: string;
  epg_id?: string;
  options?: TdtStreamOption[];
  extra_info?: string[];
};

type TdtCountry = {
  name?: string;
  ambits?: Array<{ name?: string; channels?: TdtChannel[] }>;
};

type TdtCatalog = {
  license?: { source?: string; url?: string };
  countries?: TdtCountry[];
};

type FlatTdtEntry = {
  id: string;
  title: string;
  url: string;
  country: string | null;
  category: string | null;
  website: string | null;
  logo: string | null;
};

function countryCodeFromName(name: string | undefined) {
  const map: Record<string, string> = {
    Spain: "ES",
    International: "INT",
    Portugal: "PT",
    France: "FR",
    Germany: "DE",
    Italy: "IT",
    "United Kingdom": "GB",
    "United States": "US",
    Mexico: "MX",
    Argentina: "AR",
    Brazil: "BR",
    Chile: "CL",
    Colombia: "CO",
    Peru: "PE",
  };
  return name ? map[name] || name.slice(0, 2).toUpperCase() : null;
}

function flattenTdtCatalog(catalog: TdtCatalog) {
  const entries: FlatTdtEntry[] = [];
  const seen = new Set<string>();

  for (const country of catalog.countries || []) {
    const countryCode = countryCodeFromName(country.name);
    for (const ambit of country.ambits || []) {
      for (const channel of ambit.channels || []) {
        const title = String(channel.name || "").trim();
        if (!title) continue;

        const m3u8 = (channel.options || []).find(
          (option) => option.format === "m3u8" && String(option.url || "").trim()
        );
        if (!m3u8?.url) continue;

        const urlCheck = validatePublicTvUrl(m3u8.url);
        if (!urlCheck.ok) continue;

        const id = `${channel.epg_id || title}`.replace(/\s+/g, "-").toLowerCase();
        const dedupe = `${id}::${urlCheck.url.toLowerCase()}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);

        entries.push({
          id,
          title,
          url: urlCheck.url,
          country: countryCode,
          category: ambit.name || null,
          website: channel.web || "https://www.tdtchannels.com/",
          logo: channel.logo || null,
        });
      }
    }
  }

  return entries;
}

async function loadTdtEntries() {
  return loadWithCache("tdtchannels-all", async () => {
    const [catalog, m3uText] = await Promise.all([
      retryFetchJson<TdtCatalog>(TDT_CHANNELS_JSON),
      retryFetchText(TDT_CHANNELS_M3U8, {
        headers: { Accept: "application/vnd.apple.mpegurl,text/plain" },
      }),
    ]);

    const entries = flattenTdtCatalog(catalog);
    const seen = new Set(entries.map((entry) => `${entry.id}::${entry.url.toLowerCase()}`));

    for (const row of parseM3uPlaylist(m3uText)) {
      const urlCheck = validatePublicTvUrl(row.url);
      if (!urlCheck.ok) continue;
      const id = `${row.tvgId || row.title}`.replace(/\s+/g, "-").toLowerCase();
      const dedupe = `${id}::${urlCheck.url.toLowerCase()}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      entries.push({
        id,
        title: row.title,
        url: urlCheck.url,
        country: row.tvgCountry || null,
        category: row.groupTitle || null,
        website: "https://www.tdtchannels.com/",
        logo: row.logo || null,
      });
    }

    return entries;
  });
}

export const tdtChannelsAdapter: TvExpansionSourceAdapter = {
  id: "tdtchannels",
  label: "TDTChannels official directory",
  legalBasis:
    "TDTChannels collaborative directory linking only to official free-to-air broadcaster streams (LaQuay/TDTChannels).",
  async discover(ctx) {
    const nextCursor: TvExpansionSourceCursor = { ...ctx.cursor, source: "tdtchannels" };

    try {
      const entries = await loadTdtEntries();
      const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
      const page = paginateArray(entries, offset, ctx.limit);
      const discoveredAt = new Date().toISOString();
      const candidates = [];

      for (const entry of page.slice) {
        const mapped = mapTvCategories({
          title: entry.title,
          seedCategory: entry.category || "General",
          country: entry.country,
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
              source_key: `tdtchannels:${entry.id}`,
            },
            {
              provider: "tdtchannels",
              officialPage: entry.website,
              officialStationId: entry.id,
              country: entry.country,
              category: entry.category || mapped.primary,
              legalBasis:
                "Official stream URL indexed by TDTChannels from the broadcaster's public distribution.",
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

export const initialTdtChannelsCursor = createInitialSourceCursor("tdtchannels");
