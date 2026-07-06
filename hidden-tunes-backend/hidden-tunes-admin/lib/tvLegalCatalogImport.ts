import { fetchIptvOrgCandidates } from "@/lib/tvIptvOrgSource";
import {
  TV_GROWTH_TARGET_STATIONS,
  getTvHealthSummary,
  importVerifiedTvGrowthCandidates,
} from "@/lib/tvStationHealth";

export type TvLegalCatalogImportOptions = {
  batchSize?: number;
  offset?: number;
};

export async function importTvLegalCatalogBatch(
  options: TvLegalCatalogImportOptions = {}
) {
  const batchSize = Math.max(1, Math.min(25, Math.floor(Number(options.batchSize || 15))));
  const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
  const summaryBefore = await getTvHealthSummary();

  if (summaryBefore.publicVerified >= TV_GROWTH_TARGET_STATIONS) {
    return {
      source: "iptv-org",
      target: TV_GROWTH_TARGET_STATIONS,
      targetReached: true,
      offset,
      nextOffset: offset,
      scannedStreams: 0,
      scannedAfterOffset: 0,
      candidates: 0,
      importResult: { found: 0, unique: 0, imported: 0, rejected: 0 },
      summaryBefore,
      summaryAfter: summaryBefore,
    };
  }

  const sourceBatch = await fetchIptvOrgCandidates(batchSize, { offset });
  const importResult = await importVerifiedTvGrowthCandidates(sourceBatch.candidates);
  const summaryAfter = await getTvHealthSummary();

  return {
    source: "iptv-org",
    target: TV_GROWTH_TARGET_STATIONS,
    targetReached: summaryAfter.publicVerified >= TV_GROWTH_TARGET_STATIONS,
    offset,
    nextOffset: sourceBatch.nextOffset,
    scannedStreams: sourceBatch.scannedStreams,
    scannedAfterOffset: sourceBatch.scannedAfterOffset,
    candidates: sourceBatch.candidates.length,
    importResult,
    summaryBefore,
    summaryAfter,
  };
}
