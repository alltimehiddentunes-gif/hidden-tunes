/** Paginated production baseline for the 54-country Africa TV audit. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase audit rows are intentionally schema-tolerant. */
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const countries = [
  ["DZ", "Algeria"], ["AO", "Angola"], ["BJ", "Benin"], ["BW", "Botswana"],
  ["BF", "Burkina Faso"], ["BI", "Burundi"], ["CV", "Cabo Verde"], ["CM", "Cameroon"],
  ["CF", "Central African Republic"], ["TD", "Chad"], ["KM", "Comoros"],
  ["CD", "Democratic Republic of the Congo"], ["CG", "Republic of the Congo"],
  ["CI", "Côte d’Ivoire"], ["DJ", "Djibouti"], ["EG", "Egypt"], ["GQ", "Equatorial Guinea"],
  ["ER", "Eritrea"], ["SZ", "Eswatini"], ["ET", "Ethiopia"], ["GA", "Gabon"],
  ["GM", "The Gambia"], ["GH", "Ghana"], ["GN", "Guinea"], ["GW", "Guinea-Bissau"],
  ["KE", "Kenya"], ["LS", "Lesotho"], ["LR", "Liberia"], ["LY", "Libya"],
  ["MG", "Madagascar"], ["MW", "Malawi"], ["ML", "Mali"], ["MR", "Mauritania"],
  ["MU", "Mauritius"], ["MA", "Morocco"], ["MZ", "Mozambique"], ["NA", "Namibia"],
  ["NE", "Niger"], ["NG", "Nigeria"], ["RW", "Rwanda"], ["ST", "São Tomé and Príncipe"],
  ["SN", "Senegal"], ["SC", "Seychelles"], ["SL", "Sierra Leone"], ["SO", "Somalia"],
  ["ZA", "South Africa"], ["SS", "South Sudan"], ["SD", "Sudan"], ["TZ", "Tanzania"],
  ["TG", "Togo"], ["TN", "Tunisia"], ["UG", "Uganda"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"],
] as const;

const aliases: Record<string, string[]> = {
  CI: ["Cote d'Ivoire", "Cote dIvoire", "Ivory Coast"], CD: ["DR Congo", "DRC", "Congo-Kinshasa"],
  CG: ["Congo", "Congo-Brazzaville"], CV: ["Cape Verde"], GM: ["Gambia"], SZ: ["Swaziland"],
  ST: ["Sao Tome and Principe"], TZ: ["United Republic of Tanzania"],
};

function playable(r: any) {
  return r.status === "approved" && r.is_active === true && r.playback_status === "playable" &&
    Number(r.reliability_score ?? 100) >= 60 && !r.quarantined_at && !r.disabled_at;
}

async function fetchRegion(region: string) {
  const sb = getSupabaseAdmin(); const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("tv_videos")
      .select("id,title,region,status,is_active,playback_status,reliability_score,quarantined_at,disabled_at,is_public")
      .eq("region", region).range(from, from + 999);
    if (error) throw error; rows.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const results = [];
  for (const [code, name] of countries) {
    const seen = new Map<string, any>();
    for (const region of [code, name, ...(aliases[code] || [])]) {
      for (const row of await fetchRegion(region)) seen.set(row.id, row);
    }
    const rows = [...seen.values()];
    results.push({ code, country: name, total: rows.length, playable: rows.filter(playable).length,
      publicPlayable: rows.filter(r => playable(r) && r.is_public !== false).length,
      quarantined: rows.filter(r => Boolean(r.quarantined_at)).length });
  }
  console.log(JSON.stringify({ database: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    totals: { records: results.reduce((n,r)=>n+r.total,0), playable: results.reduce((n,r)=>n+r.playable,0),
      publicPlayable: results.reduce((n,r)=>n+r.publicPlayable,0), quarantined: results.reduce((n,r)=>n+r.quarantined,0),
      countriesRepresented: results.filter(r=>r.total>0).map(r=>r.country) }, results }, null, 2));
}
main().catch(error => { console.error(error); process.exit(1); });
