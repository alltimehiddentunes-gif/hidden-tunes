import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getValidationFreshnessCutoff,
  isTvStationEligibleForPlatform,
} from "@/lib/tvPlatformPolicy";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyTvHealthProbe, probeTvStation, TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const EXPANSION_TAG_PREFIX = "expansion:";
const DEFAULT_SINCE = "2026-07-14T14:47:00.000Z";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

type TvRow = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  source_url: string | null;
  embed_url: string | null;
  title: string | null;
  status: string | null;
  is_active: boolean | null;
  playback_status: string | null;
  reliability_score: number | null;
  disabled_at: string | null;
  quarantined_at: string | null;
  last_health_checked_at: string | null;
  ios_playable: boolean | null;
  android_playable: boolean | null;
  stream_is_https: boolean | null;
  tags: string[] | null;
  created_at: string | null;
};

function hasExpansionTag(tags: string[] | null | undefined) {
  return (tags || []).some((tag) => String(tag).startsWith(EXPANSION_TAG_PREFIX));
}

function countWhere(rows: TvRow[], predicate: (row: TvRow) => boolean) {
  return rows.filter(predicate).length;
}

async function fetchRecentImports(sinceIso: string) {
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select(
      "id, source_type, source_id, source_url, embed_url, title, status, is_active, playback_status, reliability_score, disabled_at, quarantined_at, last_health_checked_at, ios_playable, android_playable, stream_is_https, tags, created_at"
    )
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message);

  const rows = (data || []) as TvRow[];
  const expansionRows = rows.filter((row) => hasExpansionTag(row.tags));
  return expansionRows.length > 0 ? expansionRows : rows;
}

function countCrossPlatformEligible(rows: TvRow[]) {
  return countWhere(rows, (row) =>
    isTvStationEligibleForPlatform(
      {
        status: row.status,
        is_active: row.is_active,
        playback_status: row.playback_status,
        reliability_score: row.reliability_score,
        disabled_at: row.disabled_at,
        quarantined_at: row.quarantined_at,
        ios_playable: row.ios_playable,
        android_playable: row.android_playable,
        stream_is_https: row.stream_is_https,
        last_health_checked_at: row.last_health_checked_at,
      },
      "cross"
    )
  );
}

async function backfillPlatformFields(rows: TvRow[], limit: number) {
  const targets = rows
    .filter(
      (row) =>
        row.status === "approved" &&
        row.playback_status === "playable" &&
        row.is_active === true &&
        !(row.ios_playable === true && row.android_playable === true && row.stream_is_https === true)
    )
    .slice(0, limit);

  let updated = 0;
  let nowEligible = 0;

  for (const row of targets) {
    const probe = await probeTvStation({
      id: row.id,
      source_type: row.source_type || "",
      source_id: row.source_id || "",
      source_url: row.source_url || "",
      embed_url: row.embed_url || null,
      title: row.title || "",
      status: row.status || "approved",
      playback_status: row.playback_status || "unchecked",
      is_active: row.is_active === true,
      reliability_score: row.reliability_score,
      consecutive_failures: 0,
    });

    if (!probe.playable) continue;

    const update = applyTvHealthProbe(
      {
        id: row.id,
        source_type: row.source_type || "",
        source_id: row.source_id || "",
        source_url: row.source_url || "",
        embed_url: row.embed_url || null,
        title: row.title || "",
        status: row.status || "approved",
        playback_status: row.playback_status || "unchecked",
        is_active: row.is_active === true,
        reliability_score: row.reliability_score,
        consecutive_failures: 0,
      },
      probe
    );

    const { error } = await supabaseAdmin.from("tv_videos").update(update).eq("id", row.id);
    if (error) throw new Error(error.message);
    updated += 1;

    if (
      isTvStationEligibleForPlatform(
        {
          status: row.status,
          is_active: update.is_active,
          playback_status: update.playback_status,
          reliability_score: update.reliability_score,
          disabled_at: update.disabled_at,
          quarantined_at: update.quarantined_at,
          ios_playable: update.ios_playable,
          android_playable: update.android_playable,
          stream_is_https: update.stream_is_https,
          last_health_checked_at: update.last_health_checked_at,
        },
        "cross"
      )
    ) {
      nowEligible += 1;
    }
  }

  return { attempted: targets.length, updated, nowEligible };
}

async function main() {
  const sinceArg = process.argv.find((arg) => arg.startsWith("--since="))?.slice("--since=".length);
  const backfill = process.argv.includes("--backfill");
  const backfillLimit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.slice(8) || 250);
  const sinceIso = sinceArg || DEFAULT_SINCE;
  const cutoff = getValidationFreshnessCutoff();

  const rows = await fetchRecentImports(sinceIso);

  const report = {
    at: new Date().toISOString(),
    since: sinceIso,
    imported: rows.length,
    approved: countWhere(rows, (row) => row.status === "approved"),
    active: countWhere(rows, (row) => row.is_active === true),
    playbackPlayable: countWhere(rows, (row) => row.playback_status === "playable"),
    reliabilityOk: countWhere(
      rows,
      (row) => Number(row.reliability_score ?? 0) >= TV_RELIABILITY_THRESHOLD
    ),
    notDisabled: countWhere(rows, (row) => !row.disabled_at),
    notQuarantined: countWhere(rows, (row) => !row.quarantined_at),
    freshHealth: countWhere(
      rows,
      (row) => Boolean(row.last_health_checked_at && row.last_health_checked_at >= cutoff)
    ),
    streamIsHttps: countWhere(rows, (row) => row.stream_is_https === true),
    iosPlayable: countWhere(rows, (row) => row.ios_playable === true),
    androidPlayable: countWhere(rows, (row) => row.android_playable === true),
    crossPlatformEligible: countCrossPlatformEligible(rows),
    gateAnalysis: {
      missingIosPlayable: countWhere(
        rows,
        (row) => row.playback_status === "playable" && row.ios_playable !== true
      ),
      missingAndroidPlayable: countWhere(
        rows,
        (row) => row.playback_status === "playable" && row.android_playable !== true
      ),
      missingStreamHttps: countWhere(
        rows,
        (row) => row.playback_status === "playable" && row.stream_is_https !== true
      ),
      staleHealth: countWhere(
        rows,
        (row) =>
          row.playback_status === "playable" &&
          (!row.last_health_checked_at || row.last_health_checked_at < cutoff)
      ),
    },
    backfill: backfill ? await backfillPlatformFields(rows, backfillLimit) : null,
  };

  const outPath = path.join(adminRoot, "data/tv-expansion-25k/import-eligibility-audit.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
