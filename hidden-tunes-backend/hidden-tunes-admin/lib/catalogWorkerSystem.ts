import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AUDIOBOOK_SEED_CATEGORIES, ingestAudiobookSeedCatalog } from "@/lib/audiobookSeedIngest";
import {
  ingestMaturePodcastSeedCatalog,
  ingestPodcastSeedCatalog,
} from "@/lib/podcastSeedIngest";
import { runPodcastFeedRefreshBatch } from "@/lib/podcastFeedRefreshWorker";
import { ingestLectureSeedCatalog } from "@/lib/lectureSeedIngest";
import {
  ingestRadioCatalogBatch,
  RADIO_WORKER_CATEGORIES,
} from "@/lib/radioCatalogWorker";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { importTvLegalCatalogBatch } from "@/lib/tvLegalCatalogImport";

export type CatalogWorkerSection =
  | "radio"
  | "audiobook"
  | "podcast"
  | "motivation"
  | "lecture"
  | "tv";

export const CATALOG_WORKERS: Array<{
  section: CatalogWorkerSection;
  pm2Name: string;
  cron: string;
  schedule: string;
}> = [
  {
    section: "radio",
    pm2Name: "hidden-tunes-radio-worker",
    cron: "0 1 * * *",
    schedule: "01:00 daily",
  },
  {
    section: "audiobook",
    pm2Name: "hidden-tunes-audiobook-worker",
    cron: "0 3 * * *",
    schedule: "03:00 daily",
  },
  {
    section: "podcast",
    pm2Name: "hidden-tunes-podcast-worker",
    cron: "0 5 * * *",
    schedule: "05:00 daily",
  },
  {
    section: "motivation",
    pm2Name: "hidden-tunes-motivation-worker",
    cron: "0 7 * * *",
    schedule: "07:00 daily",
  },
  {
    section: "lecture",
    pm2Name: "hidden-tunes-lecture-worker",
    cron: "0 9 * * *",
    schedule: "09:00 daily",
  },
  {
    section: "tv",
    pm2Name: "hidden-tunes-tv-worker",
    cron: "0 11 * * *",
    schedule: "11:00 daily",
  },
];

export function findCatalogWorker(section: CatalogWorkerSection) {
  return CATALOG_WORKERS.find((worker) => worker.section === section) || null;
}

type WorkerState = {
  section: CatalogWorkerSection;
  cursor: number;
  mature_cursor?: number;
  category_index?: number;
  batches_completed: number;
  batches_failed: number;
  last_started_at?: string;
  last_finished_at?: string;
  last_error?: string | null;
  last_result?: unknown;
  last_run_mode?: "once" | "daemon";
};

type BatchContext = {
  state: WorkerState;
  batchSize: number;
  timeoutMs: number;
  adminRoot: string;
};

const DEFAULT_BATCH_SIZE = 15;
const DEFAULT_SLEEP_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BATCHES_PER_RUN = 8;
const DEFAULT_MAX_RUNTIME_MS = 45 * 60_000;

export function getAdminRoot() {
  return process.cwd();
}

export function getCatalogWorkerDataDir(adminRoot = getAdminRoot()) {
  return path.join(adminRoot, "data", "catalog-workers");
}

function ensureWorkerDirs(adminRoot: string) {
  const dir = getCatalogWorkerDataDir(adminRoot);
  fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
  return dir;
}

function statePath(section: CatalogWorkerSection, adminRoot: string) {
  return path.join(ensureWorkerDirs(adminRoot), `${section}.state.json`);
}

function logPath(section: CatalogWorkerSection, adminRoot: string) {
  return path.join(ensureWorkerDirs(adminRoot), "logs", `${section}.jsonl`);
}

export function readWorkerState(
  section: CatalogWorkerSection,
  adminRoot = getAdminRoot()
): WorkerState {
  const filePath = statePath(section, adminRoot);
  if (!fs.existsSync(filePath)) {
    return {
      section,
      cursor: 0,
      category_index: 0,
      batches_completed: 0,
      batches_failed: 0,
      last_error: null,
    };
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as WorkerState;
}

export function writeWorkerState(state: WorkerState, adminRoot = getAdminRoot()) {
  fs.writeFileSync(
    statePath(state.section, adminRoot),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

export function appendWorkerLog(
  section: CatalogWorkerSection,
  event: string,
  payload: Record<string, unknown>,
  adminRoot = getAdminRoot()
) {
  fs.appendFileSync(
    logPath(section, adminRoot),
    `${JSON.stringify({ at: new Date().toISOString(), section, event, ...payload })}\n`,
    "utf8"
  );
}

function parsePositiveEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] || "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number }
) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: process.platform === "win32",
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
      }, options.timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timeout);
        resolve({ exitCode, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) });
      });
    }
  );
}

function advanceCursor(state: WorkerState, attempted: number, batchSize: number) {
  state.cursor += attempted;
  if (attempted < batchSize) {
    state.cursor = 0;
  }
}

async function runAudiobookBatch(context: BatchContext) {
  const categoryIndex =
    (context.state.category_index || 0) % AUDIOBOOK_SEED_CATEGORIES.length;
  const category = AUDIOBOOK_SEED_CATEGORIES[categoryIndex];
  const result = await ingestAudiobookSeedCatalog({
    all: false,
    categories: [category],
    limit: context.batchSize,
    offset: context.state.cursor,
    batch_size: context.batchSize,
    timeout_ms: Math.min(context.timeoutMs, 30_000),
  });

  advanceCursor(context.state, result.books_attempted, context.batchSize);
  if (
    result.books_attempted < context.batchSize ||
    result.category_fetch_failed > 0
  ) {
    context.state.category_index =
      (categoryIndex + 1) % AUDIOBOOK_SEED_CATEGORIES.length;
    context.state.cursor = 0;
  }

  return { category, result };
}

async function runPodcastBatch(context: BatchContext) {
  const result = await ingestPodcastSeedCatalog({
    auto_approve: true,
    max_feeds: context.batchSize,
    max_episodes_per_feed: 15,
    offset: context.state.cursor,
    feed_timeout_ms: Math.min(context.timeoutMs, 30_000),
  });
  advanceCursor(context.state, result.feeds_attempted, context.batchSize);
  const matureResult = await ingestMaturePodcastSeedCatalog({
    auto_approve: true,
    max_feeds: context.batchSize,
    max_episodes_per_feed: 15,
    offset: context.state.mature_cursor || 0,
    feed_timeout_ms: Math.min(context.timeoutMs, 30_000),
  });
  context.state.mature_cursor =
    (context.state.mature_cursor || 0) + matureResult.feeds_attempted;
  if (matureResult.feeds_attempted < context.batchSize) {
    context.state.mature_cursor = 0;
  }
  const refreshResult = await runPodcastFeedRefreshBatch({
    limit: Math.max(context.batchSize, 25),
    stale_hours: 24,
  });
  return { podcast: result, mature_podcast: matureResult, refresh: refreshResult };
}

async function runLectureBatch(context: BatchContext) {
  const result = await ingestLectureSeedCatalog({
    limit: context.batchSize,
    offset: context.state.cursor,
  });
  const attempted =
    result.items_inserted + result.items_updated + result.skipped + result.errors.length;
  advanceCursor(context.state, attempted, context.batchSize);
  return result;
}

async function runMotivationBatch(context: BatchContext) {
  const candidatePath = path.join(context.adminRoot, "data", "motivation-candidates.json");
  if (!fs.existsSync(candidatePath)) {
    return {
      skipped: true,
      reason: "data/motivation-candidates.json is not present",
    };
  }

  return runCommand(
    "npx",
    ["tsx", "scripts/run-motivation-import.ts", candidatePath],
    { cwd: context.adminRoot, timeoutMs: context.timeoutMs }
  );
}

async function runTvBatch(context: BatchContext) {
  const result = await importTvLegalCatalogBatch({
    batchSize: context.batchSize,
    offset: context.state.cursor,
  });
  context.state.cursor = result.nextOffset;
  return result;
}

async function runRadioBatch(context: BatchContext) {
  const categoryIndex =
    (context.state.category_index || 0) % RADIO_WORKER_CATEGORIES.length;
  const result = await ingestRadioCatalogBatch({
    categoryIndex,
    offset: context.state.cursor,
    batchSize: context.batchSize,
    timeoutMs: context.timeoutMs,
  });

  advanceCursor(context.state, result.stations_found, context.batchSize);
  if (
    !result.table_available ||
    result.stations_found < context.batchSize ||
    result.errors.length > 0
  ) {
    context.state.category_index =
      (categoryIndex + 1) % RADIO_WORKER_CATEGORIES.length;
    context.state.cursor = 0;
  }

  return result;
}

async function runBatch(section: CatalogWorkerSection, context: BatchContext) {
  if (section === "radio") return runRadioBatch(context);
  if (section === "audiobook") return runAudiobookBatch(context);
  if (section === "podcast") return runPodcastBatch(context);
  if (section === "lecture") return runLectureBatch(context);
  if (section === "motivation") return runMotivationBatch(context);
  return runTvBatch(context);
}

export async function runCatalogWorker(
  section: CatalogWorkerSection,
  options: { mode?: "once" | "daemon" } = {}
) {
  const adminRoot = getAdminRoot();
  const batchSize = parsePositiveEnv(
    "CATALOG_WORKER_BATCH_SIZE",
    DEFAULT_BATCH_SIZE,
    1,
    25
  );
  const sleepMs = parsePositiveEnv(
    "CATALOG_WORKER_SLEEP_MS",
    DEFAULT_SLEEP_MS,
    30_000,
    120_000
  );
  const timeoutMs = parsePositiveEnv(
    "CATALOG_WORKER_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    10_000,
    300_000
  );
  const maxBatchesPerRun = parsePositiveEnv(
    "CATALOG_WORKER_MAX_BATCHES",
    DEFAULT_MAX_BATCHES_PER_RUN,
    1,
    20
  );
  const maxRuntimeMs = parsePositiveEnv(
    "CATALOG_WORKER_MAX_RUNTIME_MS",
    DEFAULT_MAX_RUNTIME_MS,
    30 * 60_000,
    60 * 60_000
  );
  const mode = options.mode || "once";
  const runStartedAt = Date.now();

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  appendWorkerLog(
    section,
    "worker_start",
    { batchSize, maxBatchesPerRun, maxRuntimeMs, mode, sleepMs, timeoutMs },
    adminRoot
  );

  let batchesThisRun = 0;
  while (
    !stopping &&
    batchesThisRun < maxBatchesPerRun &&
    Date.now() - runStartedAt < maxRuntimeMs
  ) {
    const state = readWorkerState(section, adminRoot);
    state.last_started_at = new Date().toISOString();
    state.last_error = null;
    state.last_run_mode = mode;
    writeWorkerState(state, adminRoot);
    appendWorkerLog(section, "batch_start", { cursor: state.cursor }, adminRoot);

    try {
      let result: unknown;
      try {
        result = await runBatch(section, {
          state,
          batchSize,
          timeoutMs,
          adminRoot,
        });
      } catch (error) {
        appendWorkerLog(section, "batch_retry", {
          cursor: state.cursor,
          error: error instanceof Error ? error.message : String(error),
        }, adminRoot);
        await sleep(5_000);
        result = await runBatch(section, {
          state,
          batchSize,
          timeoutMs,
          adminRoot,
        });
      }
      state.batches_completed += 1;
      state.last_result = result;
      state.last_finished_at = new Date().toISOString();
      state.last_error = null;
      writeWorkerState(state, adminRoot);
      appendWorkerLog(section, "batch_end", { cursor: state.cursor, result }, adminRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.batches_failed += 1;
      state.last_error = message;
      state.last_finished_at = new Date().toISOString();
      writeWorkerState(state, adminRoot);
      appendWorkerLog(section, "batch_error", { cursor: state.cursor, error: message }, adminRoot);
    }

    batchesThisRun += 1;
    if (!stopping && batchesThisRun < maxBatchesPerRun) {
      await sleep(sleepMs);
    }
  }

  appendWorkerLog(section, "worker_stop", {
    batchesThisRun,
    elapsedMs: Date.now() - runStartedAt,
    mode,
  }, adminRoot);
}

export async function verifyCatalogWorkers() {
  const tables = [
    "audiobooks",
    "podcast_episodes",
    "radio_stations",
    "motivation_items",
    "lecture_items",
    "tv_videos",
  ];
  const counts: Record<string, number | null> = {};

  for (const table of tables) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select("id", { count: "exact", head: true });
    counts[table] = error ? null : count;
  }

  return {
    ok: true,
    counts,
    workers: CATALOG_WORKERS.map((worker) => ({
      ...worker,
      state: readWorkerState(worker.section),
    })),
  };
}
