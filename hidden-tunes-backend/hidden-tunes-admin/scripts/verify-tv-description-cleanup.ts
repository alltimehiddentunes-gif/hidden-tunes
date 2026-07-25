/**
 * Post-cleanup verification for TV public descriptions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sanitizePublicTvDescription } from "../lib/tvDescriptionSanitizer";
import { toTvPublicStation } from "../lib/tvCatalog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");

function loadEnv(file: string) {
  const p = path.join(adminRoot, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnv(".env.local");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const pageSize = 1000;
  let from = 0;
  let remainingInternal = 0;
  let withDesc = 0;
  const leftover: Array<{ id: string; title: string; description: string }> = [];

  while (true) {
    const { data, error } = await sb
      .from("tv_videos")
      .select("id,title,description,region,source_key")
      .not("description", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    withDesc += rows.length;
    for (const row of rows) {
      const result = sanitizePublicTvDescription(row.description);
      if (result.rejected) {
        remainingInternal += 1;
        if (leftover.length < 20) {
          leftover.push({
            id: row.id,
            title: row.title,
            description: String(row.description).slice(0, 300),
          });
        }
      }
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const samples: Record<string, unknown> = {};

  const { data: rtm } = await sb
    .from("tv_videos")
    .select("id,title,description,region,source_key,status,playback_status,is_active")
    .eq("id", "8f30fc88-416a-4e44-bf1f-0d07399b562d")
    .maybeSingle();
  samples.rtm_plus = {
    ...rtm,
    public: rtm ? toTvPublicStation(rtm as Record<string, unknown>).description : null,
  };

  for (const [label, filter] of [
    ["africa_za", { column: "region", value: "ZA" }],
    ["europe_cz", { column: "region", value: "CZ" }],
    ["europe_fr", { column: "region", value: "FR" }],
    ["us", { column: "region", value: "US" }],
    ["canada", { column: "region", value: "CA" }],
  ] as const) {
    const { data } = await sb
      .from("tv_videos")
      .select("id,title,description,region,source_key,created_at")
      .eq(filter.column, filter.value)
      .order("created_at", { ascending: false })
      .limit(5);
    samples[label] = (data || []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      public_description: toTvPublicStation(row as Record<string, unknown>).description,
      source_key: row.source_key,
    }));
  }

  // Pattern residual scan (escape LIKE wildcards: _ and %)
  const patterns = [
    "discovered via",
    "country-channel-website",
    "country_channel_website",
    "Legal basis:",
    "Provider:",
    "deep-source candidate",
    "Europe deep city search",
  ];
  const patternHits: Record<string, number> = {};
  for (const p of patterns) {
    const escaped = p.replace(/[%_]/g, (ch) => `\\${ch}`);
    const { count } = await sb
      .from("tv_videos")
      .select("id", { count: "exact", head: true })
      .ilike("description", `%${escaped}%`);
    patternHits[p] = count || 0;
  }

  // Explicit underscore-slug check via sanitizer (avoids SQL _ wildcard false positives)
  const { data: underscoreCandidates } = await sb
    .from("tv_videos")
    .select("id,title,description")
    .not("description", "is", null)
    .ilike("description", "%national%");
  const underscoreSlugHits = (underscoreCandidates || []).filter((row) =>
    /_(?:national|regional|local)\b/i.test(String(row.description || ""))
  );
  const out = {
    remaining_with_description: withDesc,
    remaining_internal: remainingInternal,
    leftover,
    patternHits,
    underscore_slug_hits: underscoreSlugHits.length,
    samples,
    ok:
      remainingInternal === 0 &&
      underscoreSlugHits.length === 0 &&
      Object.values(patternHits).every((n) => n === 0),
  };

  const outPath = path.join(
    adminRoot,
    "data",
    "tv-description-cleanup",
    "POST-CLEANUP-VERIFY.json"
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
  if (!out.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
