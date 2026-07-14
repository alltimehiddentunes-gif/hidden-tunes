import { curatedHlsSeedsToCandidates } from "@/lib/tvCuratedSeedBridge";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
} from "@/lib/tvExpansion25k/sources/types";

function candidateId(candidate: { source_id?: string | null; source_key?: string | null }) {
  return String(candidate.source_id || candidate.source_key || "").trim();
}

export const curatedSeedsAdapter: TvExpansionSourceAdapter = {
  id: "curated-seeds",
  label: "Hidden Tunes curated HLS seeds",
  legalBasis: "Hidden Tunes curated public HLS seed catalog for verified broadcaster streams.",
  async discover(ctx) {
    const processedSet = new Set(ctx.cursor.processedFixedIds || []);
    const nextCursor = { ...ctx.cursor, source: "curated-seeds" };

    if (ctx.cursor.exhausted) {
      nextCursor.status = "exhausted";
      return {
        candidates: [],
        nextCursor,
        stats: { discovered: 0, preRejected: 0, fingerprintSkipped: 0, unsupported: 0 },
      };
    }

    const discoveredAt = new Date().toISOString();
    const allCandidates = curatedHlsSeedsToCandidates()
      .map((candidate) =>
        attachLegalCandidateMeta(candidate, {
          provider: "curated-seeds",
          officialStationId: candidate.source_id,
          country: candidate.country || candidate.region || null,
          language: candidate.language || null,
          category: candidate.category || null,
          legalBasis: "Hidden Tunes curated legal HLS seed entry.",
          discoveredAt,
        })
      )
      .filter((candidate) => !processedSet.has(candidateId(candidate)));

    const batch = allCandidates.slice(0, ctx.limit);
    const processedIds = batch.map((candidate) => candidateId(candidate)).filter(Boolean);
    nextCursor.processedFixedIds = [...processedSet, ...processedIds];
    nextCursor.processed += batch.length;
    const totalSeeds = curatedHlsSeedsToCandidates().length;
    nextCursor.exhausted = batch.length === 0 || nextCursor.processedFixedIds.length >= totalSeeds;
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

export const initialCuratedSeedsCursor = createInitialSourceCursor("curated-seeds");
