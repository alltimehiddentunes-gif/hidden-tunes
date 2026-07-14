import { youtubeStarterRowsToCandidates } from "@/lib/tvYoutubeStarterBridge";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
} from "@/lib/tvExpansion25k/sources/types";

function candidateId(candidate: { source_id?: string | null; source_key?: string | null }) {
  return String(candidate.source_id || candidate.source_key || "").trim();
}

export const youtubeStarterAdapter: TvExpansionSourceAdapter = {
  id: "youtube-starter",
  label: "Hidden Tunes YouTube starter catalog",
  legalBasis:
    "Official YouTube video IDs from the Hidden Tunes starter catalog intended for public playback.",
  async discover(ctx) {
    const processedSet = new Set(ctx.cursor.processedFixedIds || []);
    const nextCursor = { ...ctx.cursor, source: "youtube-starter" };

    if (ctx.cursor.exhausted) {
      nextCursor.status = "exhausted";
      return {
        candidates: [],
        nextCursor,
        stats: { discovered: 0, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
      };
    }

    const discoveredAt = new Date().toISOString();
    const allCandidates = youtubeStarterRowsToCandidates()
      .map((candidate) =>
        attachLegalCandidateMeta(candidate, {
          provider: "youtube-starter",
          officialPage: candidate.source_url,
          officialStationId: candidate.source_id,
          language: candidate.language || null,
          category: candidate.category || null,
          legalBasis: "Official YouTube public video referenced by Hidden Tunes starter catalog.",
          discoveredAt,
        })
      )
      .filter((candidate) => !processedSet.has(candidateId(candidate)));

    const batch = allCandidates.slice(0, ctx.limit);
    const processedIds = batch.map((candidate) => candidateId(candidate)).filter(Boolean);
    nextCursor.processedFixedIds = [...processedSet, ...processedIds];
    nextCursor.processed += batch.length;
    nextCursor.exhausted = batch.length === 0;
    if (nextCursor.exhausted) {
      nextCursor.cursor = "done";
      nextCursor.status = "exhausted";
    }

    return {
      candidates: batch,
      nextCursor,
      stats: { discovered: batch.length, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
    };
  },
};

export const initialYoutubeStarterCursor = createInitialSourceCursor("youtube-starter");
