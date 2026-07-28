/**
 * Read-only Sports data audit against production Supabase.
 * Run: npx tsx scripts/sports/auditSportsData.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const catalog = await sb
    .from("sports_competitions")
    .select("id,name,slug,status,country_code")
    .or("name.ilike.%iptv%,name.ilike.%TV Catalog%,name.ilike.%Free-TV%,slug.ilike.%iptv%")
    .limit(50);
  console.log("catalog competitions:", catalog.data?.length, catalog.error?.message);
  for (const c of (catalog.data || []).slice(0, 10)) {
    console.log(`  ${c.status} | ${c.country_code} | ${c.slug} | ${c.name}`);
  }

  const real = await sb
    .from("sports_competitions")
    .select("id,name,slug,status,country_code")
    .not("name", "ilike", "%iptv%")
    .not("name", "ilike", "%TV Catalog%")
    .not("name", "ilike", "%Free-TV%")
    .not("slug", "ilike", "%iptv%")
    .in("status", ["active", "verified", "published"])
    .limit(30);
  console.log("\nnon-catalog competitions:", real.data?.length, real.error?.message);
  for (const c of real.data || []) {
    console.log(`  ${c.country_code || "--"} | ${c.status} | ${c.name}`);
  }

  const withTeams = await sb
    .from("sports_fixture_participants")
    .select("fixture_id, team_id, side")
    .not("team_id", "is", null)
    .limit(20);
  console.log(
    "\nparticipants with team_id:",
    withTeams.data?.length,
    withTeams.error?.message
  );

  const fixtureIds = [...new Set((withTeams.data || []).map((p) => p.fixture_id))];
  if (fixtureIds.length) {
    const fx = await sb
      .from("sports_fixtures")
      .select(
        "id,title,status,starts_at,country_code,playable,availability_state,competition_id"
      )
      .in("id", fixtureIds.slice(0, 10));
    console.log("\nfixtures with real team links:");
    for (const f of fx.data || []) {
      console.log(
        `  ${f.status} avail=${f.availability_state} playable=${f.playable} ${f.country_code} | ${f.title}`
      );
    }
  }

  const de = await sb
    .from("sports_fixtures")
    .select("id,title,status,competition_id,country_code")
    .eq("country_code", "DE")
    .limit(10);
  console.log("\nDE fixtures raw:", de.data?.length);
  for (const f of de.data || []) {
    console.log(`  ${f.status} | ${f.title?.slice(0, 70)}`);
  }

  const providers = await sb
    .from("sports_providers")
    .select("slug,name,enabled,status,kill_switch")
    .limit(20);
  console.log("\nproviders:", providers.error?.message || "");
  for (const p of providers.data || []) {
    console.log(`  ${p.slug} enabled=${p.enabled} kill=${p.kill_switch} status=${p.status}`);
  }

  const scores = await sb
    .from("sports_fixture_scores")
    .select("fixture_id, home_score, away_score, updated_at")
    .limit(10);
  console.log("\nscores sample:", scores.data?.length, scores.error?.message);
  for (const s of scores.data || []) {
    console.log(`  ${s.fixture_id} ${s.home_score}-${s.away_score} @ ${s.updated_at}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
