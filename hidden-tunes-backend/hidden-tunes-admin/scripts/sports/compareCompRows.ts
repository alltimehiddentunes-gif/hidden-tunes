import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  for (const name of [
    "AFL Official",
    "Bundesliga (Test)",
    "Premier League (Test)",
  ]) {
    const { data } = await sb
      .from("sports_competitions")
      .select("*")
      .eq("name", name)
      .maybeSingle();
    console.log(
      name,
      JSON.stringify(
        data && {
          id: data.id,
          status: data.status,
          slug: data.slug,
          metadata: data.metadata,
          published_at: (data as { published_at?: string }).published_at,
          keys: Object.keys(data),
        },
        null,
        2
      )
    );
  }

  // Exact same query shape as competitions route listPaginated
  const { data, error } = await sb
    .from("sports_competitions")
    .select(
      "id, name, slug, short_name, sport_id, country_code, competition_type, artwork_url, status"
    )
    .in("status", [
      "verified",
      "scheduled",
      "live",
      "external_only",
      "degraded",
      "active",
      "verified",
    ])
    .order("name", { ascending: true })
    .range(0, 49);
  console.log("listPaginated shape count", data?.length, error?.message);
  console.log(data?.map((d) => d.name).join(" | "));
}

main().catch(console.error);
