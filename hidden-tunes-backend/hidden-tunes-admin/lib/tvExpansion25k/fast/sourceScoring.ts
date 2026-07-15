import type { TvExpansion25kSourceState } from "@/lib/tvExpansion25k/checkpoint";
import type { TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";
import { getWave4SourceWeight } from "@/lib/tvExpansion25k/wave4/scheduler";
import { getSourceYield } from "@/lib/tvExpansion25k/fast/sourceYieldMemory";
import type { TvSourceDiscoveryDetail } from "@/lib/tvExpansion25k/sourceDiscovery";

export type SourceScoreInput = {
  adapter: TvExpansionSourceAdapter;
  cursor: TvExpansion25kSourceState["adapterCursors"][string] | undefined;
  lastDetail?: TvSourceDiscoveryDetail;
  baseWeight: number;
};

export type SourceScore = {
  sourceId: string;
  score: number;
  skip: boolean;
  reason: string;
};

function inventoryRemaining(cursor: SourceScoreInput["cursor"]) {
  if (!cursor) return 1000;
  if (cursor.exhausted || cursor.status === "exhausted") return 0;
  const processed = Number(cursor.processed || cursor.cursor || 0);
  return Math.max(0, 10_000 - processed);
}

export function scoreSource(input: SourceScoreInput): SourceScore {
  const { adapter, cursor, lastDetail, baseWeight } = input;
  if (!cursor || cursor.exhausted || cursor.status === "exhausted") {
    return { sourceId: adapter.id, score: 0, skip: true, reason: "exhausted" };
  }
  if (cursor.status === "disabled_for_safety") {
    return { sourceId: adapter.id, score: 0, skip: true, reason: "disabled_for_safety" };
  }
  if (cursor.status === "rate_limited") {
    return { sourceId: adapter.id, score: baseWeight * 0.1, skip: false, reason: "rate_limited_backoff" };
  }

  let score = baseWeight;
  const remaining = inventoryRemaining(cursor);
  score += Math.min(20, remaining / 500);

  if (lastDetail) {
    const discovered = lastDetail.discovered || 0;
    const dupes = (lastDetail.fingerprintSkipped || 0) + (lastDetail.preRejected || 0);
    if (discovered > 0) {
      const uniqueRate = Math.max(0, (discovered - dupes) / discovered);
      score += uniqueRate * 15;
      if (uniqueRate < 0.05) score *= 0.25;
    } else if (lastDetail.error === "exhausted") {
      return { sourceId: adapter.id, score: 0, skip: true, reason: "exhausted_detail" };
    } else if (discovered === 0) {
      score *= 0.5;
    }
    if (lastDetail.error && lastDetail.error !== "deferred_no_allocation") {
      score *= 0.6;
    }
  }

  const yieldStats = getSourceYield(adapter.id);
  if (yieldStats) {
    if (yieldStats.verificationAttempted >= 10) {
      score *= Math.max(0.05, yieldStats.passRate);
      if (yieldStats.passRate < 0.02) {
        score *= 0.15;
      } else if (yieldStats.passRate >= 0.2) {
        score += 12;
      }
      if (yieldStats.terminalFailureRate > 0.95) {
        score *= 0.2;
      }
    }
  }

  // Deprioritize low-provenance community playlists until they show verified yield.
  if (adapter.id.includes("community") && (!yieldStats || yieldStats.passRate < 0.05)) {
    score *= 0.35;
  }

  return { sourceId: adapter.id, score, skip: score <= 0, reason: "active" };
}

export function rankSourcesForParallelRun(
  adapters: TvExpansionSourceAdapter[],
  sourceState: TvExpansion25kSourceState,
  lastSources: Record<string, TvSourceDiscoveryDetail> | undefined
) {
  const scored = adapters.map((adapter) =>
    scoreSource({
      adapter,
      cursor: sourceState.adapterCursors[adapter.id],
      lastDetail: lastSources?.[adapter.id],
      baseWeight: getWave4SourceWeight(adapter.id),
    })
  );

  return scored
    .filter((row) => !row.skip && row.score > 0)
    .sort((a, b) => b.score - a.score);
}
