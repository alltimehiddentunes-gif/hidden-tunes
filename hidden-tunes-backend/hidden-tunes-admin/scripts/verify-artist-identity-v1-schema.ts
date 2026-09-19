import { supabaseAdmin } from "../lib/supabaseAdmin";

async function main() {
  const checks = [
    ["artists_v1_columns", () => supabaseAdmin.from("artists").select("id,canonical_name,sort_name,biography,avatar_url,hero_image_url,verification_state,profile_state").limit(1)],
    ["artist_aliases_v1_columns", () => supabaseAdmin.from("artist_aliases").select("id,alias_type,locale,source,status").limit(1)],
    ["artist_external_ids_v1_columns", () => supabaseAdmin.from("artist_external_ids").select("id,source,confidence,status,is_public,updated_at").limit(1)],
    ["artist_credits_v1_columns", () => supabaseAdmin.from("artist_credits").select("id,content_type,content_id,credit_role,display_name,position,source,status").limit(1)],
    ["artist_moods_table", () => supabaseAdmin.from("artist_moods").select("id,artist_id,mood,status").limit(1)],
  ] as const;
  const results = [];
  for (const [name, run] of checks) {
    const result = await run();
    results.push({ name, ok: !result.error, errorCode: result.error?.code ?? null });
  }
  console.log(JSON.stringify({ readOnly: true, ok: results.every((result) => result.ok), checks: results }, null, 2));
  if (!results.every((result) => result.ok)) process.exitCode = 2;
}

void main();
