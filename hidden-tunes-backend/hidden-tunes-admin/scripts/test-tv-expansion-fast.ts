import assert from "node:assert/strict";

import { TvDedupeCache } from "../lib/tvExpansion25k/fast/dedupeCache";
import { DomainConcurrencyLimiter } from "../lib/tvExpansion25k/fast/domainLimiter";
import { mapWithConcurrency } from "../lib/tvExpansion25k/fast/workerPool";
import { rankSourcesForParallelRun } from "../lib/tvExpansion25k/fast/sourceScoring";
import { getWave4NormalSourceAdapters } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";
import { createInitialWave4Checkpoint } from "../lib/tvExpansion25k/wave4/checkpoint";
import { dedupeTvGrowthCandidates } from "../lib/tvStationHealth";

async function testWorkerPoolConcurrency() {
  const started: number[] = [];
  let active = 0;
  let maxActive = 0;
  await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    started.push(value);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });
  assert.equal(started.length, 20);
  assert.ok(maxActive <= 4);
}

async function testDomainLimiter() {
  const limiter = new DomainConcurrencyLimiter(2);
  let active = 0;
  let maxActive = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () =>
      limiter.run("https://example.com/stream.m3u8", async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
      })
    )
  );
  assert.ok(maxActive <= 2);
}

function testDedupeCacheRegister() {
  const cache = new TvDedupeCache();
  (cache as unknown as { index: { sourceKeys: Set<string>; urlKeys: Set<string>; titleCountryKeys: Set<string> } }).index = {
    sourceKeys: new Set<string>(),
    urlKeys: new Set<string>(),
    titleCountryKeys: new Set<string>(),
  };
  const candidate = {
    source_type: "tv",
    source_id: "abc",
    source_url: "https://example.com/a.m3u8",
    title: "Test Channel",
    country: "US",
  };
  cache.registerAccepted([candidate]);
  const existing = (cache as unknown as { index: { urlKeys: Set<string> } }).index;
  assert.ok(existing.urlKeys.has("https://example.com/a.m3u8"));
  const deduped = dedupeTvGrowthCandidates([candidate, candidate], existing as never);
  assert.equal(deduped.length, 0);
}

function testExhaustedSourcesSkippedInRanking() {
  const checkpoint = createInitialWave4Checkpoint("normal");
  for (const adapter of getWave4NormalSourceAdapters()) {
    checkpoint.sources.adapterCursors[adapter.id] = {
      ...createInitialSourceCursor(adapter.id),
      exhausted: true,
      status: "exhausted",
    };
  }
  checkpoint.sources.adapterCursors[getWave4NormalSourceAdapters()[0].id] =
    createInitialSourceCursor(getWave4NormalSourceAdapters()[0].id);

  const ranked = rankSourcesForParallelRun(
    getWave4NormalSourceAdapters(),
    checkpoint.sources,
    undefined
  );
  assert.equal(ranked.length, 1);
}

async function testDryRunZeroDatabaseWrites() {
  const cache = new TvDedupeCache();
  (cache as unknown as { index: { sourceKeys: Set<string>; urlKeys: Set<string>; titleCountryKeys: Set<string> } }).index = {
    sourceKeys: new Set<string>(),
    urlKeys: new Set<string>(),
    titleCountryKeys: new Set<string>(),
  };
  const { bulkImportVerifiedCandidates } = await import("../lib/tvExpansion25k/fast/bulkImport");
  const result = await bulkImportVerifiedCandidates(
    [
      {
        source_type: "tv",
        source_id: "dry-1",
        source_url: "not-a-valid-url",
        title: "Dry Run",
      },
    ],
    cache,
    {
      dryRun: true,
      verifyConcurrency: 4,
      perHostConcurrency: 2,
      importBatchSize: 50,
    }
  );
  assert.equal(result.imported, 0);
  assert.equal(result.databaseRoundTrips, 0);
  assert.equal(result.wouldInsert, 0);
}

async function main() {
  await testWorkerPoolConcurrency();
  await testDomainLimiter();
  testDedupeCacheRegister();
  testExhaustedSourcesSkippedInRanking();
  await testDryRunZeroDatabaseWrites();

  console.log(JSON.stringify({ ok: true, tests: 5 }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
