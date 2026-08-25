import { spawn } from "node:child_process";

import type { SportsWorkerContext, SportsWorkerReport } from "./index";

export const SPORTS_FIXTURE_SYNC_LANES = [
  "live",
  "today",
  "recent",
  "future",
] as const;
export type SportsFixtureSyncLane = (typeof SPORTS_FIXTURE_SYNC_LANES)[number];

function runRepairProcess(lanes: SportsFixtureSyncLane[], signal?: AbortSignal) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      command,
      [
        "tsx",
        "scripts/sports/repairCurrentFixtureData.ts",
        "--apply",
        "--scheduled",
        "--skip-stale",
        `--lanes=${lanes.join(",")}`,
      ],
      { cwd: process.cwd(), env: process.env, shell: false }
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: { code: number | null; stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    // A measured full manual cycle is ~5.5 minutes. Keep the worker bounded,
    // but leave margin below the 15-minute database lease.
    const timeout = setTimeout(() => child.kill("SIGTERM"), 12 * 60_000);
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", (error) => finish({ code: null, stdout, stderr: error.message }));
    child.on("close", (code) => finish({
      code,
      stdout: stdout.slice(-6000),
      stderr: stderr.slice(-6000),
    }));
  });
}

export async function runSportsFixtureSyncWorker(
  ctx: SportsWorkerContext = {}
): Promise<SportsWorkerReport> {
  const startedAt = new Date().toISOString();
  const requested = new Set(ctx.fixtureSyncLanes || SPORTS_FIXTURE_SYNC_LANES);
  const lanes = SPORTS_FIXTURE_SYNC_LANES.filter((lane) => requested.has(lane));
  if (ctx.dryRun !== false) {
    return {
      workerKey: "sports-fixture-sync",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "skipped",
      processed: 0,
      errors: [],
      notes: ["dryRun=true", `lanes=${lanes.join(",")}`, "no provider or database calls"],
    };
  }
  if (!ctx.scheduled || lanes.length === 0) {
    return {
      workerKey: "sports-fixture-sync",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      processed: 0,
      errors: ["fixture sync apply requires the authoritative scheduler and at least one lane"],
      notes: [],
    };
  }

  const result = await runRepairProcess(lanes, ctx.signal);
  return {
    workerKey: "sports-fixture-sync",
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.code === 0 ? "completed" : "failed",
    processed: 0,
    errors: result.code === 0 ? [] : [result.stderr || result.stdout || `exit ${result.code}`],
    notes: [`lanes=${lanes.join(",")}`, result.stdout].filter(Boolean),
  };
}
