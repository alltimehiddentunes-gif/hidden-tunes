import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MusicTaxonomyValidationError,
  musicTaxonomyDraftToAssignments,
  normalizeMusicSource,
  normalizeMusicTaxonomyDraft,
  normalizeTaxonomyLabel,
  slugifyTaxonomy,
} from "../lib/musicTaxonomy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260909120000_music_taxonomy_foundation.sql"),
  "utf8"
);
const rollback = fs.readFileSync(
  path.join(root, "supabase/migrations/rollback/20260909120000_music_taxonomy_foundation_rollback.sql"),
  "utf8"
);

assert.equal(normalizeTaxonomyLabel("R&B"), "r and b");
assert.equal(slugifyTaxonomy("Reggaetón"), "reggaeton");
assert.equal(normalizeMusicSource(undefined).sourceKey, "mureka");
assert.throws(
  () => normalizeMusicSource({ sourceKey: "djcity" }),
  (error) => error instanceof MusicTaxonomyValidationError && /explicitly/i.test(error.message)
);
assert.equal(normalizeMusicSource({ sourceKey: "djcity", isExplicit: true }).sourceLabel, "DJcity");

const draft = normalizeMusicTaxonomyDraft({
  primaryGenreId: "genre-afrobeats",
  secondaryGenreIds: ["genre-rnb", "genre-rnb"],
  subgenreIds: ["sub-a", "sub-b"],
  moodIds: "mood-1,mood-2",
  languageIds: ["en"],
  tempoClassId: "tempo-upbeat",
}, { requirePrimaryGenre: true });
const assignments = musicTaxonomyDraftToAssignments(draft);
assert.equal(assignments.filter((item) => item.relationship_type === "PRIMARY_GENRE").length, 1);
assert.equal(assignments.filter((item) => item.relationship_type === "SECONDARY_GENRE").length, 1);
assert.equal(assignments.filter((item) => item.relationship_type === "MOOD").length, 2);
assert.equal(assignments.find((item) => item.relationship_type === "TEMPO_CLASS")?.term_id, "tempo-upbeat");

assert.match(migration, /create table if not exists public\.music_taxonomy_terms/);
assert.match(migration, /create table if not exists public\.music_track_taxonomy/);
assert.match(migration, /create table if not exists public\.music_track_sources/);
assert.match(migration, /create table if not exists public\.music_track_legacy_metadata/);
assert.match(migration, /slug":"afrobeats"/);
assert.match(migration, /slug":"afrobeat"/);
assert.match(migration, /'GENRE','kompa','Compas'/);
assert.match(migration, /create or replace function public\.merge_music_taxonomy_term/);
assert.doesNotMatch(migration, /alter\s+table\s+public\.songs/i);
assert.doesNotMatch(migration, /drop\s+table\s+public\.songs/i);
assert.match(rollback, /drop function if exists public\.merge_music_taxonomy_term/);
assert.match(rollback, /drop table if exists public\.music_taxonomy_terms/);
assert.doesNotMatch(rollback, /drop table if exists public\.songs/i);

const uploadRoute = fs.readFileSync(path.join(root, "app/api/admin/upload-track/route.ts"), "utf8");
assert.match(uploadRoute, /source_name:\s*"Hidden Tunes"/);
assert.match(uploadRoute, /source_type:\s*"r2"/);
assert.match(uploadRoute, /persistMusicTrackClassification/);
assert.match(uploadRoute, /musicSource/);

const panel = fs.readFileSync(path.join(root, "components/BulkUploadPanel.tsx"), "utf8");
assert.match(panel, /MusicTaxonomyControls/);
assert.match(panel, /Apply Taxonomy To Selected/);
assert.match(panel, /Copy Previous Row Classification/);
assert.match(panel, /const API_UPLOAD_URL = "\/api\/admin\/upload-track"/);
assert.match(panel, /const API_SIGNED_UPLOAD_URL = "\/api\/upload-url"/);

for (const relativePath of [
  "app/admin/music/taxonomy/page.tsx",
  "app/admin/music/tracks/[id]/classification/page.tsx",
  "app/api/admin/music/taxonomy/route.ts",
  "app/api/admin/music/taxonomy/[id]/route.ts",
  "app/api/admin/music/taxonomy/[id]/aliases/route.ts",
  "app/api/admin/music/taxonomy/[id]/merge/route.ts",
  "app/api/admin/music/taxonomy/health/route.ts",
  "app/api/admin/music/tracks/[id]/classification/route.ts",
  "app/api/music/taxonomy/route.ts",
]) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
}

console.log("music-taxonomy-static: PASS");
