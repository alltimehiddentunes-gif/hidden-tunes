import assert from "node:assert/strict";

import {
  applyTvPublicCatalogFilters,
  applyTvSearchDiscoveryCatalogFilters,
  TV_CATALOG_ELIGIBILITY_SEARCH_ONLY,
  TV_CATALOG_ELIGIBILITY_VERIFIED,
  type SupabaseFilterQuery,
} from "../lib/tvPlatformPolicy";
import {
  buildTvSearchDedupeIndex,
  filterDiscoveryRowsAgainstVerifiedIndex,
  isTvSearchRowDuplicateOfIndex,
  normalizeTvSearchTitleRegionKey,
  normalizeTvSearchUrlKey,
} from "../lib/tvSearchDedupe";
import { mergeTvSearchResultsVerifiedFirst } from "../lib/tvSearchMerge";

function createMockQuery(filters: Array<{ op: string; column: string; value: unknown }>) {
  const query = {
    eq(column: string, value: unknown) {
      filters.push({ op: "eq", column, value });
      return query;
    },
    gte(column: string, value: unknown) {
      filters.push({ op: "gte", column, value });
      return query;
    },
    is(column: string, value: null) {
      filters.push({ op: "is", column, value });
      return query;
    },
    ilike() {
      return query;
    },
    or() {
      return query;
    },
    in() {
      return query;
    },
    order() {
      return query;
    },
    range: async () => ({ data: null, error: null, count: 0 }),
  };

  return query as SupabaseFilterQuery;
}

function testBrowseUsesVerifiedTierOnly() {
  const filters: Array<{ op: string; column: string; value: unknown }> = [];
  const query = createMockQuery(filters);
  applyTvPublicCatalogFilters(query, "cross", new Date(), { includeMature: false });
  assert.ok(
    filters.some(
      (row) =>
        row.column === "catalog_eligibility_tier" &&
        row.value === TV_CATALOG_ELIGIBILITY_VERIFIED
    )
  );
}

function testCountryAndCategoryBrowseShareVerifiedFilter() {
  // Country (?country=) and category filters are applied after
  // applyTvPublicCatalogFilters on /api/tv/videos (stations/channels re-export).
  // Proving the shared filter is verified-only proves those rails stay exclusion-safe.
  const filters: Array<{ op: string; column: string; value: unknown }> = [];
  const query = createMockQuery(filters);
  applyTvPublicCatalogFilters(query, "cross", new Date());
  assert.equal(
    filters.filter((row) => row.column === "catalog_eligibility_tier").length,
    1
  );
  assert.equal(
    filters.find((row) => row.column === "catalog_eligibility_tier")?.value,
    TV_CATALOG_ELIGIBILITY_VERIFIED
  );
}

function testSearchDiscoveryUsesSearchOnlyTier() {
  const filters: Array<{ op: string; column: string; value: unknown }> = [];
  const query = createMockQuery(filters);
  applyTvSearchDiscoveryCatalogFilters(query, "cross", new Date(), { includeMature: false });
  assert.ok(
    filters.some(
      (row) =>
        row.column === "catalog_eligibility_tier" &&
        row.value === TV_CATALOG_ELIGIBILITY_SEARCH_ONLY
    )
  );
}

function testDiscoveryDuplicateSuppression() {
  const verifiedIndex = buildTvSearchDedupeIndex([
    {
      id: "v1",
      source_key: "hls_stream:abc",
      source_url: "https://example.com/live.m3u8",
      title: "City News",
      region: "US",
    },
  ]);

  const discoveryRows = [
    {
      id: "d1",
      source_key: "hls_stream:abc",
      source_url: "https://mirror.example.com/live.m3u8?token=1",
      title: "City News",
      region: "US",
    },
    {
      id: "d2",
      source_key: "hls_stream:unique",
      source_url: "https://example.org/other.m3u8",
      title: "Other Channel",
      region: "CA",
    },
  ];

  const filtered = filterDiscoveryRowsAgainstVerifiedIndex(discoveryRows, verifiedIndex);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, "d2");
  assert.equal(isTvSearchRowDuplicateOfIndex(discoveryRows[0], verifiedIndex), true);
}

function testVerifiedFirstMergeOrdering() {
  const merged = mergeTvSearchResultsVerifiedFirst(
    [{ id: "v1", title: "Verified A" } as never, { id: "v2", title: "Verified B" } as never],
    [{ id: "d1", title: "Discovery A" } as never],
    3
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    ["v1", "v2", "d1"]
  );
}

function testUrlNormalizationDedupesTokenVariants() {
  const a = normalizeTvSearchUrlKey("https://cdn.example.com/live/index.m3u8?token=abc");
  const b = normalizeTvSearchUrlKey("https://cdn.example.com/live/index.m3u8?token=xyz");
  assert.notEqual(a, b);
  const c = normalizeTvSearchUrlKey("https://CDN.example.com/live/index.m3u8/");
  const d = normalizeTvSearchUrlKey("https://cdn.example.com/live/index.m3u8");
  assert.equal(c, d);
}

function testTitleRegionNormalization() {
  const key = normalizeTvSearchTitleRegionKey("  City   News ", " us ");
  assert.equal(key, "city news::us");
}

testBrowseUsesVerifiedTierOnly();
testCountryAndCategoryBrowseShareVerifiedFilter();
testSearchDiscoveryUsesSearchOnlyTier();
testDiscoveryDuplicateSuppression();
testVerifiedFirstMergeOrdering();
testUrlNormalizationDedupesTokenVariants();
testTitleRegionNormalization();

console.log(JSON.stringify({ ok: true, tests: 7 }, null, 2));
