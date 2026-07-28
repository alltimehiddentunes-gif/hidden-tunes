import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const r = await sb
    .from("sports_competitions")
    .select("id,name,status")
    .in("status", [
      "verified",
      "scheduled",
      "live",
      "external_only",
      "degraded",
      "active",
    ])
    .order("name")
    .limit(40);
  console.log(
    "comps",
    r.error?.message,
    r.data?.map((x) => `${x.name}|${x.status}`).join("\n")
  );
  const f = await sb
    .from("sports_fixtures")
    .select("id,title,status,country_code,starts_at")
    .eq("country_code", "DE")
    .in("status", [
      "verified",
      "scheduled",
      "live",
      "external_only",
      "degraded",
      "completed",
    ])
    .order("starts_at");
  console.log("DE public", f.error?.message, f.data);
}

main().catch(console.error);
