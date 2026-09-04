import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("supabase/migrations/20260903120000_rights_control_center_foundation.sql"), "utf8");
const seed = readFileSync(resolve("supabase/migrations/20260903121000_rights_control_center_providers.sql"), "utf8");
for (const table of ["rights_catalog_items", "rights_filter_snapshots", "rights_bulk_jobs", "rights_bulk_job_targets", "rights_changesets", "rights_audit_log", "rights_policies", "rights_licenses", "rights_evidence"]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
}
for (const source of ["songs", "radio_stations", "tv_videos", "podcast_episodes", "audiobooks"]) {
  assert.doesNotMatch(migration, new RegExp(`(?:update|insert\\s+into|delete\\s+from)\\s+(?:public\\.)?${source}\\b`, "i"));
}
assert.match(migration, /enable row level security/gi);
assert.match(migration, /rights audit records are append-only/i);
assert.match(seed, /on conflict \(slug\) do nothing/i);
assert.doesNotMatch(seed, /rights_policies/i);
console.log("rights migrations static safety: PASS");

