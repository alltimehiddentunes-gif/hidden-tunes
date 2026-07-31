/**
 * Mature podcast catalog pagination + cache-key contracts.
 * Run: node scripts/test-mature-podcast-catalog.mjs
 */
import assert from "node:assert/strict";

const BASE = "https://admin.hiddentunes.com/api/podcasts/shows";
const MATURE_CATEGORY = "adult-lifestyle";
const PAGE_LIMIT = 40;

function cacheKey({ includeMature, category, page, limit, q }) {
  const mature = includeMature ? "mature" : "safe";
  const cat = String(category || "").trim().toLowerCase() || "all";
  const query = String(q || "").trim().toLowerCase();
  return `podcast-shows:${mature}:${cat}:p${page}:l${limit}:q:${query}`;
}

async function fetchShows(params) {
  const url = new URL(BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    url.searchParams.set(key, String(value));
  });
  const response = await fetch(url);
  assert.equal(response.ok, true, `HTTP ${response.status} for ${url}`);
  return response.json();
}

const safeKey = cacheKey({
  includeMature: false,
  category: MATURE_CATEGORY,
  page: 1,
  limit: PAGE_LIMIT,
  q: "",
});
const matureKey = cacheKey({
  includeMature: true,
  category: MATURE_CATEGORY,
  page: 1,
  limit: PAGE_LIMIT,
  q: "",
});
assert.notEqual(safeKey, matureKey, "mature/general cache keys must differ");

const gated = await fetchShows({
  page: 1,
  limit: 5,
  category: MATURE_CATEGORY,
  includeMature: "false",
});
assert.equal(Array.isArray(gated.shows), true);
assert.equal(gated.shows.length, 0, "mature category must be empty without includeMature");

const page1 = await fetchShows({
  page: 1,
  limit: PAGE_LIMIT,
  category: MATURE_CATEGORY,
  includeMature: "true",
});
assert.equal(page1.success, true);
assert.ok(page1.shows.length > 0, "first mature page must return shows");
assert.equal(page1.shows.length <= PAGE_LIMIT, true);
assert.equal(page1.pagination.hasMore, true);
const total = Number(page1.pagination.total);
assert.ok(total > PAGE_LIMIT, `expected mature total > ${PAGE_LIMIT}, got ${total}`);

const page2 = await fetchShows({
  page: 2,
  limit: PAGE_LIMIT,
  category: MATURE_CATEGORY,
  includeMature: "true",
});
assert.equal(page2.success, true);
assert.ok(page2.shows.length > 0, "second mature page must return shows");

const ids1 = new Set(page1.shows.map((show) => show.id));
const overlap = page2.shows.filter((show) => ids1.has(show.id));
assert.equal(overlap.length, 0, "page2 must not duplicate page1 ids");

const merged = [...page1.shows, ...page2.shows];
assert.equal(merged.length, page1.shows.length + page2.shows.length);

const search = await fetchShows({
  page: 1,
  limit: 5,
  category: MATURE_CATEGORY,
  includeMature: "true",
  q: "sex",
});
assert.equal(search.success, true);
assert.ok(search.pagination.total > 5, "mature search must paginate beyond first page");

const lastPage = Number(page1.pagination.totalPages) || Math.ceil(total / PAGE_LIMIT);
const finalPage = await fetchShows({
  page: lastPage,
  limit: PAGE_LIMIT,
  category: MATURE_CATEGORY,
  includeMature: "true",
});
assert.equal(finalPage.success, true);
assert.equal(finalPage.pagination.hasMore, false, "final page must stop hasMore");

console.log("PASS mature podcast catalog", {
  backendMatureTotal: total,
  firstPage: page1.shows.length,
  secondPage: page2.shows.length,
  reachableViaPagination: total,
  searchTotal: search.pagination.total,
  lastPage,
  matureCacheKey: matureKey,
  safeCacheKey: safeKey,
});
