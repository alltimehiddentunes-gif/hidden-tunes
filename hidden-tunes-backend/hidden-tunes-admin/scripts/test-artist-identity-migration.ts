import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve("supabase/migrations/20260813120000_artist_identity_v1_contract.sql"), "utf8").toLowerCase();
const baseSql = readFileSync(resolve("supabase/migrations/20260713150000_artist_profile_infrastructure.sql"), "utf8").toLowerCase();
for (const forbidden of ["delete from", "update public.artists", "drop table", "drop column", "truncate", "merge into"]) {
  assert.equal(sql.includes(forbidden), false, `migration contains forbidden operation: ${forbidden}`);
}
assert.match(sql, /add column if not exists canonical_name/);
assert.match(sql, /artist_aliases_normalized_status_idx/);
assert.match(sql, /artist_external_ids_artist_status_idx/);
assert.match(sql, /unique \(artist_id, mood\)/);
assert.match(baseSql, /unique \(provider, external_id\)/, "provider external IDs must already be globally unique");
console.log("Artist identity v1 additive migration safety tests passed.");
