import { curatedHlsSeedsToCandidates } from "@/lib/tvCuratedSeedBridge";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
} from "@/lib/tvExpansion25k/sources/types";

export const curatedSeedsAdapter: TvExpansionSourceAdapter = {
  id: "curated-seeds",
  label: "Hidden Tunes curated HLS seeds",
  legalBasis: "Hidden Tunes curated public HLS seed catalog for verified broadcaster streams.",
  async discover(ctx) {
    const nextCursor = { ...ctx.cursor, source: "curated-seeds" };
    if (ctx.cursor.exhausted || ctx.cursor.processed > 0) {
      nextCursor.exhausted = true;
      return {
        candidates: [],
        nextCursor,
        stats: { discovered: 0, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
      };
    }

    const discoveredAt = new Date().toISOString();
    const candidates = curatedHlsSeedsToCandidates().map((candidate) =>
      attachLegalCandidateMeta(candidate, {
        provider: "curated-seeds",
        officialStationId: candidate.source_id,
        country: candidate.country || candidate.region || null,
        language: candidate.language || null,
        category: candidate.category || null,
        legalBasis: "Hidden Tunes curated legal HLS seed entry.",
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

export const initialCuratedSeedsCursor = createInitialSourceCursor("curated-seeds");
