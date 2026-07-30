/**
 * Extra breakdowns for evidence-based availability audit (read-only).
 *   npx tsx scripts/audit-tv-evidence-breakdown.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchAllStale() {
  const sb = getSupabaseAdmin();
  const d7 = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const rows: Array<Record<string, unknown>> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(
        "id,region,category,source_type,last_health_checked_at,last_health_error,consecutive_failures,reliability_score,source_url"
      )
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable")
      .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .eq("stream_is_https", true)
      .eq("ios_playable", true)
      .eq("android_playable", true)
      .lt("last_health_checked_at", d7)
      .not("last_health_checked_at", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    from += 1000;
    if (data.length < 1000) break;
  }
  return rows;
}

function top(map: Record<string, number>, n = 20) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function hostOf(url: unknown) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase() || "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

async function main() {
  const rows = await fetchAllStale();
  const now = Date.now();
  const age: Record<string, number> = {
    "8-14d": 0,
    "15-21d": 0,
    "22-30d": 0,
    "31-45d": 0,
    "46-90d": 0,
    "90d+": 0,
  };
  const byCountry: Record<string, number> = {};
  const byCat: Record<string, number> = {};
  const bySrc: Record<string, number> = {};
  const byHost: Record<string, number> = {};
  const errReasons: Record<string, number> = {};
  let withError = 0;
  let withFailures = 0;

  for (const r of rows) {
    const ageMs = now - new Date(String(r.last_health_checked_at)).getTime();
    const days = ageMs / DAY_MS;
    if (days <= 14) age["8-14d"] += 1;
    else if (days <= 21) age["15-21d"] += 1;
    else if (days <= 30) age["22-30d"] += 1;
    else if (days <= 45) age["31-45d"] += 1;
    else if (days <= 90) age["46-90d"] += 1;
    else age["90d+"] += 1;

    const region = String(r.region || "UNKNOWN").toUpperCase() || "UNKNOWN";
    byCountry[region] = (byCountry[region] || 0) + 1;
    const cat = String(r.category || "UNKNOWN");
    byCat[cat] = (byCat[cat] || 0) + 1;
    const src = String(r.source_type || "UNKNOWN");
    bySrc[src] = (bySrc[src] || 0) + 1;
    const host = hostOf(r.source_url);
    byHost[host] = (byHost[host] || 0) + 1;
    if (r.last_health_error) {
      withError += 1;
      const e = String(r.last_health_error).slice(0, 100);
      errReasons[e] = (errReasons[e] || 0) + 1;
    }
    if (Number(r.consecutive_failures || 0) > 0) withFailures += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: "read-only",
        stalePreviouslyVerifiedCount: rows.length,
        ageOfLastSuccess: age,
        consecutiveFailuresGt0: withFailures,
        lastHealthErrorSet: withError,
        topCountries: top(byCountry, 30),
        topCategories: top(byCat, 20),
        topSourceTypes: top(bySrc, 15),
        topHosts: top(byHost, 25),
        errorReasons: top(errReasons, 15),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
