import assert from "node:assert/strict";
import {
  createStaticExactRecoveryProvider,
  TvRecoveryProviderRegistry,
} from "../lib/tvRecovery/providerRegistry";
import {
  nextTvRecoveryRunAt,
  retryWithBackoff,
  runTvRecoveryWorker,
  type TvRecoveryRepository,
} from "../lib/tvRecovery/worker";
import type { DeepStreamOutcome, DeepStreamProbeResult } from "../lib/tvStreamProtocol";
import type {
  TvProviderCandidate,
  TvRecoveryAuditEvent,
  TvRecoveryPatch,
  TvRecoveryStation,
} from "../lib/tvRecovery/types";

function row(id: number, overrides: Partial<TvRecoveryStation> = {}): TvRecoveryStation {
  return {
    id: `station-${id}`,
    title: `Station ${id}`,
    source_type: "hls_stream",
    source_id: `provider-${id}`,
    source_key: `provider:${id}`,
    source_url: `https://old.example.com/${id}.m3u8`,
    validated_stream_url: null,
    embed_url: null,
    status: "approved",
    playback_status: "failed",
    is_active: true,
    reliability_score: 40,
    consecutive_failures: 2,
    quarantined_at: null,
    disabled_at: null,
    created_at: `2026-01-${String(id).padStart(2, "0")}T00:00:00.000Z`,
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(id: number): TvProviderCandidate {
  return {
    providerId: "provider",
    canonicalId: String(id),
    sourceKey: `provider:${id}`,
    sourceType: "hls_stream",
    sourceId: `provider-${id}`,
    sourceUrl: `https://new.example.com/${id}.m3u8`,
    title: `Station ${id}`,
  };
}

function result(url: string, outcome: DeepStreamOutcome): DeepStreamProbeResult {
  const playable = outcome === "playable";
  return {
    ok: true,
    protocol: "hls",
    streamIsHttps: true,
    normalizedUrl: url,
    playable,
    outcome,
    finalUrl: url,
    stableUrl: outcome === "temporary" ? null : url,
    finalUrlIsTemporary: outcome === "temporary",
    contentType: "application/vnd.apple.mpegurl",
    redirectCount: 0,
    manifestValidated: playable,
    mediaValidated: playable,
    keyValidated: playable,
    initSegmentValidated: false,
    drmDetected: outcome === "drm",
    reason: `${outcome}_fixture`,
  };
}

function fakeRepository(initialRows: TvRecoveryStation[]) {
  const rows = initialRows.map((item) => ({ ...item })).sort((a, b) => a.id.localeCompare(b.id));
  const calls = { updates: 0, audits: 0, invalidations: 0 };
  const repository: TvRecoveryRepository = {
    async loadBatch({ cursor, limit }) {
      const start = cursor ? rows.findIndex((item) => item.id > cursor) : 0;
      const offset = start < 0 ? rows.length : start;
      const stations = rows.slice(offset, offset + limit);
      return {
        stations,
        nextCursor: stations.at(-1)?.id || cursor,
        done: offset + stations.length >= rows.length,
      };
    },
    async loadDuplicateContext() {
      return rows.map((item) => ({ ...item }));
    },
    async updateStation({ stationId, patch }: { stationId: string; patch: TvRecoveryPatch }) {
      calls.updates += 1;
      const index = rows.findIndex((item) => item.id === stationId);
      rows[index] = { ...rows[index], ...patch } as TvRecoveryStation;
    },
    async appendAudit(events: TvRecoveryAuditEvent[]) {
      void events;
      calls.audits += 1;
    },
    async invalidateCache() {
      calls.invalidations += 1;
      return "fake_cache_invalidated";
    },
  };
  return { repository, rows, calls };
}

function registry(ids: number[], cooldownMs = 0) {
  return new TvRecoveryProviderRegistry([
    createStaticExactRecoveryProvider({
      id: "provider",
      candidates: ids.map(candidate),
      cooldownMs,
    }),
  ]);
}

async function main() {
  const dryRepo = fakeRepository([row(1)]);
  const dry = await runTvRecoveryWorker({
    repository: dryRepo.repository,
    registry: registry([1]),
    probe: async (url) => result(url, url.includes("new.example.com") ? "playable" : "dead"),
    dryRun: true,
    batchSize: 1,
    maxBatches: 1,
    now: () => new Date("2026-08-29T12:00:00.000Z"),
  });
  assert.equal(dry.plans[0].action, "refresh_source");
  assert.equal(dry.applied, 0);
  assert.deepEqual(dryRepo.calls, { updates: 0, audits: 0, invalidations: 0 });
  assert.equal(dry.cacheInvalidation, "not_run");

  const applyRepo = fakeRepository([row(1)]);
  const applied = await runTvRecoveryWorker({
    repository: applyRepo.repository,
    registry: registry([1]),
    probe: async (url) => result(url, url.includes("new.example.com") ? "playable" : "dead"),
    dryRun: false,
    batchSize: 1,
    maxBatches: 1,
    now: () => new Date("2026-08-29T12:00:00.000Z"),
  });
  assert.equal(applied.applied, 1);
  assert.deepEqual(applyRepo.calls, { updates: 1, audits: 1, invalidations: 1 });
  assert.equal(applyRepo.rows[0].source_url, "https://new.example.com/1.m3u8");
  assert.equal(applied.cacheInvalidation, "fake_cache_invalidated");

  const batchRepo = fakeRepository([row(1), row(2), row(3), row(4), row(5)]);
  let activeProbes = 0;
  let maxActiveProbes = 0;
  const batched = await runTvRecoveryWorker({
    repository: batchRepo.repository,
    registry: registry([1, 2, 3, 4, 5]),
    probe: async (url) => {
      activeProbes += 1;
      maxActiveProbes = Math.max(maxActiveProbes, activeProbes);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeProbes -= 1;
      return result(url, url.includes("new.example.com") ? "playable" : "dead");
    },
    dryRun: true,
    batchSize: 2,
    concurrency: 2,
    maxBatches: 2,
    now: () => new Date("2026-08-29T12:00:00.000Z"),
  });
  assert.equal(batched.attempted, 4);
  assert.equal(batched.batches, 2);
  assert.equal(batched.done, false);
  assert.equal(batched.nextCursor, "station-4");
  assert.ok(maxActiveProbes <= 2, "probe concurrency remains bounded");

  let attempt = 0;
  const backoffs: number[] = [];
  const retryValue = await retryWithBackoff(
    async () => {
      attempt += 1;
      if (attempt < 3) throw new Error("temporary provider failure");
      return "recovered";
    },
    {
      maxRetries: 2,
      baseBackoffMs: 5,
      sleep: async (ms) => {
        backoffs.push(ms);
      },
    }
  );
  assert.equal(retryValue, "recovered");
  assert.deepEqual(backoffs, [5, 10]);

  const cooldownRepo = fakeRepository([row(1), row(2)]);
  let fakeNow = Date.parse("2026-08-29T12:00:00.000Z");
  const cooldownSleeps: number[] = [];
  await runTvRecoveryWorker({
    repository: cooldownRepo.repository,
    registry: registry([1, 2], 20),
    probe: async (url) => result(url, url.includes("new.example.com") ? "playable" : "dead"),
    dryRun: true,
    batchSize: 1,
    concurrency: 2,
    maxBatches: 2,
    now: () => new Date(fakeNow),
    sleep: async (ms) => {
      cooldownSleeps.push(ms);
      fakeNow += ms;
    },
  });
  assert.deepEqual(cooldownSleeps, [20], "same-provider batches honor the cooldown gate");

  assert.equal(
    nextTvRecoveryRunAt({
      lastRunAt: "2026-08-29T12:00:00.000Z",
      nowMs: Date.parse("2026-08-29T13:00:00.000Z"),
      intervalMs: 6 * 60 * 60_000,
    }),
    "2026-08-29T18:00:00.000Z"
  );

  console.log("tv recovery worker tests passed");
}

void main();
