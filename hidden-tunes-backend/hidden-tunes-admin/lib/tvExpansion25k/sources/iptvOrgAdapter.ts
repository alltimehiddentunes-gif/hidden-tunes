import { fetchIptvOrgCandidates } from "@/lib/tvIptvOrgSource";
import { TV_EXPANSION_IPTV_SCAN_MULTIPLIER } from "@/lib/tvExpansion25k/constants";
import {
  attachLegalCandidateMeta,
  createInitialSourceCursor,
  type TvExpansionSourceAdapter,
} from "@/lib/tvExpansion25k/sources/types";

export const iptvOrgAdapter: TvExpansionSourceAdapter = {
  id: "iptv-org",
  label: "iptv-org public directory",
  legalBasis:
    "Public iptv-org channel and stream directory of officially referenced broadcast streams.",
  async discover(ctx) {
    const nextCursor = { ...ctx.cursor, source: "iptv-org" };
    try {
      const offset = Math.max(0, Number(ctx.cursor.cursor || 0));
      const scanLimit = Math.max(ctx.limit, ctx.limit * TV_EXPANSION_IPTV_SCAN_MULTIPLIER);
      const batch = await fetchIptvOrgCandidates(scanLimit, { offset });
      const discoveredAt = new Date().toISOString();

      const candidates = batch.candidates.map((candidate) =>
        attachLegalCandidateMeta(candidate, {
          provider: "iptv-org",
          officialPage: "https://iptv-org.github.io/",
          officialStationId: candidate.source_id,
          country: candidate.country || candidate.region || null,
          language: candidate.language || null,
          category: candidate.category || null,
          legalBasis:
            "Public iptv-org directory stream entry linked to an identified broadcaster channel.",
          discoveredAt,
        })
      );

      if (batch.nextOffset === 0) {
        nextCursor.exhausted = true;
        nextCursor.cursor = "0";
      } else {
        nextCursor.cursor = String(batch.nextOffset);
        nextCursor.exhausted = false;
      }

      nextCursor.page += 1;
      nextCursor.processed += batch.scannedAfterOffset;
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

export const initialIptvOrgCursor = createInitialSourceCursor("iptv-org");
