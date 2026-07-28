/**
 * Snapshot Africa public radio counts by country_code.
 *   npx tsx scripts/run-radio-africa-public-snapshot.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { AFRICA_RADIO_QUEUE } from "@/lib/radioAfricaExpansion/africanCountries";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { RADIO_PUBLIC_RELIABILITY_THRESHOLD } from "@/lib/radioPublicCatalog";

const adminRoot = path.resolve(__dirname, "..");

async function main() {
  loadAdminEnv(adminRoot);
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const rows = [];
  for (const c of AFRICA_RADIO_QUEUE) {
    const { count } = await supabase
      .from("radio_stations")
      .select("id", { count: "exact", head: true })
      .eq("country_code", c.code)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("is_verified", true)
      .eq("playback_status", "playable")
      .eq("is_mature", false)
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD);
    rows.push({ code: c.code, name: c.name, public: count || 0 });
  }
  rows.sort((a, b) => a.public - b.public || a.code.localeCompare(b.code));
  const zeros = rows.filter((r) => r.public === 0);
  const thin = rows.filter((r) => r.public > 0 && r.public < 10);
  const total = rows.reduce((s, r) => s + r.public, 0);
  const out = {
    total_public_africa: total,
    zeros: zeros.length,
    thin_lt_10: thin.length,
    zero_countries: zeros,
    thin_countries: thin,
    all: rows,
    finished_at: new Date().toISOString(),
  };
  const outPath = path.join(adminRoot, "data/radio-africa-reports/africa-public-snapshot.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        total_public_africa: total,
        zeros: zeros.length,
        thin_lt_10: thin.length,
        zero_countries: zeros.map((z) => z.code),
        thin_countries: thin.map((t) => `${t.code}:${t.public}`),
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
