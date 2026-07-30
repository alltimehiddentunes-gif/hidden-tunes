/**
 *   npx tsx scripts/audit-tv-pawn-and-reality-brands.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );

  const queries = [
    "Pawn Stars",
    "Pawn",
    "Storage Wars",
    "Court Cam",
    "Forged in Fire",
    "Live PD",
    "Ice Road",
    "Deadliest Catch",
    "Duck Dynasty",
    "Mountain Men",
    "Ax Men",
    "Swamp People",
  ];

  for (const q of queries) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(
        "id,title,channel_name,catalog_eligibility_tier,playback_status,is_active,disabled_at,quarantined_at,reliability_score,last_health_checked_at"
      )
      .or(`title.ilike.%${q}%,channel_name.ilike.%${q}%`)
      .limit(20);
    if (error) throw error;
    console.log(
      JSON.stringify(
        {
          q,
          n: (data || []).length,
          rows: (data || []).map((r) => ({
            id: r.id,
            title: r.title,
            tier: r.catalog_eligibility_tier,
            play: r.playback_status,
            active: r.is_active,
            dis: Boolean(r.disabled_at),
            quar: Boolean(r.quarantined_at),
            rel: r.reliability_score,
            health: Boolean(r.last_health_checked_at),
          })),
        },
        null,
        2
      )
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
