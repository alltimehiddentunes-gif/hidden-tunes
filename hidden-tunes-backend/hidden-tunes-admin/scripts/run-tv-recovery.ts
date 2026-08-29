import fs from "node:fs";
import path from "node:path";
import {
  createStaticExactRecoveryProvider,
  TvRecoveryProviderRegistry,
} from "../lib/tvRecovery/providerRegistry";
import { toTvRecoveryDryRunRecord } from "../lib/tvRecovery/engine";
import { runTvRecoveryWorker, type TvRecoveryRepository } from "../lib/tvRecovery/worker";
import type { DeepStreamProbeResult } from "../lib/tvStreamProtocol";
import type {
  TvProviderCandidate,
  TvRecoveryAuditEvent,
  TvRecoveryStation,
} from "../lib/tvRecovery/types";

type RecoverySnapshot = {
  stations: TvRecoveryStation[];
  providerCandidates?: TvProviderCandidate[];
  probeResults: Record<string, DeepStreamProbeResult>;
};

function valueArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

function numberArg(name: string, fallback: number) {
  const value = Number(valueArg(name));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function createSnapshotRepository(snapshot: RecoverySnapshot) {
  const rows = [...snapshot.stations].sort((left, right) => left.id.localeCompare(right.id));
  let updateCalls = 0;
  let auditCalls = 0;
  let invalidationCalls = 0;
  const repository: TvRecoveryRepository = {
    async loadBatch({ cursor, limit }) {
      const start = cursor ? rows.findIndex((row) => row.id > cursor) : 0;
      const safeStart = start < 0 ? rows.length : start;
      const stations = rows.slice(safeStart, safeStart + limit);
      return {
        stations,
        nextCursor: stations.at(-1)?.id || cursor,
        done: safeStart + stations.length >= rows.length,
      };
    },
    async loadDuplicateContext() {
      return [...rows];
    },
    async updateStation({ stationId, patch }) {
      updateCalls += 1;
      const index = rows.findIndex((row) => row.id === stationId);
      if (index < 0) throw new Error(`Snapshot station not found: ${stationId}`);
      rows[index] = { ...rows[index], ...patch } as TvRecoveryStation;
    },
    async appendAudit(events: TvRecoveryAuditEvent[]) {
      void events;
      auditCalls += 1;
    },
    async invalidateCache() {
      invalidationCalls += 1;
      return "snapshot_cache_invalidated";
    },
  };
  return {
    repository,
    mutationCounts: () => ({ updateCalls, auditCalls, invalidationCalls }),
  };
}

function createSnapshotRegistry(candidates: TvProviderCandidate[]) {
  const providers = [...new Set(candidates.map((candidate) => candidate.providerId))].map(
    (providerId) =>
      createStaticExactRecoveryProvider({
        id: providerId,
        candidates: candidates.filter((candidate) => candidate.providerId === providerId),
      })
  );
  return new TvRecoveryProviderRegistry(providers);
}

async function main() {
  const databaseMode = process.argv.includes("--database");
  const apply = process.argv.includes("--apply");
  const ids = String(valueArg("ids") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (apply) {
    if (
      !databaseMode ||
      ids.length === 0 ||
      process.env.TV_RECOVERY_PHASE_B_AUTHORIZED !== "EXPLICIT_PHASE_B_APPROVAL"
    ) {
      throw new Error(
        "Apply is locked: Phase B approval token, --database, and explicit --ids are all required."
      );
    }
  }

  let repository: TvRecoveryRepository;
  let registry: TvRecoveryProviderRegistry;
  let probe: (url: string, station: TvRecoveryStation) => Promise<DeepStreamProbeResult>;
  let mutationCounts = () => ({ updateCalls: 0, auditCalls: 0, invalidationCalls: 0 });

  if (databaseMode) {
    const [{ createDefaultTvRecoveryRegistry }, { createSupabaseTvRecoveryRepository }, protocol] =
      await Promise.all([
        import("../lib/tvRecovery/providerRegistry"),
        import("../lib/tvRecovery/supabaseRepository"),
        import("../lib/tvStreamProtocol"),
      ]);
    repository = createSupabaseTvRecoveryRepository({ targetIds: ids.length ? ids : undefined });
    registry = createDefaultTvRecoveryRegistry();
    probe = (url) => protocol.probeDeepTvStream(url);
  } else {
    const snapshotPath = valueArg("snapshot");
    if (!snapshotPath) {
      throw new Error(
        "Safe default requires --snapshot=<json>. Use --database only for an explicitly authorized DB dry-run."
      );
    }
    const absolutePath = path.resolve(snapshotPath);
    const snapshot = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as RecoverySnapshot;
    const inMemory = createSnapshotRepository(snapshot);
    repository = inMemory.repository;
    mutationCounts = inMemory.mutationCounts;
    registry = createSnapshotRegistry(snapshot.providerCandidates || []);
    probe = async (url) => {
      const result = snapshot.probeResults[url];
      if (!result) throw new Error(`Snapshot has no validation result for source fingerprint input.`);
      return result;
    };
  }

  const result = await runTvRecoveryWorker({
    repository,
    registry,
    probe,
    dryRun: !apply,
    cursor: valueArg("cursor"),
    batchSize: numberArg("batch-size", 25),
    concurrency: numberArg("concurrency", 3),
    maxBatches: numberArg("max-batches", 1),
  });

  const output = {
    mode: apply ? "apply" : "dry-run",
    attempted: result.attempted,
    planned: result.planned,
    applied: result.applied,
    batches: result.batches,
    nextCursor: result.nextCursor,
    done: result.done,
    reviewQueueCount: result.reviewQueue.length,
    cacheInvalidation: result.cacheInvalidation,
    errors: result.errors,
    mutationCounts: mutationCounts(),
    candidates: result.plans.map(toTvRecoveryDryRunRecord),
  };
  console.log(JSON.stringify(output, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
