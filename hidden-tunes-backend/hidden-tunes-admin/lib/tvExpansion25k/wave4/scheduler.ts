import {
  listActiveWeightedSourceIds,
  TV_SOURCE_WAVE4_WEIGHTS,
  allocateSourceLimits,
  orderSourcesForBatch,
} from "@/lib/tvExpansion25k/sourceScheduler";
import type { TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";

export function getWave4SourceWeight(adapterId: string) {
  return TV_SOURCE_WAVE4_WEIGHTS[adapterId] ?? 0;
}

export function orderWave4SourcesForBatch(adapters: TvExpansionSourceAdapter[], batchNumber: number) {
  return orderSourcesForBatch(
    adapters,
    batchNumber,
    process.cwd() // wave 4 weights are fixed in TV_SOURCE_WAVE4_WEIGHTS
  );
}

export function allocateWave4SourceLimits(batchSize: number, adapterIds: string[]) {
  const weights = adapterIds.map((id) => ({ id, weight: getWave4SourceWeight(id) }));
  const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0) || 1;
  const allocation = new Map<string, number>();
  let assigned = 0;

  for (const row of weights) {
    if (row.weight <= 0) {
      allocation.set(row.id, 0);
      continue;
    }
    const share = Math.max(1, Math.floor((batchSize * row.weight) / totalWeight));
    allocation.set(row.id, share);
    assigned += share;
  }

  let remainder = Math.max(0, batchSize - assigned);
  const positive = adapterIds.filter((id) => (allocation.get(id) || 0) > 0);
  let index = 0;
  while (remainder > 0 && positive.length > 0) {
    const id = positive[index % positive.length];
    allocation.set(id, (allocation.get(id) || 0) + 1);
    remainder -= 1;
    index += 1;
  }

  return allocation;
}

export function listWave4ActiveWeightedSourceIds() {
  return listActiveWeightedSourceIds();
}

export function allWave4SourcesExhausted(
  adapterCursors: Record<string, { exhausted?: boolean; status?: string }>,
  adapterIds: string[]
) {
  const activeIds = adapterIds.filter((id) => getWave4SourceWeight(id) > 0);
  if (activeIds.length === 0) return true;
  return activeIds.every((id) => {
    const cursor = adapterCursors[id];
    return cursor?.exhausted === true || cursor?.status === "exhausted";
  });
}
