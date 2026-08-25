import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { runSportsWorker, type SportsWorkerReport } from "./index";
import type { SportsFixtureSyncLane } from "./fixtureSync";

export const SPORTS_FIXTURE_SCHEDULER_KEY = "sports-fixture-scheduler";
export const SPORTS_FIXTURE_SCHEDULER_PM2_NAME = "hidden-tunes-sports-fixture-scheduler";
export const SPORTS_FIXTURE_SCHEDULER_CRON = "*/20 * * * *";
export const SPORTS_FIXTURE_SCHEDULER_DEFAULT_API_DAILY_CAP = 95;

export const SPORTS_FIXTURE_LANE_POLICY: Record<
  SportsFixtureSyncLane,
  { intervalMs: number; apiCalls: number; priority: number }
> = {
  live: { intervalMs: 20 * 60_000, apiCalls: 1, priority: 1 },
  today: { intervalMs: 2 * 60 * 60_000, apiCalls: 1, priority: 2 },
  recent: { intervalMs: 6 * 60 * 60_000, apiCalls: 1, priority: 3 },
  future: { intervalMs: 6 * 60 * 60_000, apiCalls: 1, priority: 4 },
};

export type SportsFixtureSchedulerCheckpoint = {
  quotaDate?: string;
  apiCallsUsed?: number;
  lastLaneAt?: Partial<Record<SportsFixtureSyncLane, string>>;
  lastSuccessAt?: string;
  consecutiveFailures?: number;
  lastLanes?: SportsFixtureSyncLane[];
  nextExecutionAt?: string;
  highValueAlert?: string | null;
};

export function planSportsFixtureScheduler(input: {
  now: Date;
  checkpoint?: SportsFixtureSchedulerCheckpoint | null;
  dailyCap?: number;
}) {
  const checkpoint = input.checkpoint || {};
  const date = input.now.toISOString().slice(0, 10);
  const sameQuotaDay = checkpoint.quotaDate === date;
  let apiCallsUsed = sameQuotaDay ? Math.max(0, checkpoint.apiCallsUsed || 0) : 0;
  const dailyCap = Math.max(4, Math.min(1000, input.dailyCap || SPORTS_FIXTURE_SCHEDULER_DEFAULT_API_DAILY_CAP));
  const due = (Object.keys(SPORTS_FIXTURE_LANE_POLICY) as SportsFixtureSyncLane[])
    .filter((lane) => {
      const last = checkpoint.lastLaneAt?.[lane];
      if (!last) return true;
      const lastMs = Date.parse(last);
      return !Number.isFinite(lastMs) || input.now.getTime() - lastMs >= SPORTS_FIXTURE_LANE_POLICY[lane].intervalMs;
    })
    .sort((a, b) => SPORTS_FIXTURE_LANE_POLICY[a].priority - SPORTS_FIXTURE_LANE_POLICY[b].priority);
  const lanes: SportsFixtureSyncLane[] = [];
  for (const lane of due) {
    const cost = SPORTS_FIXTURE_LANE_POLICY[lane].apiCalls;
    if (apiCallsUsed + cost > dailyCap) continue;
    lanes.push(lane);
    apiCallsUsed += cost;
  }
  const nextExecutionAt = new Date(
    Math.min(
      ...((Object.keys(SPORTS_FIXTURE_LANE_POLICY) as SportsFixtureSyncLane[]).map((lane) => {
        const last = lanes.includes(lane)
          ? input.now.toISOString()
          : checkpoint.lastLaneAt?.[lane];
        const lastMs = last ? Date.parse(last) : input.now.getTime();
        return lastMs + SPORTS_FIXTURE_LANE_POLICY[lane].intervalMs;
      }))
    )
  ).toISOString();
  return { lanes, quotaDate: date, apiCallsAfterAttempt: apiCallsUsed, dailyCap, nextExecutionAt };
}

type SchedulerDependencies = {
  now?: Date;
  enabled?: boolean;
  killSwitch?: boolean;
  dailyCap?: number;
  claim?: (now: Date) => Promise<boolean>;
  loadCheckpoint?: () => Promise<SportsFixtureSchedulerCheckpoint>;
  finish?: (
    status: "completed" | "failed" | "skipped",
    error: string | null,
    checkpoint: SportsFixtureSchedulerCheckpoint,
    now: Date
  ) => Promise<void>;
  runWorker?: (lanes: SportsFixtureSyncLane[]) => Promise<SportsWorkerReport>;
};

export async function runSportsFixtureSchedulerOnce(deps: SchedulerDependencies = {}) {
  const now = deps.now || new Date();
  const enabled = deps.enabled ?? process.env.SPORTS_FIXTURE_SCHEDULER_ENABLED === "true";
  const killSwitch = deps.killSwitch ?? process.env.SPORTS_FIXTURE_SCHEDULER_KILL_SWITCH === "true";
  if (!enabled || killSwitch) {
    return { status: "skipped" as const, reason: !enabled ? "disabled" : "kill_switch", lanes: [] };
  }

  const claim = deps.claim || (async (claimedAt: Date) => {
    const { data, error } = await supabaseAdmin.rpc("sports_fixture_scheduler_claim", {
      p_worker_key: SPORTS_FIXTURE_SCHEDULER_KEY,
      p_now: claimedAt.toISOString(),
      p_lock_seconds: 900,
    });
    if (error) throw error;
    return data === true;
  });
  if (!(await claim(now))) {
    return { status: "skipped" as const, reason: "lease_held", lanes: [] };
  }

  const loadCheckpoint = deps.loadCheckpoint || (async () => {
    const { data, error } = await supabaseAdmin
      .from("sports_worker_checkpoints")
      .select("checkpoint")
      .eq("worker_key", SPORTS_FIXTURE_SCHEDULER_KEY)
      .single();
    if (error) throw error;
    return (data?.checkpoint || {}) as SportsFixtureSchedulerCheckpoint;
  });
  const finish = deps.finish || (async (status, errorMessage, checkpoint, finishedAt) => {
    const { error } = await supabaseAdmin.rpc("sports_fixture_scheduler_finish", {
      p_worker_key: SPORTS_FIXTURE_SCHEDULER_KEY,
      p_status: status,
      p_error: errorMessage,
      p_checkpoint: checkpoint,
      p_now: finishedAt.toISOString(),
    });
    if (error) throw error;
  });

  const checkpoint = await loadCheckpoint();
  const envCap = Number(process.env.SPORTS_FIXTURE_API_DAILY_CAP || "");
  const plan = planSportsFixtureScheduler({
    now,
    checkpoint,
    dailyCap: deps.dailyCap || (Number.isFinite(envCap) ? envCap : undefined),
  });
  if (plan.lanes.length === 0) {
    const next = { ...checkpoint, quotaDate: plan.quotaDate, nextExecutionAt: plan.nextExecutionAt };
    await finish("skipped", null, next, now);
    return { status: "skipped" as const, reason: "cadence_or_quota", lanes: [], checkpoint: next };
  }

  const runWorker = deps.runWorker || (async (lanes: SportsFixtureSyncLane[]) => {
    const fixture = await runSportsWorker("sports-fixture-sync", {
      dryRun: false,
      scheduled: true,
      fixtureSyncLanes: lanes,
    });
    if (fixture.status !== "completed") return fixture;
    const expiry = await runSportsWorker("sports-expiry-cleanup", {
      dryRun: false,
      scheduled: true,
      batchSize: 100,
    });
    return {
      ...fixture,
      finishedAt: expiry.finishedAt,
      status: expiry.status === "failed" ? "failed" : "completed",
      processed: fixture.processed + expiry.processed,
      errors: [...fixture.errors, ...expiry.errors],
      notes: [...fixture.notes, ...expiry.notes],
    };
  });
  let report: SportsWorkerReport;
  try {
    report = await runWorker(plan.lanes);
  } catch (error) {
    report = {
      workerKey: "sports-fixture-sync",
      startedAt: now.toISOString(),
      finishedAt: new Date().toISOString(),
      status: "failed",
      processed: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      notes: [],
    };
  }

  const completed = report.status === "completed";
  const consecutiveFailures = completed ? 0 : (checkpoint.consecutiveFailures || 0) + 1;
  const lastLaneAt = { ...(checkpoint.lastLaneAt || {}) };
  // Provider quota is consumed on attempts, but a failed lane remains due next process run.
  if (completed) for (const lane of plan.lanes) lastLaneAt[lane] = now.toISOString();
  const lastSuccessMs = checkpoint.lastSuccessAt ? Date.parse(checkpoint.lastSuccessAt) : NaN;
  const freshnessBreached = Number.isFinite(lastSuccessMs)
    ? now.getTime() - lastSuccessMs > 60 * 60_000
    : consecutiveFailures >= 3;
  const highValueAlert = consecutiveFailures >= 3 || freshnessBreached
    ? `sports_fixture_scheduler_unhealthy:failures=${consecutiveFailures}`
    : null;
  const next: SportsFixtureSchedulerCheckpoint = {
    ...checkpoint,
    quotaDate: plan.quotaDate,
    apiCallsUsed: plan.apiCallsAfterAttempt,
    lastLaneAt,
    lastSuccessAt: completed ? now.toISOString() : checkpoint.lastSuccessAt,
    consecutiveFailures,
    lastLanes: plan.lanes,
    nextExecutionAt: plan.nextExecutionAt,
    highValueAlert,
  };
  await finish(completed ? "completed" : "failed", report.errors.join(" | ") || null, next, now);
  return {
    status: completed ? ("completed" as const) : ("failed" as const),
    lanes: plan.lanes,
    report,
    checkpoint: next,
  };
}
