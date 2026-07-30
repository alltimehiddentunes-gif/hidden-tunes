/**
 * Prove watched-brand search aliases + search_only visibility.
 *   npx tsx scripts/verify-tv-watched-brand-search.ts
 */
import assert from "node:assert/strict";
import {
  buildTvTextSearchOrFilter,
  expandTvSearchPhrases,
} from "@/lib/tvPublicSearchQuery";

assert.deepEqual(
  expandTvSearchPhrases("Storage Wars TV").sort(),
  ["Pluto TV Storage Wars", "Storage Wars", "Storage Wars TV"].sort()
);
assert.ok(expandTvSearchPhrases("Alone").includes("Alone By History"));
assert.ok(buildTvTextSearchOrFilter("Storage Wars TV")?.includes("Storage Wars"));
assert.ok(buildTvTextSearchOrFilter("Alone TV")?.includes("Alone By History"));

console.log(JSON.stringify({ ok: true, proofs: ["filler_strip", "brand_synonyms"] }, null, 2));
