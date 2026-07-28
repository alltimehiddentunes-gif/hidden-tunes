/**
 * Read-only source / geography snapshot for Phase 1 audit.
 */
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";

async function main() {
  loadAdminEnv(path.resolve(__dirname, ".."));
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const sources = new Map<string, number>();
  const countries = new Map<string, number>();
  const languages = new Map<string, number>();
  let from = 0;
  while (from < 50_000) {
    const { data, error } = await sb
      .from("radio_stations")
      .select("source_name,country_code,language,status,is_active,is_verified,playback_status,is_mature,quarantined_at,disabled_at,reliability_score")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const src = String(row.source_name || "unknown");
      sources.set(src, (sources.get(src) || 0) + 1);
      const isPublic =
        row.status === "approved" &&
        row.is_active === true &&
        row.is_verified === true &&
        row.playback_status === "playable" &&
        row.is_mature !== true &&
        !row.quarantined_at &&
        !row.disabled_at &&
        Number(row.reliability_score || 0) >= 60;
      if (isPublic) {
        const cc = String(row.country_code || "NULL");
        countries.set(cc, (countries.get(cc) || 0) + 1);
        const lang = String(row.language || "NULL").toLowerCase().split(",")[0].trim() || "NULL";
        languages.set(lang, (languages.get(lang) || 0) + 1);
      }
    }
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(
    JSON.stringify(
      {
        sources: Object.fromEntries([...sources.entries()].sort((a, b) => b[1] - a[1])),
        public_country_codes: countries.size,
        top_public_countries: Object.fromEntries(
          [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
        ),
        public_languages: languages.size,
        top_public_languages: Object.fromEntries(
          [...languages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
        ),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
