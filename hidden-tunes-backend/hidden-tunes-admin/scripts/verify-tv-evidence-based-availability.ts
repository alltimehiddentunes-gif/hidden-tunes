/**
 * Permanent verifier: evidence-based TV availability policy.
 *   npm run verify:tv-evidence-based-availability
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";
import {
  applyTvPublicCatalogFilters,
  getValidationFreshnessCutoff,
  isTvStationEligibleForPlatform,
  type SupabaseFilterQuery,
} from "@/lib/tvPlatformPolicy";
import {
  isTvPubliclyEligibleByEvidence,
  needsTvRevalidation,
} from "@/lib/tvPublicEligibilityPolicy";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

function mockQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const q: SupabaseFilterQuery = {
    eq(...args) {
      calls.push({ method: "eq", args });
      return q;
    },
    gte(...args) {
      calls.push({ method: "gte", args });
      return q;
    },
    not(...args) {
      calls.push({ method: "not", args });
      return q;
    },
    is(...args) {
      calls.push({ method: "is", args });
      return q;
    },
    ilike(...args) {
      calls.push({ method: "ilike", args });
      return q;
    },
    or(...args) {
      calls.push({ method: "or", args });
      return q;
    },
    order(...args) {
      calls.push({ method: "order", args });
      return q;
    },
    async range() {
      return { data: [], error: null, count: 0 };
    },
  };
  return { q, calls };
}

async function count(build: (q: any) => any) {
  const sb = getSupabaseAdmin();
  let q = sb.from("tv_videos").select("id", { count: "exact", head: true });
  q = build(q);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function main() {
  const staleOk = {
    status: "approved",
    is_active: true,
    playback_status: "playable",
    reliability_score: 80,
    consecutive_failures: 0,
    disabled_at: null,
    quarantined_at: null,
    ios_playable: true,
    android_playable: true,
    stream_is_https: true,
    last_health_checked_at: new Date(Date.now() - 14 * 86400000).toISOString(),
  };

  assert.equal(isTvPubliclyEligibleByEvidence(staleOk), true);
  assert.equal(needsTvRevalidation(staleOk.last_health_checked_at), true);
  assert.equal(isTvStationEligibleForPlatform(staleOk, "cross"), true);
  assert.equal(
    isTvPubliclyEligibleByEvidence({ ...staleOk, last_health_checked_at: null }),
    false
  );
  assert.equal(
    isTvPubliclyEligibleByEvidence({ ...staleOk, quarantined_at: new Date().toISOString() }),
    false
  );
  assert.equal(
    isTvPubliclyEligibleByEvidence({ ...staleOk, disabled_at: new Date().toISOString() }),
    false
  );
  assert.equal(
    isTvPubliclyEligibleByEvidence({ ...staleOk, playback_status: "failed" }),
    false
  );

  const { q, calls } = mockQuery();
  applyTvPublicCatalogFilters(q, "cross");
  assert.ok(calls.some((c) => c.method === "not" && c.args[0] === "last_health_checked_at"));
  assert.ok(!calls.some((c) => c.method === "gte" && c.args[0] === "last_health_checked_at"));
  // Freshness cutoff helper may still exist for revalidation priority — not used in filter.
  assert.ok(getValidationFreshnessCutoff());

  const host = new URL(String(process.env.SUPABASE_URL || "")).hostname;
  const all = await count((q) => q);
  const evidence = await count((q) => {
    applyTvPublicCatalogFilters(q, "cross");
    return q;
  });
  const sevenDay = await count((q) =>
    q
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("playback_status", "playable")
      .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
      .is("disabled_at", null)
      .is("quarantined_at", null)
      .eq("stream_is_https", true)
      .eq("ios_playable", true)
      .eq("android_playable", true)
      .gte("last_health_checked_at", getValidationFreshnessCutoff())
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        host,
        totals: { all, evidenceBasedVisible: evidence, legacySevenDayVisible: sevenDay },
        proofs: [
          "stale_timestamp_does_not_hide",
          "prior_verification_required",
          "hard_failed_excluded",
          "quarantined_excluded",
          "disabled_excluded",
          "catalog_filter_has_no_age_gte",
        ],
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
