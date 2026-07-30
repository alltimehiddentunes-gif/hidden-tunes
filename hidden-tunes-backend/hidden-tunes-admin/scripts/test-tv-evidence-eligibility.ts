/**
 * Local unit checks for evidence-based TV eligibility (no network).
 *   npx tsx scripts/test-tv-evidence-eligibility.ts
 */
import assert from "node:assert/strict";
import {
  assertCatalogueContinuityGuard,
  deriveTvAvailabilityState,
  isTvPubliclyEligibleByEvidence,
  needsTvRevalidation,
} from "@/lib/tvPublicEligibilityPolicy";
import {
  applyTvPublicCatalogFilters,
  isTvStationEligibleForPlatform,
  type SupabaseFilterQuery,
} from "@/lib/tvPlatformPolicy";

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
assert.equal(deriveTvAvailabilityState(staleOk), "due_for_recheck");
assert.equal(needsTvRevalidation(staleOk.last_health_checked_at), true);
assert.equal(isTvStationEligibleForPlatform(staleOk, "cross"), true);

const neverVerified = { ...staleOk, last_health_checked_at: null };
assert.equal(isTvPubliclyEligibleByEvidence(neverVerified), false);
assert.equal(deriveTvAvailabilityState(neverVerified), "never_verified");

const hardFail = {
  ...staleOk,
  playback_status: "failed",
  last_health_checked_at: new Date().toISOString(),
};
assert.equal(isTvPubliclyEligibleByEvidence(hardFail), false);

const degraded = {
  ...staleOk,
  consecutive_failures: 1,
  last_health_checked_at: new Date().toISOString(),
};
assert.equal(isTvPubliclyEligibleByEvidence(degraded), true);
assert.equal(deriveTvAvailabilityState(degraded), "degraded");

const { q, calls } = mockQuery();
applyTvPublicCatalogFilters(q, "cross");
assert.ok(
  calls.some((c) => c.method === "not" && c.args[0] === "last_health_checked_at"),
  "must require last_health_checked_at IS NOT NULL"
);
assert.ok(
  !calls.some((c) => c.method === "gte" && c.args[0] === "last_health_checked_at"),
  "must not apply max-age gte on last_health_checked_at"
);

const guardExpand = assertCatalogueContinuityGuard({
  previousVisible: 5908,
  projectedVisible: 16278,
});
assert.equal(guardExpand.ok, true);
assert.equal(guardExpand.newlyRestored, 10370);

const guardCrash = assertCatalogueContinuityGuard({
  previousVisible: 10000,
  projectedVisible: 4000,
});
assert.equal(guardCrash.ok, false);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        "stale_previously_verified_visible",
        "never_verified_hidden",
        "hard_failure_hidden",
        "degraded_visible",
        "catalog_filter_no_age_gte",
        "continuity_guard",
      ],
    },
    null,
    2
  )
);
