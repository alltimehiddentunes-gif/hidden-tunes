import { mapTvCategories } from "@/lib/tvCategoryMapper";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import { loadWithCache, paginateArray } from "@/lib/tvExpansion25k/sources/shared/paginatedCache";
import { retryFetchJson } from "@/lib/tvExpansion25k/sources/shared/retryFetch";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
  type TvExpansionSourceCursor,
} from "@/lib/tvExpansion25k/sources/types";

const PLUTO_CHANNELS_URL = "https://api.pluto.tv/v2/channels";

type PlutoChannel = {
  _id: string;
  slug?: string;
  name?: string;
  category?: string;
  summary?: string;
  thumbnail?: { path?: string };
  stitched?: {
    urls?: Array<{ type?: string; url?: string }>;
  };
};

type FlatPlutoEntry = {
  id: string;
  title: string;
  url: string;
  category: string | null;
  logo: string | null;
};

function flattenPlutoChannels(channels: PlutoChannel[]) {
  const entries: FlatPlutoEntry[] = [];
  const seen = new Set<string>();

  for (const channel of channels) {
    const hls = channel.stitched?.urls?.find((row) => row.type === "hls" && row.url);
    if (!hls?.url) continue;

    const urlCheck = validatePublicTvUrl(hls.url);
    if (!urlCheck.ok) continue;

    const id = channel._id || channel.slug || channel.name || "";
    const key = `${id}::${urlCheck.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      id,
      title: String(channel.name || channel.slug || id).trim(),
      url: urlCheck.url,
      category: channel.category || null,
      logo: channel.thumbnail?.path || null,
    });
  }

  return entries;
}

async function loadPlutoEntries() {
  return loadWithCache("pluto-tv-v2-channels", async () => {
    const channels = await retryFetchJson<PlutoChannel[]>(PLUTO_CHANNELS_URL);
    return flattenPlutoChannels(channels);
  });
}

export const plutoTvFastAdapter: TvExpansionSourceAdapter = {
  id: "pluto-tv-fast",
  label: "Pluto TV FAST catalog",
  legalBasis:
    "Pluto TV public FAST channel API exposing free ad-supported television streams from Paramount's Pluto TV service.",
  async discover(ctx) {
    const nextCursor: TvExpansionSourceCursor = { ...ctx.cursor, source: "pluto-tv-fast" };

    try {
      const entries = await loadPlutoEntries();
      const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
      const page = paginateArray(entries, offset, ctx.limit);
      const discoveredAt = new Date().toISOString();
      const candidates = [];

      for (const entry of page.slice) {
        const mapped = mapTvCategories({
          title: entry.title,
          seedCategory: entry.category || "Entertainment",
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
              country: "US",
              region: "US",
              tags: mapped.all,
              source_key: `pluto-tv-fast:${entry.id}`,
            },
            {
              provider: "pluto-tv-fast",
              officialPage: "https://pluto.tv/live-tv",
              officialStationId: entry.id,
              country: "US",
              category: entry.category || mapped.primary,
              legalBasis:
                "Free Pluto TV FAST channel stream from the official Pluto TV public channel API.",
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

export const initialPlutoTvFastCursor = createInitialSourceCursor("pluto-tv-fast");
