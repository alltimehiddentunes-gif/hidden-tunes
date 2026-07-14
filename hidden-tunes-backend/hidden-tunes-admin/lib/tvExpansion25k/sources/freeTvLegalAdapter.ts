import { mapTvCategories } from "@/lib/tvCategoryMapper";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import { parseM3uPlaylist, sliceM3uEntries } from "@/lib/tvExpansion25k/sources/shared/m3uParser";
import { retryFetchText } from "@/lib/tvExpansion25k/sources/shared/retryFetch";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
} from "@/lib/tvExpansion25k/sources/types";

const FREE_TV_PLAYLIST_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

let cachedEntries: ReturnType<typeof parseM3uPlaylist> | null = null;

async function loadFreeTvEntries() {
  if (cachedEntries) return cachedEntries;
  const text = await retryFetchText(FREE_TV_PLAYLIST_URL, {
    headers: { Accept: "application/vnd.apple.mpegurl,text/plain" },
  });
  cachedEntries = parseM3uPlaylist(text).filter((entry) => Boolean(entry.url));
  return cachedEntries;
}

export const freeTvLegalAdapter: TvExpansionSourceAdapter = {
  id: "free-tv-legal",
  label: "Free-TV legal-only playlist",
  legalBasis:
    "Free-TV/IPTV curated playlist containing only officially free-to-air and legally distributable channels.",
  async discover(ctx) {
    const nextCursor = { ...ctx.cursor, source: "free-tv-legal" };

    try {
      const entries = await loadFreeTvEntries();
      const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
      const { slice, nextOffset, exhausted } = sliceM3uEntries(entries, offset, ctx.limit);
      const discoveredAt = new Date().toISOString();
      const candidates = [];

      for (const entry of slice) {
        const urlCheck = validatePublicTvUrl(entry.url);
        if (!urlCheck.ok) continue;

        const mapped = mapTvCategories({
          title: entry.title,
          seedCategory: entry.groupTitle || null,
          country: entry.tvgCountry || null,
        });

        candidates.push(
          attachLegalCandidateMeta(
            {
              source_type: "hls_stream",
              source_id: `free-tv-${entry.tvgId || entry.title}`,
              source_url: urlCheck.url,
              title: entry.title,
              channel_name: entry.tvgName || entry.title,
              thumbnail_url: entry.logo || null,
              category: mapped.primary,
              categories: mapped.all,
              country: entry.tvgCountry || null,
              region: entry.tvgCountry || null,
              language: entry.tvgLanguage || null,
              tags: mapped.all,
              source_key: `free-tv:${entry.tvgId || entry.title}`,
            },
            {
              provider: "free-tv-legal",
              officialPage: FREE_TV_PLAYLIST_URL,
              officialStationId: entry.tvgId || entry.title,
              country: entry.tvgCountry || null,
              language: entry.tvgLanguage || null,
              category: entry.groupTitle || mapped.primary,
              legalBasis:
                "Free-TV/IPTV legal-only curated playlist entry intended for public redistribution.",
              discoveredAt,
            }
          )
        );
      }

      nextCursor.cursor = String(nextOffset);
      nextCursor.page += 1;
      nextCursor.processed += slice.length;
      nextCursor.exhausted = exhausted;
      nextCursor.lastError = null;

      return {
        candidates,
        nextCursor,
        stats: {
          discovered: candidates.length,
          preRejected: slice.length - candidates.length,
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

export const initialFreeTvLegalCursor = createInitialSourceCursor("free-tv-legal");
