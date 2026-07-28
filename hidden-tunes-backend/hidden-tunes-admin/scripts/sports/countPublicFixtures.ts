import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const statuses = [
    "verified",
    "scheduled",
    "live",
    "external_only",
    "degraded",
    "completed",
    "postponed",
    "cancelled",
  ];
  const { data, error, count } = await sb
    .from("sports_fixtures")
    .select("id,title,status,starts_at", { count: "exact" })
    .in("status", statuses)
    .order("starts_at", { ascending: true })
    .range(0, 49);
  console.log("count", count, "rows", data?.length, error?.message);
  console.log(
    data
      ?.map((d) => `${d.status} ${d.starts_at?.slice(0, 10)} ${d.title?.slice(0, 50)}`)
      .join("\n")
  );
}

main().catch(console.error);
