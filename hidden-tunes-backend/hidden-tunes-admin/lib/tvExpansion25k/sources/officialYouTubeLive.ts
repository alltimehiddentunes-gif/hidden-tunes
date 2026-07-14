import { mapTvCategories } from "@/lib/tvCategoryMapper";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
} from "@/lib/tvExpansion25k/sources/types";

type OfficialYouTubeLiveEntry = {
  videoId: string;
  title: string;
  channelName: string;
  country?: string;
  category?: string;
  officialPage?: string;
};

const OFFICIAL_YOUTUBE_LIVE: OfficialYouTubeLiveEntry[] = [
  { videoId: "YDvsBbKf-g0", title: "NASA TV Public", channelName: "NASA", country: "US", category: "Science", officialPage: "https://www.nasa.gov/nasa-live/" },
  { videoId: "21X5lGlwtXk", title: "DW English Live", channelName: "DW News", country: "DE", category: "News", officialPage: "https://www.dw.com/en/live-tv/" },
  { videoId: "jfKfPfyJRdk", title: "Lofi Girl", channelName: "Lofi Girl", country: "FR", category: "Music", officialPage: "https://www.youtube.com/@LofiGirl" },
  { videoId: "z7Vq4LBSdP0", title: "France 24 English", channelName: "France 24", country: "FR", category: "News", officialPage: "https://www.france24.com/en/live" },
  { videoId: "wM0g8EoUZ_E", title: "Al Jazeera English", channelName: "Al Jazeera English", country: "QA", category: "News", officialPage: "https://www.aljazeera.com/live/" },
  { videoId: "9Auq9mYxFEE", title: "Sky News", channelName: "Sky News", country: "GB", category: "News", officialPage: "https://news.sky.com/watch-live" },
  { videoId: "iEpJwuex6KE", title: "ABC News Live", channelName: "ABC News", country: "US", category: "News", officialPage: "https://abcnews.go.com/Live" },
];

export const officialYouTubeLiveAdapter: TvExpansionSourceAdapter = {
  id: "official-youtube-live",
  label: "Official YouTube live channels",
  legalBasis:
    "Official public YouTube live channels supported by the existing Hidden Tunes YouTube player path.",
  async discover(ctx) {
    const nextCursor = { ...ctx.cursor, source: "official-youtube-live" };
    if (ctx.cursor.exhausted) {
      return {
        candidates: [],
        nextCursor,
        stats: { discovered: 0, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
      };
    }

    const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
    const slice = OFFICIAL_YOUTUBE_LIVE.slice(offset, offset + ctx.limit);
    const discoveredAt = new Date().toISOString();
    const seen = new Set<string>();
    const candidates = [];

    for (const entry of slice) {
      if (seen.has(entry.videoId)) continue;
      seen.add(entry.videoId);

      const mapped = mapTvCategories({
        title: entry.title,
        seedCategory: entry.category || "News",
        country: entry.country || null,
      });

      candidates.push(
        attachLegalCandidateMeta(
          {
            source_type: "youtube_video",
            source_id: entry.videoId,
            source_url: `https://www.youtube.com/watch?v=${entry.videoId}`,
            embed_url: `https://www.youtube.com/embed/${entry.videoId}`,
            title: entry.title,
            channel_name: entry.channelName,
            category: mapped.primary,
            categories: mapped.all,
            country: entry.country || null,
            region: entry.country || null,
            tags: mapped.all,
            source_key: `official-youtube-live:${entry.videoId}`,
          },
          {
            provider: "official-youtube-live",
            officialPage: entry.officialPage || `https://www.youtube.com/watch?v=${entry.videoId}`,
            officialStationId: entry.videoId,
            country: entry.country || null,
            category: entry.category || mapped.primary,
            legalBasis: "Official public YouTube live channel supported by existing player.",
            discoveredAt,
          }
        )
      );
    }

    const nextOffset = offset + slice.length;
    nextCursor.cursor = String(nextOffset);
    nextCursor.page += 1;
    nextCursor.processed += slice.length;
    nextCursor.exhausted = nextOffset >= OFFICIAL_YOUTUBE_LIVE.length;
    nextCursor.lastError = null;

    return {
      candidates,
      nextCursor,
      stats: { discovered: candidates.length, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
    };
  },
};

export const initialOfficialYouTubeLiveCursor = createInitialSourceCursor("official-youtube-live");
