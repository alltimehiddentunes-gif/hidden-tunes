import { SPORTS_WORKER_KEYS, type SportsWorkerKey } from "../constants";

export type SportsWorkerReport = {
  workerKey: SportsWorkerKey;
  startedAt: string;
  finishedAt: string;
  status: "skipped" | "completed" | "failed";
  processed: number;
  errors: string[];
  notes: string[];
};

export type SportsWorkerContext = {
  dryRun?: boolean;
  batchSize?: number;
  signal?: AbortSignal;
};

/**
 * Worker skeletons — Phase 1 does not start permanent production loops.
 * Each worker is idempotent, bounded, and skipped unless explicitly invoked.
 */
export async function runSportsWorker(
  workerKey: SportsWorkerKey,
  ctx: SportsWorkerContext = {}
): Promise<SportsWorkerReport> {
  const startedAt = new Date().toISOString();
  const batchSize = Math.min(100, Math.max(1, ctx.batchSize ?? 25));

  if (ctx.signal?.aborted) {
    return {
      workerKey,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      processed: 0,
      errors: ["cancelled"],
      notes: [],
    };
  }

  // Provider imports remain disabled unless explicitly invoked via CLI workers.
  if (
    workerKey === "sports-video-import" ||
    workerKey === "sports-broadcast-discovery" ||
    workerKey === "sports-fixture-sync"
  ) {
    return {
      workerKey,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "skipped",
      processed: 0,
      errors: [],
      notes: [
        "Phase 1 skeleton only — production import loops are not started.",
        `batchSize=${batchSize}`,
        ctx.dryRun ? "dryRun=true" : "dryRun=false",
      ],
    };
  }

  if (workerKey === "sports-validate-live-broadcasts") {
    return {
      workerKey,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "skipped",
      processed: 0,
      errors: [],
      notes: [
        "Invoke via: npm run sports:validate-live-broadcasts -- --dry-run --limit=50",
        `batchSize=${batchSize}`,
        ctx.dryRun ? "dryRun=true" : "dryRun=false",
      ],
    };
  }

  return {
    workerKey,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "skipped",
    processed: 0,
    errors: [],
    notes: [
      "Phase 1 worker skeleton executed without side effects.",
      `batchSize=${batchSize}`,
    ],
  };
}

export function listSportsWorkerKeys(): SportsWorkerKey[] {
  return [...SPORTS_WORKER_KEYS];
}

export async function runAllSportsWorkerSkeletons(
  ctx: SportsWorkerContext = {}
): Promise<SportsWorkerReport[]> {
  const reports: SportsWorkerReport[] = [];
  for (const key of SPORTS_WORKER_KEYS) {
    reports.push(await runSportsWorker(key, ctx));
  }
  return reports;
}
