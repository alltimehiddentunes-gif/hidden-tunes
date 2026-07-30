/**
 * Permanent verifier: shared eligibility authority + search contract.
 *   npm run verify:tv-search-playback-unification
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTvPublicCatalogFilters,
  type SupabaseFilterQuery,
} from "@/lib/tvPlatformPolicy";
import {
  buildTvTextSearchOrFilter,
  normalizeTvSearchQuery,
  resolveTvCountryFilter,
} from "@/lib/tvPublicSearchQuery";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return fs.readFileSync(path.join(adminRoot, rel), "utf8");
}

function mockQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const q: SupabaseFilterQuery = {
    eq(...a) {
      calls.push({ method: "eq", args: a });
      return q;
    },
    gte(...a) {
      calls.push({ method: "gte", args: a });
      return q;
    },
    not(...a) {
      calls.push({ method: "not", args: a });
      return q;
    },
    is(...a) {
      calls.push({ method: "is", args: a });
      return q;
    },
    ilike(...a) {
      calls.push({ method: "ilike", args: a });
      return q;
    },
    or(...a) {
      calls.push({ method: "or", args: a });
      return q;
    },
    order(...a) {
      calls.push({ method: "order", args: a });
      return q;
    },
    async range() {
      return { data: [], error: null, count: 0 };
    },
  };
  return { q, calls };
}

async function main() {
  assert.equal(normalizeTvSearchQuery("Al-Jazeera"), normalizeTvSearchQuery("Al Jazeera"));
  assert.equal(resolveTvCountryFilter("South Africa"), "ZA");
  assert.ok(buildTvTextSearchOrFilter("NHK")?.includes("title"));

  const { q, calls } = mockQuery();
  applyTvPublicCatalogFilters(q, "cross");
  assert.ok(!calls.some((c) => c.method === "gte" && String(c.args[0]) === "last_health_checked_at"));

  const videosRoute = read("app/api/tv/videos/route.ts");
  const searchRoute = read("app/api/tv/search/route.ts");
  const playRoute = read("app/api/tv/videos/[id]/play/route.ts");
  const policy = read("lib/tvPlatformPolicy.ts");

  assert.ok(videosRoute.includes("applyTvPublicCatalogFilters"));
  assert.ok(searchRoute.includes("applyTvPublicCatalogFilters") || searchRoute.includes("tvSearch"));
  assert.ok(playRoute.includes("isTvStationEligibleForPlatform"));
  assert.ok(policy.includes("tvPublicEligibilityPolicy") || policy.includes("last_health_checked_at"));
  assert.ok(!policy.includes('.gte("last_health_checked_at", cutoff)'));
  assert.ok(!policy.includes(".gte(\"last_health_checked_at\", cutoff)"));

  // Confirm no leftover age gate string patterns in public filter body.
  const filterFn = policy.slice(policy.indexOf("export function applyTvPublicCatalogFilters"));
  assert.ok(!/\.gte\(\s*["']last_health_checked_at["']/.test(filterFn));

  console.log(
    JSON.stringify(
      {
        ok: true,
        proofs: [
          "hyphen_normalization",
          "country_alias_ZA",
          "shared_catalog_filter",
          "play_uses_platform_eligibility",
          "no_seven_day_gte_in_public_filter",
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
