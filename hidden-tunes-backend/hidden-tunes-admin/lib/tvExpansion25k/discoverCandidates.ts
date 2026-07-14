import { curatedHlsSeedsToCandidates } from "@/lib/tvCuratedSeedBridge";
import { fetchIptvOrgCandidates } from "@/lib/tvIptvOrgSource";
import { youtubeStarterRowsToCandidates } from "@/lib/tvYoutubeStarterBridge";
import { TV_EXPANSION_IPTV_SCAN_MULTIPLIER } from "@/lib/tvExpansion25k/constants";
import type { TvExpansion25kSourceState } from "@/lib/tvExpansion25k/checkpoint";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";

export type TvDiscoveryResult = {
  candidates: TvGrowthCandidate[];
  sources: Record<string, { discovered: number; error?: string }>;
  nextSourceState: TvExpansion25kSourceState;
};

export async function discoverTvExpansionCandidates(
  sourceState: TvExpansion25kSourceState,
  batchSize: number
): Promise<TvDiscoveryResult> {
  const candidates: TvGrowthCandidate[] = [];
  const sources: TvDiscoveryResult["sources"] = {};
  const nextSourceState: TvExpansion25kSourceState = {
    ...sourceState,
    lastErrors: { ...sourceState.lastErrors },
  };

  if (!sourceState.iptvOrgExhausted) {
    try {
      const scanLimit = Math.max(batchSize, batchSize * TV_EXPANSION_IPTV_SCAN_MULTIPLIER);
      const iptv = await fetchIptvOrgCandidates(scanLimit, {
        offset: sourceState.iptvOrgOffset,
      });
      candidates.push(...iptv.candidates);
      sources.iptvOrg = { discovered: iptv.candidates.length };

      if (iptv.nextOffset === 0) {
        nextSourceState.iptvOrgExhausted = true;
        nextSourceState.iptvOrgOffset = 0;
      } else {
        nextSourceState.iptvOrgOffset = iptv.nextOffset;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      nextSourceState.lastErrors.iptvOrg = message;
      sources.iptvOrg = { discovered: 0, error: message };
    }
  } else {
    sources.iptvOrg = { discovered: 0, error: "exhausted" };
  }

  if (!sourceState.curatedSeedsAttempted) {
    try {
      const curated = curatedHlsSeedsToCandidates();
      candidates.push(...curated);
      sources.curatedSeeds = { discovered: curated.length };
      nextSourceState.curatedSeedsAttempted = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      nextSourceState.lastErrors.curatedSeeds = message;
      sources.curatedSeeds = { discovered: 0, error: message };
      nextSourceState.curatedSeedsAttempted = true;
    }
  }

  if (!sourceState.youtubeStarterAttempted) {
    try {
      const youtube = youtubeStarterRowsToCandidates();
      candidates.push(...youtube);
      sources.youtubeStarter = { discovered: youtube.length };
      nextSourceState.youtubeStarterAttempted = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      nextSourceState.lastErrors.youtubeStarter = message;
      sources.youtubeStarter = { discovered: 0, error: message };
      nextSourceState.youtubeStarterAttempted = true;
    }
  }

  return { candidates, sources, nextSourceState };
}

export function allTvExpansionSourcesExhausted(sourceState: TvExpansion25kSourceState) {
  return (
    sourceState.iptvOrgExhausted &&
    sourceState.curatedSeedsAttempted &&
    sourceState.youtubeStarterAttempted
  );
}
