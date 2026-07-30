/**
 * Prove phone search emptiness is the client 7-day gate, not production API.
 *   npx tsx scripts/test-tv-phone-search-freshness-gate.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repro = path.join(root, "scripts/repro-tv-phone-search-path.ts");
const run = spawnSync("npx", ["tsx", repro], {
  cwd: root,
  encoding: "utf8",
  shell: true,
  timeout: 90_000,
});
assert.equal(run.status, 0, run.stderr || run.stdout);
const jsonStart = run.stdout.indexOf("{");
const payload = JSON.parse(run.stdout.slice(jsonStart));
assert.equal(payload.defect, "client_7day_freshness_hides_stale_verified");
for (const row of payload.report) {
  assert.ok(row.apiReturned > 0, `${row.q} API empty`);
  assert.equal(row.afterCommittedHead7DayGate, 0, `${row.q} should be hidden by HEAD 7-day gate`);
  assert.ok(row.afterWorkingTreeEvidenceGate > 0, `${row.q} should pass evidence gate`);
}
console.log(JSON.stringify({ ok: true, queries: payload.report.length }, null, 2));
