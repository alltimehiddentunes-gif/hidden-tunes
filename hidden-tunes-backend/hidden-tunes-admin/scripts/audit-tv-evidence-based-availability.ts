/**
 * READ-ONLY classification of rows hidden by the 7-day freshness gate
 * under an evidence-based availability model.
 *
 *   npx tsx scripts/audit-tv-evidence-based-availability.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoffDays(days: number) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

async function count(build: (q: any) => any) {
  const sb = getSupabaseAdmin();
  let q = sb.from("tv_videos").select("id", { count: "exact", head: true });
  q = build(q);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

const baseEligible = (q: any) =>
  q
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .eq("stream_is_https", true)
    .eq("ios_playable", true)
    .eq("android_playable", true);

async function main() {
  const host = new URL(String(process.env.SUPABASE_URL || "")).hostname;
  const d7 = cutoffDays(7);

  const all = await count((q) => q);
  const currentPublic = await count((q) =>
    baseEligible(q).gte("last_health_checked_at", d7)
  );
  const evidenceBasedPublic = await count((q) =>
    baseEligible(q).not("last_health_checked_at", "is", null)
  );
  const hiddenSolelyByAge = await count((q) =>
    baseEligible(q).lt("last_health_checked_at", d7).not("last_health_checked_at", "is", null)
  );
  const neverVerifiedPlayableish = await count((q) =>
    q
      .eq("status", "approved")
      .eq("is_active", true)
      .is("quarantined_at", null)
      .is("disabled_at", null)
      .is("last_health_checked_at", null)
  );
  const playableNeverChecked = await count((q) =>
    baseEligible(q).is("last_health_checked_at", null)
  );
  const hardFailureStatuses = await count((q) =>
    q
      .eq("status", "approved")
      .in("playback_status", ["failed", "blocked", "deleted", "private", "embed_blocked"])
  );
  const quarantined = await count((q) => q.not("quarantined_at", "is", null));
  const disabled = await count((q) => q.not("disabled_at", "is", null));
  const softFailEvidence = await count((q) =>
    baseEligible(q)
      .lt("last_health_checked_at", d7)
      .gt("consecutive_failures", 0)
  );
  const staleNoFailures = await count((q) =>
    baseEligible(q)
      .lt("last_health_checked_at", d7)
      .eq("consecutive_failures", 0)
  );
  const staleWithHealthError = await count((q) =>
    baseEligible(q)
      .lt("last_health_checked_at", d7)
      .not("last_health_error", "is", null)
  );

  // Country breakdown of restore candidates (stale, no failures)
  const sb = getSupabaseAdmin();
  const { data: countrySample, error } = await sb
    .from("tv_videos")
    .select("region")
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
    .eq("consecutive_failures", 0)
    .limit(5000);
  if (error) throw error;

  const byCountry: Record<string, number> = {};
  for (const row of countrySample || []) {
    const key = String(row.region || "UNKNOWN").toUpperCase() || "UNKNOWN";
    byCountry[key] = (byCountry[key] || 0) + 1;
  }
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  const delta = evidenceBasedPublic - currentPublic;
  const pctIncrease =
    currentPublic > 0 ? Number(((delta / currentPublic) * 100).toFixed(1)) : 0;

  console.log(
    JSON.stringify(
      {
        mode: "read-only",
        host,
        totals: {
          all,
          currentPublicUnder7dGate: currentPublic,
          evidenceBasedPublicPreviouslyVerified: evidenceBasedPublic,
          hiddenSolelyByTimestampAge: hiddenSolelyByAge,
          restoredIfAgeGateRemoved: delta,
          percentIncreaseVsCurrentVisible: pctIncrease,
        },
        classifications: {
          stalePreviouslyVerifiedNoConsecutiveFailures: staleNoFailures,
          stalePreviouslyVerifiedWithConsecutiveFailures: softFailEvidence,
          staleWithLastHealthErrorSet: staleWithHealthError,
          playableButNeverChecked: playableNeverChecked,
          approvedActiveNeverCheckedAnyPlayback: neverVerifiedPlayableish,
          hardFailurePlaybackStatuses: hardFailureStatuses,
          quarantined,
          disabled,
        },
        restoreCandidatesTopCountriesSampled: topCountries,
        sampledRestoreRows: (countrySample || []).length,
        policyNote:
          "Evidence-based public ≈ baseEligible + last_health_checked_at IS NOT NULL (no max age). Age-only hidden rows are previously verified successes whose check timestamp aged past 7d.",
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
