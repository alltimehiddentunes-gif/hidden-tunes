import assert from "node:assert/strict";

import {
  parseVerificationCheckpoint,
  shouldSkipVerification,
} from "@/lib/radioExpansion25k/verificationCheckpointPolicy";

function setOf(...ids: string[]) {
  return new Set(ids);
}

// 1) never checked
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "unchecked",
    completedIds: setOf(),
    force: false,
  }),
  false,
  "never checked must not skip"
);

// 2) checked successfully (playable) + in checkpoint
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "playable",
    completedIds: setOf("a"),
    force: false,
  }),
  true,
  "successful playable may skip on resume"
);

// 3) checked and failed + in checkpoint
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "failed",
    completedIds: setOf("a"),
    force: false,
  }),
  true,
  "failed may skip on resume unless force"
);

// 4) quarantined + in checkpoint
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "failed",
    quarantinedAt: "2026-07-01T00:00:00.000Z",
    completedIds: setOf("a"),
    force: false,
  }),
  true,
  "quarantined settled row may skip"
);

// 5) stale verification: still unchecked but id present in old checkpoint
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "unchecked",
    completedIds: setOf("a"),
    force: false,
  }),
  false,
  "stale checkpoint must not skip unchecked"
);

// 6) interrupted batch: not in checkpoint yet
assert.equal(
  shouldSkipVerification({
    stationId: "b",
    playbackStatus: "unchecked",
    completedIds: setOf("a"),
    force: false,
  }),
  false,
  "interrupted batch missing id must not skip"
);

// 7) resumed batch: already playable and in checkpoint
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "playable",
    completedIds: setOf("a", "b"),
    force: false,
  }),
  true,
  "resumed batch skips settled ids"
);

// 8) duplicate station id already completed as playable
assert.equal(
  shouldSkipVerification({
    stationId: "dup",
    playbackStatus: "playable",
    completedIds: setOf("dup"),
    force: false,
  }),
  true,
  "duplicate completed playable may skip"
);

// 9) missing checkpoint entry
assert.equal(
  shouldSkipVerification({
    stationId: "missing",
    playbackStatus: "playable",
    completedIds: setOf(),
    force: false,
  }),
  false,
  "missing checkpoint entry must not skip"
);

// 10) malformed checkpoint parsing
{
  const bad = parseVerificationCheckpoint(null);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "malformed_checkpoint_not_object");
  const badIds = parseVerificationCheckpoint({ verified_station_ids: "nope" });
  assert.equal(badIds.ok, false);
  assert.equal(badIds.reason, "malformed_verified_station_ids");
  const good = parseVerificationCheckpoint({
    verified_station_ids: ["x", ""],
    results: { x: "playable" },
  });
  assert.equal(good.ok, true);
  assert.deepEqual(good.verified_station_ids, ["x"]);
  assert.equal(good.results.x, "playable");
}

// Force reverify must recheck even with older checkpoint
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "unchecked",
    completedIds: setOf("a"),
    force: true,
  }),
  false,
  "force must recheck unchecked"
);
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "playable",
    completedIds: setOf("a"),
    force: true,
  }),
  false,
  "force must recheck playable"
);
assert.equal(
  shouldSkipVerification({
    stationId: "a",
    playbackStatus: "failed",
    completedIds: setOf("a"),
    force: true,
  }),
  false,
  "force must recheck failed"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      root_cause:
        "Checkpoint verified_station_ids meant processed-by-job, not DB-verified. Old skip ignored still-unchecked status.",
      cases_covered: 10,
    },
    null,
    2
  )
);
