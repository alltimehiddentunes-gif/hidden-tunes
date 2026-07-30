/**
 * Bounded TV health canary (25–50 channels). Mutates ONLY selected rows.
 *
 *   npx tsx scripts/run-tv-health-canary.ts
 *   npx tsx scripts/run-tv-health-canary.ts --limit=40 --execute
 *
 * Default is dry-run (probe + report, no DB writes).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";
import {
  applyTvHealthProbe,
  classifyTvHealthFailureKind,
  probeTvStation,
  type TvHealthRow,
} from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

function argFlag(name: string) {
  return process.argv.includes(name);
}

function argValue(name: string, fallback: number) {
  const raw = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!raw) return fallback;
  const n = Number(raw.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

async function main() {
  const execute = argFlag("--execute");
  const limit = Math.min(50, Math.max(1, argValue("--limit", 40)));
  const sb = getSupabaseAdmin();
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString();

  // Mixed sample: overdue previously verified, plus a few soft-error rows.
  const { data: overdue, error: e1 } = await sb
    .from("tv_videos")
    .select(
      "id, source_type, source_id, source_url, embed_url, title, playback_status, status, is_active, reliability_score, consecutive_failures, disabled_at, quarantined_at, ios_playable, android_playable, stream_is_https, stream_protocol, region, last_health_error, last_health_checked_at"
    )
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .lt("last_health_checked_at", d7)
    .eq("consecutive_failures", 0)
    .order("last_health_checked_at", { ascending: true })
    .limit(Math.ceil(limit * 0.75));
  if (e1) throw e1;

  const { data: softErr, error: e2 } = await sb
    .from("tv_videos")
    .select(
      "id, source_type, source_id, source_url, embed_url, title, playback_status, status, is_active, reliability_score, consecutive_failures, disabled_at, quarantined_at, ios_playable, android_playable, stream_is_https, stream_protocol, region, last_health_error, last_health_checked_at"
    )
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .not("last_health_error", "is", null)
    .limit(Math.max(5, Math.floor(limit * 0.25)));
  if (e2) throw e2;

  const byId = new Map<string, any>();
  for (const row of [...(overdue || []), ...(softErr || [])]) {
    byId.set(String(row.id), row);
  }
  let selected = [...byId.values()].slice(0, limit);

  // Diversify hosts/countries lightly.
  const seenHosts = new Set<string>();
  const diversified: any[] = [];
  for (const row of selected) {
    const host = hostOf(String(row.source_url || ""));
    if (seenHosts.has(host) && diversified.length >= Math.min(limit, 20)) continue;
    seenHosts.add(host);
    diversified.push(row);
    if (diversified.length >= limit) break;
  }
  if (diversified.length >= 25) selected = diversified;
  else selected = selected.slice(0, limit);

  const summary = {
    mode: execute ? "execute" : "dry-run",
    selected: selected.length,
    successful: 0,
    softFailed: 0,
    hardFailed: 0,
    remainedVisible: 0,
    becameDegraded: 0,
    becameTemporarilyUnavailable: 0,
    quarantined: 0,
    restored: 0,
    unexpectedMutations: 0,
    rows: [] as Array<Record<string, unknown>>,
  };

  for (const row of selected as TvHealthRow[]) {
    const before = {
      playback_status: row.playback_status,
      consecutive_failures: row.consecutive_failures,
      quarantined_at: (row as any).quarantined_at ?? null,
      is_active: row.is_active,
    };
    const probe = await probeTvStation(row);
    const kind = probe.playable ? "success" : classifyTvHealthFailureKind(probe);
    const update = applyTvHealthProbe(row, probe, new Date().toISOString(), {
      independentFailureIncrement: 1,
    });

    if (probe.playable) summary.successful += 1;
    else if (kind === "soft") summary.softFailed += 1;
    else summary.hardFailed += 1;

    if (update.playback_status === "playable" && !update.quarantined_at) {
      summary.remainedVisible += 1;
      if (update.consecutive_failures > 0) summary.becameDegraded += 1;
      if (before.consecutive_failures && before.consecutive_failures > 0 && update.consecutive_failures === 0) {
        summary.restored += 1;
      }
    } else {
      summary.becameTemporarilyUnavailable += 1;
    }
    if (update.quarantined_at) summary.quarantined += 1;

    // Soft failure must not quarantine previously verified on first independent fail.
    if (
      before.playback_status === "playable" &&
      !probe.playable &&
      kind === "soft" &&
      Number(before.consecutive_failures || 0) === 0 &&
      update.quarantined_at
    ) {
      summary.unexpectedMutations += 1;
    }

    if (execute) {
      const { error } = await sb.from("tv_videos").update(update).eq("id", row.id);
      if (error) throw error;
    }

    summary.rows.push({
      id: row.id,
      title: row.title,
      region: (row as any).region || null,
      host: hostOf(String(row.source_url || "")),
      source_type: row.source_type,
      probePlayable: probe.playable,
      kind: probe.playable ? "success" : kind,
      reason: probe.reason,
      before,
      after: {
        playback_status: update.playback_status,
        consecutive_failures: update.consecutive_failures,
        quarantined_at: update.quarantined_at,
        is_active: update.is_active,
        last_validation_result: update.last_validation_result,
      },
    });
  }

  const outDir = path.join(adminRoot, "docs/audits/tv-production-deployment");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `canary-${execute ? "execute" : "dry"}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify({ ...summary, rows: undefined, rowCount: summary.rows.length, outFile }, null, 2));

  if (summary.unexpectedMutations > 0) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
