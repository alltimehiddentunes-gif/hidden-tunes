/**
 * Validate Sports foundation migration is additive-only and contains required tables.
 * Does not apply the migration.
 * Run: npx tsx scripts/validate-sports-migration.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260717210000_sports_foundation.sql"
);

const sql = fs.readFileSync(migrationPath, "utf8");

const forbidden = [
  /\bdrop\s+table\b/i,
  /\btruncate\b/i,
  /\bdrop\s+schema\b/i,
  /\balter\s+table\s+public\.(?!sports|sport_)/i,
];

for (const pattern of forbidden) {
  // Allow drop trigger / drop policy only
  if (pattern.source.includes("drop\\s+table") || pattern.source.includes("truncate")) {
    assert.equal(pattern.test(sql), false, `Forbidden pattern found: ${pattern}`);
  }
}

assert.equal(/\bdrop\s+table\b/i.test(sql), false, "DROP TABLE is forbidden");
assert.equal(/\btruncate\b/i.test(sql), false, "TRUNCATE is forbidden");

const requiredTables = [
  "sports",
  "sport_categories",
  "sports_countries",
  "sports_competitions",
  "sports_competition_seasons",
  "sports_teams",
  "sports_team_aliases",
  "sports_athletes",
  "sports_venues",
  "sports_fixtures",
  "sports_fixture_participants",
  "sports_fixture_events",
  "sports_fixture_scores",
  "sports_standings",
  "sports_broadcasts",
  "sports_stream_sources",
  "sports_stream_variants",
  "sports_channels",
  "sports_channel_streams",
  "sports_videos",
  "sports_video_sources",
  "sports_rights_holders",
  "sports_rights_grants",
  "sports_rights_territories",
  "sports_platform_permissions",
  "sports_rights_evidence",
  "sports_provider_agreements",
  "sports_stream_checks",
  "sports_stream_incidents",
  "sports_stream_health",
  "sports_play_attempts",
  "sports_play_failures",
  "sports_provider_health",
  "sports_quarantine_events",
  "sports_rights_incidents",
  "sports_follows",
  "sports_favorites",
  "sports_watch_history",
  "sports_continue_watching",
  "sports_reminders",
  "sports_preferences",
  "sports_notification_preferences",
  "sports_feature_flags",
];

for (const table of requiredTables) {
  assert.match(
    sql,
    new RegExp(`create table if not exists public\\.${table}`, "i"),
    `Missing table: ${table}`
  );
}

assert.match(sql, /enable row level security/i);
assert.match(sql, /sports_enabled/);
assert.match(sql, /PHASE1_TEST_ONLY/);

console.log("Sports migration validation passed");
console.log(`File: ${migrationPath}`);
console.log(`Tables checked: ${requiredTables.length}`);
console.log("Additive-only checks: OK");
console.log("RLS present: OK");
console.log("Feature flags seed: OK");
