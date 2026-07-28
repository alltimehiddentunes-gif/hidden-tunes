import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const de = await sb
    .from("sports_fixtures")
    .select(
      "id,title,status,starts_at,country_code,playable,availability_state,competition_id"
    )
    .eq("country_code", "DE")
    .limit(20);
  console.log("DE fixtures", de.data);

  const scheduled = await sb
    .from("sports_fixtures")
    .select("id,title,status,starts_at,country_code")
    .eq("status", "scheduled")
    .gte("starts_at", new Date().toISOString())
    .limit(20);
  console.log("future scheduled", scheduled.data);

  const completed = await sb
    .from("sports_fixtures")
    .select("id,title,status,starts_at,country_code")
    .eq("status", "completed")
    .limit(20);
  console.log("completed", completed.data);

  for (const f of [...(de.data || []), ...(scheduled.data || [])].slice(0, 5)) {
    const p = await sb
      .from("sports_fixture_participants")
      .select("side, team_id")
      .eq("fixture_id", f.id);
    const s = await sb
      .from("sports_fixture_scores")
      .select("home_score, away_score")
      .eq("fixture_id", f.id);
    console.log(f.title, "parts", p.data, "scores", s.data);
  }

  const comps = await sb
    .from("sports_competitions")
    .select("id,name,status")
    .in("status", ["verified", "active"])
    .limit(30);
  console.log(
    "verified comps",
    comps.data?.map((c) => `${c.status}|${c.name}`)
  );
}

main().catch(console.error);
