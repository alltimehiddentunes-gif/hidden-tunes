import { youtubeStarterRowsToCandidates } from "@/lib/tvYoutubeStarterBridge";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
} from "@/lib/tvExpansion25k/sources/types";

export const youtubeStarterAdapter: TvExpansionSourceAdapter = {
  id: "youtube-starter",
  label: "Hidden Tunes YouTube starter catalog",
  legalBasis:
    "Official YouTube video IDs from the Hidden Tunes starter catalog intended for public playback.",
  async discover(ctx) {
    const nextCursor = { ...ctx.cursor, source: "youtube-starter" };
    if (ctx.cursor.exhausted) {
      return {
        candidates: [],
        nextCursor,
        stats: { discovered: 0, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
      };
    }

    const discoveredAt = new Date().toISOString();
    const candidates = youtubeStarterRowsToCandidates().map((candidate) =>
      attachLegalCandidateMeta(candidate, {
        provider: "youtube-starter",
        officialPage: candidate.source_url,
        officialStationId: candidate.source_id,
        language: candidate.language || null,
        category: candidate.category || null,
        legalBasis: "Official YouTube public video referenced by Hidden Tunes starter catalog.",
        discoveredAt,
      })
    );

    nextCursor.exhausted = true;
    nextCursor.cursor = "done";
    nextCursor.processed += candidates.length;

    return {
      candidates,
      nextCursor,
      stats: { discovered: candidates.length, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
    };
  },
};

export const initialYoutubeStarterCursor = createInitialSourceCursor("youtube-starter");
