/**
 * Quick multi-country TV catalog counts for deep-import reports.
 * npx tsx scripts/audit-tv-deep-top10-counts.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const COUNTRIES: Array<{ code: string; aliases: string[] }> = [
  { code: "RU", aliases: ["Russia", "Russian Federation"] },
  { code: "CN", aliases: ["China"] },
  { code: "US", aliases: ["USA", "United States", "United States of America"] },
  { code: "GB", aliases: ["UK", "United Kingdom"] },
  { code: "ES", aliases: ["Spain"] },
  { code: "IN", aliases: ["India"] },
  { code: "UA", aliases: ["Ukraine"] },
  { code: "TR", aliases: ["Turkey", "Türkiye"] },
  { code: "FR", aliases: ["France"] },
  { code: "RO", aliases: ["Romania"] },
];

function isPlayable(row: any) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.playback_status === "playable" &&
    Number(row.reliability_score ?? 100) >= 60 &&
    !row.quarantined_at &&
    !row.disabled_at
  );
}

async function countFor(code: string, aliases: string[]) {
  const sb = getSupabaseAdmin();
  const rows: any[] = [];
  const seen = new Set<string>();
  const regions = [code, ...aliases];
  for (const region of regions) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("tv_videos")
        .select(
          "id,title,region,status,is_active,playback_status,reliability_score,quarantined_at,disabled_at,is_public,ios_playable,android_playable"
        )
        .eq("region", region)
        .range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;
      for (const r of data) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        rows.push(r);
      }
      if (data.length < 1000) break;
    }
  }
  const playable = rows.filter(isPlayable);
  const publicRows = rows.filter((r) => r.is_public === true || isPlayable(r));
  return {
    code,
    total: rows.length,
    playable: playable.length,
    public: publicRows.length,
    quarantined: rows.filter((r) => r.quarantined_at).length,
    disabled: rows.filter((r) => r.disabled_at).length,
    iosPlayable: playable.filter((r) => r.ios_playable !== false).length,
    androidPlayable: playable.filter((r) => r.android_playable !== false).length,
  };
}

async function main() {
  const outDir = path.join(adminRoot, "data", "tv-deep-import-top10");
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const c of COUNTRIES) {
    console.log(`[audit] ${c.code}...`);
    const row = await countFor(c.code, c.aliases);
    console.log(JSON.stringify(row));
    results.push(row);
  }
  const payload = {
    at: new Date().toISOString(),
    workspace: adminRoot,
    results,
  };
  const out = path.join(outDir, "00-live-country-counts.json");
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ out, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
