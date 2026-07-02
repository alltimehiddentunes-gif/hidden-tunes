import { curatedHlsSeedsToCandidates } from "@/lib/tvCuratedSeedBridge";
import { fetchIptvOrgCandidates } from "@/lib/tvIptvOrgSource";
import {
  dedupeTvGrowthCandidates,
  TV_GROWTH_TARGET_STATIONS,
  type TvGrowthCandidate,
} from "@/lib/tvStationHealth";
import { youtubeStarterRowsToCandidates } from "@/lib/tvYoutubeStarterBridge";

export type TvCandidatePoolReport = {
  curatedHls: number;
  youtubeStarter: number;
  iptvOrgScanned: number;
  iptvOrgCandidates: number;
  mergedUnique: number;
  target: number;
};

export async function buildTvCandidatePool(options?: {
  iptvLimit?: number;
  existing?: {
    sourceKeys: Set<string>;
    urlKeys: Set<string>;
    titleCountryKeys: Set<string>;
  };
}) {
  const curated = curatedHlsSeedsToCandidates();
  const youtube = youtubeStarterRowsToCandidates();

  const iptvLimit = options?.iptvLimit ?? 500;
  const iptv = await fetchIptvOrgCandidates(iptvLimit);

  const existing = options?.existing || {
    sourceKeys: new Set<string>(),
    urlKeys: new Set<string>(),
    titleCountryKeys: new Set<string>(),
  };

  const merged = dedupeTvGrowthCandidates(
    [...curated, ...youtube, ...iptv.candidates],
    existing
  );

  return {
    candidates: merged,
    report: {
      curatedHls: curated.length,
      youtubeStarter: youtube.length,
      iptvOrgScanned: iptv.scannedStreams,
      iptvOrgCandidates: iptv.candidates.length,
      mergedUnique: merged.length,
      target: TV_GROWTH_TARGET_STATIONS,
    } satisfies TvCandidatePoolReport,
  };
}

export function prioritizeTvCandidates(candidates: TvGrowthCandidate[], limit: number) {
  const curated = candidates.filter((row) => row.source_key?.startsWith("curated:"));
  const youtube = candidates.filter((row) => row.source_type === "youtube_video");
  const iptv = candidates.filter((row) => row.source_key?.startsWith("iptv-org:"));

  const ordered = [...curated, ...youtube, ...iptv];
  return ordered.slice(0, limit);
}
