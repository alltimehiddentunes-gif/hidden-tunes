import { mapTvCategories } from "@/lib/tvCategoryMapper";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";
import {
  attachLegalCandidateMeta,
  type TvExpansionSourceAdapter,
  type TvExpansionSourceCursor,
} from "@/lib/tvExpansion25k/sources/types";
import { paginateArray } from "@/lib/tvExpansion25k/sources/shared/paginatedCache";

export type FixedStreamEntry = {
  id: string;
  title: string;
  url: string;
  country?: string | null;
  language?: string | null;
  category?: string | null;
  website?: string | null;
  logo?: string | null;
  channelName?: string | null;
  legalBasis?: string | null;
};

export function createFixedStreamListAdapter(options: {
  id: string;
  label: string;
  legalBasis: string;
  entries: FixedStreamEntry[];
  sourceType?: "hls_stream" | "youtube_video";
}): TvExpansionSourceAdapter {
  return {
    id: options.id,
    label: options.label,
    legalBasis: options.legalBasis,
    async discover(ctx) {
      const nextCursor: TvExpansionSourceCursor = { ...ctx.cursor, source: options.id };
      const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
      const page = paginateArray(options.entries, offset, ctx.limit);
      const discoveredAt = new Date().toISOString();
      const candidates = [];

      for (const entry of page.slice) {
        const rawUrl = String(entry.url || "").trim();
        if (!rawUrl) continue;

        if (options.sourceType === "youtube_video") {
          const videoId = entry.id;
          const mapped = mapTvCategories({
            title: entry.title,
            seedCategory: entry.category || "General",
            country: entry.country || null,
          });
          candidates.push(
            attachLegalCandidateMeta(
              {
                source_type: "youtube_video",
                source_id: videoId,
                source_url: rawUrl,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                title: entry.title,
                channel_name: entry.channelName || entry.title,
                thumbnail_url: entry.logo || null,
                category: mapped.primary,
                categories: mapped.all,
                country: entry.country || null,
                region: entry.country || null,
                language: entry.language || null,
                tags: mapped.all,
                source_key: `${options.id}:${videoId}`,
              },
              {
                provider: options.id,
                officialPage: entry.website || rawUrl,
                officialStationId: videoId,
                country: entry.country || null,
                language: entry.language || null,
                category: entry.category || mapped.primary,
                legalBasis: entry.legalBasis || options.legalBasis,
                discoveredAt,
              }
            )
          );
          continue;
        }

        const urlCheck = validatePublicTvUrl(rawUrl);
        if (!urlCheck.ok) continue;

        const mapped = mapTvCategories({
          title: entry.title,
          seedCategory: entry.category || "General",
          country: entry.country || null,
        });

        candidates.push(
          attachLegalCandidateMeta(
            {
              source_type: "hls_stream",
              source_id: entry.id,
              source_url: urlCheck.url,
              title: entry.title,
              channel_name: entry.channelName || entry.title,
              thumbnail_url: entry.logo || null,
              category: mapped.primary,
              categories: mapped.all,
              country: entry.country || null,
              region: entry.country || null,
              language: entry.language || null,
              tags: mapped.all,
              source_key: `${options.id}:${entry.id}`,
            },
            {
              provider: options.id,
              officialPage: entry.website || null,
              officialStationId: entry.id,
              country: entry.country || null,
              language: entry.language || null,
              category: entry.category || mapped.primary,
              legalBasis: entry.legalBasis || options.legalBasis,
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
          preRejected: page.slice.length - candidates.length,
          fingerprintSkipped: 0,
          unsupported: 0,
        },
      };
    },
  };
}
