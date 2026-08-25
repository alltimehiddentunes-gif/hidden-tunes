import assert from "node:assert/strict";

import {
  planSportsFixtureScheduler,
  runSportsFixtureSchedulerOnce,
  SPORTS_FIXTURE_LANE_POLICY,
  SPORTS_FIXTURE_SCHEDULER_CRON,
  type SportsFixtureSchedulerCheckpoint,
} from "../lib/sports/workers/fixtureScheduler";
import type { SportsWorkerReport } from "../lib/sports/workers";

const now = new Date("2026-08-25T12:00:00.000Z");
const first = planSportsFixtureScheduler({ now, checkpoint: {} });
assert.deepEqual(first.lanes, ["live", "today", "recent", "future"]);
assert.equal(first.apiCallsAfterAttempt, 4);
assert.equal(SPORTS_FIXTURE_SCHEDULER_CRON, "*/20 * * * *");

const annualizedDailyCalls =
  (24 * 60) / (SPORTS_FIXTURE_LANE_POLICY.live.intervalMs / 60_000) +
  (24 * 60) / (SPORTS_FIXTURE_LANE_POLICY.today.intervalMs / 60_000) +
  (24 * 60) / (SPORTS_FIXTURE_LANE_POLICY.recent.intervalMs / 60_000) +
  (24 * 60) / (SPORTS_FIXTURE_LANE_POLICY.future.intervalMs / 60_000);
assert.equal(annualizedDailyCalls, 92);

const allJustRan: SportsFixtureSchedulerCheckpoint = {
  quotaDate: "2026-08-25",
  apiCallsUsed: 4,
  lastLaneAt: {
    live: now.toISOString(),
    today: now.toISOString(),
    recent: now.toISOString(),
    future: now.toISOString(),
  },
};
const twentyOneMinutesLater = new Date(now.getTime() + 21 * 60_000);
assert.deepEqual(
  planSportsFixtureScheduler({ now: twentyOneMinutesLater, checkpoint: allJustRan }).lanes,
  ["live"]
);
assert.deepEqual(
  planSportsFixtureScheduler({
    now: twentyOneMinutesLater,
    checkpoint: { ...allJustRan, apiCallsUsed: 95 },
    dailyCap: 95,
  }).lanes,
  []
);

async function main() {
let claimed = 0;
const disabled = await runSportsFixtureSchedulerOnce({
  now,
  enabled: false,
  claim: async () => { claimed += 1; return true; },
});
assert.equal(disabled.status, "skipped");
assert.equal(claimed, 0, "disabled scheduler must not acquire a lease");

let workerCalls = 0;
const leaseHeld = await runSportsFixtureSchedulerOnce({
  now,
  enabled: true,
  claim: async () => false,
  runWorker: async () => { workerCalls += 1; throw new Error("must not run"); },
});
assert.equal(leaseHeld.status, "skipped");
assert.equal(workerCalls, 0, "overlapping scheduler must not run a worker");

function report(status: "completed" | "failed"): SportsWorkerReport {
  return {
    workerKey: "sports-fixture-sync",
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    status,
    processed: 3,
    errors: status === "failed" ? ["provider unavailable"] : [],
    notes: [],
  };
}

const saved: SportsFixtureSchedulerCheckpoint[] = [];
const completed = await runSportsFixtureSchedulerOnce({
  now,
  enabled: true,
  claim: async () => true,
  loadCheckpoint: async () => ({}),
  runWorker: async (lanes) => {
    assert.deepEqual(lanes, ["live", "today", "recent", "future"]);
    return report("completed");
  },
  finish: async (status, error, checkpoint) => {
    assert.equal(status, "completed");
    assert.equal(error, null);
    saved.push(checkpoint);
  },
});
assert.equal(completed.status, "completed");
assert.equal(saved[0]?.lastSuccessAt, now.toISOString());
assert.equal(saved[0]?.apiCallsUsed, 4);
assert.equal(saved[0]?.consecutiveFailures, 0);

const failedSaved: SportsFixtureSchedulerCheckpoint[] = [];
const failed = await runSportsFixtureSchedulerOnce({
  now,
  enabled: true,
  claim: async () => true,
  loadCheckpoint: async () => ({ consecutiveFailures: 2 }),
  runWorker: async () => report("failed"),
  finish: async (status, error, checkpoint) => {
    assert.equal(status, "failed");
    assert.match(error || "", /provider unavailable/);
    failedSaved.push(checkpoint);
  },
});
assert.equal(failed.status, "failed");
assert.equal(failedSaved[0]?.consecutiveFailures, 3);
assert.match(failedSaved[0]?.highValueAlert || "", /scheduler_unhealthy/);
assert.deepEqual(failedSaved[0]?.lastLaneAt, {});
assert.equal(failedSaved[0]?.apiCallsUsed, 4, "failed provider attempts still consume quota");

console.log(JSON.stringify({
  scheduler: "PASS",
  singleLease: "PASS",
  killSwitch: "PASS",
  cadence: "PASS",
  apiFootballCallsPerDay: annualizedDailyCalls,
  quotaFailClosed: "PASS",
  repeatedFailureAlert: "PASS",
}));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
