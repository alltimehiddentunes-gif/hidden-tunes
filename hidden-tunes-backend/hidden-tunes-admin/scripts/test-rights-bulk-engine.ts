import assert from "node:assert/strict";

import { InMemoryRightsEngine, type MutableRightsRecord } from "../lib/rights/memoryEngine";

function fixtures(count: number): MutableRightsRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `track-${index}`, rightsStatus: index % 2 ? "red" : "unknown",
    platforms: { ios: true }, providerId: index < count / 2 ? "djcity" : "other", version: 1,
  }));
}

const engine = new InMemoryRightsEngine(fixtures(1_000));
const snapshot = engine.createSnapshot((record) => record.providerId === "djcity" && record.platforms.ios === true);
assert.equal(snapshot.count, 500);
const dryRun = engine.preview(snapshot.id, { type: "set_platform", platform: "ios", enabled: false });
assert.equal(dryRun.wouldChange, 500);
const first = engine.execute(snapshot.id, { type: "set_platform", platform: "ios", enabled: false }, "disable-djcity-ios");
assert.equal(first.entries.length, 500);
const replay = engine.execute(snapshot.id, { type: "set_platform", platform: "ios", enabled: false }, "disable-djcity-ios");
assert.equal(replay.idempotent, true);
assert.equal(replay.id, first.id);
assert.throws(() => engine.execute(snapshot.id, { type: "set_rights_status", status: "green" }, "disable-djcity-ios"));

// Snapshot membership is immutable even after the action changes the filter field.
assert.equal(engine.get("track-0")?.platforms.ios, false);
const rollback = engine.rollback(first.id);
assert.deepEqual(rollback, { restored: 500, conflicts: [] });
assert.equal(engine.get("track-0")?.platforms.ios, true);

const conflictEngine = new InMemoryRightsEngine(fixtures(10));
const conflictSnapshot = conflictEngine.createSnapshot(() => true);
const conflictSet = conflictEngine.execute(conflictSnapshot.id, { type: "set_rights_status", status: "green" }, "green-all-001");
conflictEngine.mutateAfterChangeset("track-0", "web", true);
const conflictRollback = conflictEngine.rollback(conflictSet.id);
assert.equal(conflictRollback.conflicts.length, 1);
assert.equal(conflictRollback.restored, 9);

for (const size of [1, 100, 1_000, 10_000, 50_000, 100_000]) {
  const scale = new InMemoryRightsEngine(fixtures(size));
  const selected = scale.createSnapshot(() => true);
  assert.equal(selected.count, size);
  assert.equal(scale.preview(selected.id, { type: "set_rights_status", status: "green" }).matching, size);
}
console.log("rights bulk engine: PASS (1..100,000 records)");

