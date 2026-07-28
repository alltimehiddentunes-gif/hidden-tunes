import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const { data } = await sb
    .from("sports_fixtures")
    .select(
      "id,title,status,starts_at,ends_at,country_code,playable,availability_state,competition_id,metadata"
    )
    .or(
      "title.ilike.%Bayern%,title.ilike.%Leipzig%,title.ilike.%Frankfurt%"
    )
    .limit(20);
  console.log("title matches:", data?.length);
  for (const f of data || []) console.log(JSON.stringify(f));

  const parts = await sb.from("sports_fixture_participants").select("*").limit(3);
  console.log("participant sample error", parts.error?.message);
  console.log("participant sample", JSON.stringify(parts.data?.[0]));

  const countParts = await sb
    .from("sports_fixture_participants")
    .select("id", { count: "exact", head: true });
  console.log("participant count", countParts.count);

  const bundes = await sb
    .from("sports_competitions")
    .select("id,name,slug,status")
    .ilike("name", "%Bundesliga%");
  console.log("bundesliga", bundes.data);

  if (bundes.data?.[0]) {
    const fx = await sb
      .from("sports_fixtures")
      .select("id,title,status,starts_at,country_code,playable,availability_state")
      .eq("competition_id", bundes.data[0].id)
      .limit(20);
    console.log("bundesliga fixtures", fx.data);

    for (const f of fx.data || []) {
      const p = await sb
        .from("sports_fixture_participants")
        .select("*")
        .eq("fixture_id", f.id);
      console.log("parts for", f.title, p.data);
      const sc = await sb
        .from("sports_fixture_scores")
        .select("*")
        .eq("fixture_id", f.id);
      console.log("scores for", f.title, sc.data, sc.error?.message);
    }
  }

  // status distribution for DE
  const deAll = await sb
    .from("sports_fixtures")
    .select("id,title,status")
    .eq("country_code", "DE")
    .limit(200);
  const byStatus: Record<string, number> = {};
  for (const f of deAll.data || []) {
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  }
  console.log("DE status counts", byStatus);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
