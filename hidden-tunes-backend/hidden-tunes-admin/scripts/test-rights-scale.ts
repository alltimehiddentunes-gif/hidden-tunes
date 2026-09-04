import assert from "node:assert/strict";

import { runDryRun, type DryRunTarget } from "../lib/rights/dryRun";

function* targets(count: number): Generator<DryRunTarget> {
  for (let index = 0; index < count; index++) {
    yield { id: String(index), rightsStatus: "unknown", platformEnabled: true, providerInherited: true };
  }
}

const started = performance.now();
const result = runDryRun(targets(900_001), { type: "set_platform", platform: "ios", enabled: false });
const elapsedMs = Math.round(performance.now() - started);
assert.equal(result.summary.matching, 900_001);
assert.equal(result.summary.wouldChange, 900_001);
assert.equal(result.summary.proposedDisabled, 900_001);
assert.ok(process.memoryUsage().heapUsed < 256 * 1024 * 1024, "streaming scale dry run exceeded 256 MiB heap");
console.log(`rights scale: PASS (900,001 records, ${elapsedMs}ms, ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MiB heap)`);

