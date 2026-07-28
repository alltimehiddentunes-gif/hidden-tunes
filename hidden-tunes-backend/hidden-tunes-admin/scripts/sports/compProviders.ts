import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await sb
    .from("sports_competitions")
    .select("name,slug,status,provider_id,provider_external_id")
    .in("status", ["verified", "active"])
    .order("name");
  for (const row of data || []) {
    console.log(
      `${row.name} | provider=${row.provider_id || "NULL"} | ext=${row.provider_external_id || "-"}`
    );
  }
}

main().catch(console.error);
