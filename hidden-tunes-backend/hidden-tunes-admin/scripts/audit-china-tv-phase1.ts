/**
 * Phase 1 China TV catalog ownership + count audit (read-only).
 *   npx tsx scripts/audit-china-tv-phase1.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAdminEnv } from "../lib/radioExpansion25k/env";

const adminRoot = path.resolve(__dirname, "..");
loadAdminEnv(adminRoot);

const OUT = path.join(adminRoot, "data", "china-tv-deep");

type Row = Record<string, unknown>;

async function fetchByRegion(
  sb: ReturnType<typeof createClient>,
  codes: string[]
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const code of codes) {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("tv_videos")
        .select(
          "id,title,channel_name,region,language,source_url,source_type,status,playback_status,is_active,reliability_score,quarantined_at,disabled_at,tags,validated_stream_url,ios_playable,android_playable,stream_protocol,last_health_error,last_validation_result,consecutive_failures"
        )
        .eq("region", code)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${error.message} region=${code}`);
      rows.push(...((data || []) as Row[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return rows;
}

async function fetchTitleHints(sb: ReturnType<typeof createClient>): Promise<Row[]> {
  const rows: Row[] = [];
  for (const term of ["CCTV", "CGTN", "中国", "中华"]) {
    const PAGE = 500;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("tv_videos")
        .select(
          "id,title,channel_name,region,language,source_url,source_type,status,playback_status,is_active,reliability_score,quarantined_at,disabled_at,tags,validated_stream_url,ios_playable,android_playable,stream_protocol,last_health_error,last_validation_result,consecutive_failures"
        )
        .or(`title.ilike.%${term}%,channel_name.ilike.%${term}%`)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${error.message} term=${term}`);
      rows.push(...((data || []) as Row[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return rows;
}

function stats(rows: Row[]) {
  const verified = rows.filter(
    (r) => r.playback_status === "playable" || Number(r.reliability_score || 0) >= 60
  );
  const pub = rows.filter(
    (r) =>
      r.is_active && r.status === "approved" && !r.disabled_at && !r.quarantined_at
  );
  const playable = rows.filter(
    (r) =>
      r.is_active &&
      r.status === "approved" &&
      r.playback_status === "playable" &&
      !r.disabled_at &&
      !r.quarantined_at
  );
  const quarantined = rows.filter((r) => r.quarantined_at || r.disabled_at);
  const dead = rows.filter((r) =>
    ["failed", "blocked", "deleted", "private"].includes(String(r.playback_status || ""))
  );
  const urls = new Map<string, string>();
  let dups = 0;
  for (const r of rows) {
    const k = String(r.source_url || "")
      .trim()
      .replace(/\/+$/, "")
      .toLowerCase();
    if (!k) continue;
    if (urls.has(k)) dups += 1;
    else urls.set(k, String(r.id));
  }
  const webpage = rows.filter((r) =>
    /youtube|bilibili|douyin|iqiyi|youku|facebook|twitch|\.html?(?:\?|$)/i.test(
      String(r.source_url || "")
    )
  );
  return {
    total: rows.length,
    verified: verified.length,
    public: pub.length,
    playable: playable.length,
    quarantined: quarantined.length,
    dead: dead.length,
    duplicate_urls: dups,
    webpage_urls: webpage.length,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error(JSON.stringify({ error: "MISSING_ENV", hasUrl: !!url, hasKey: !!key }));
    process.exit(2);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  fs.mkdirSync(OUT, { recursive: true });

  const byId = new Map<string, Row>();
  console.log("Fetching region exact codes...");
  for (const row of await fetchByRegion(sb, [
    "CN",
    "China",
    "HK",
    "Hong Kong",
    "MO",
    "Macao",
    "Macau",
    "TW",
    "Taiwan",
  ])) {
    byId.set(String(row.id), row);
  }
  console.log("region rows", byId.size);

  console.log("Fetching title hints...");
  for (const row of await fetchTitleHints(sb)) {
    if (!byId.has(String(row.id))) byId.set(String(row.id), row);
  }
  console.log("combined rows", byId.size);

  const all = [...byId.values()];
  const mainland = all.filter((r) => {
    const region = String(r.region || "")
      .trim()
      .toUpperCase();
    if (["HK", "HONG KONG", "MO", "MACAO", "MACAU", "TW", "TAIWAN"].includes(region)) {
      return false;
    }
    if (region === "CN" || region === "CHINA") return true;
    return /CCTV|CGTN|中国|中华人民共和国/i.test(
      `${String(r.title || "")} ${String(r.channel_name || "")}`
    );
  });
  const hk = all.filter((r) =>
    ["HK", "HONG KONG"].includes(
      String(r.region || "")
        .trim()
        .toUpperCase()
    )
  );
  const mo = all.filter((r) =>
    ["MO", "MACAO", "MACAU"].includes(
      String(r.region || "")
        .trim()
        .toUpperCase()
    )
  );
  const tw = all.filter((r) =>
    ["TW", "TAIWAN"].includes(
      String(r.region || "")
        .trim()
        .toUpperCase()
    )
  );

  const summary = {
    at: new Date().toISOString(),
    db_url_host: (() => {
      try {
        return new URL(url).host;
      } catch {
        return "unknown";
      }
    })(),
    mainland: stats(mainland),
    hk: stats(hk),
    mo: stats(mo),
    tw: stats(tw),
    mainland_sample: mainland.slice(0, 20).map((r) => ({
      id: r.id,
      title: r.title,
      region: r.region,
      status: r.status,
      playback: r.playback_status,
      active: r.is_active,
      score: r.reliability_score,
      url: String(r.source_url || "").slice(0, 120),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(OUT, "phase1-catalog-snapshot.json"),
    JSON.stringify({ summary, mainland, hk, mo, tw }, null, 2)
  );
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
