/**
 * Prove category/search pagination does not overlap, skip, or stop early.
 *   npm run verify:tv-category-pagination
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTvSearchQuery, resolveTvCountryFilter } from "@/lib/tvPublicSearchQuery";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = String(process.env.TV_VERIFY_BASE_URL || "https://admin.hiddentunes.com").replace(
  /\/$/,
  ""
);

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  const body = await res.json();
  return { status: res.status, body };
}

async function pageCategory(category: string, page: number, limit: number) {
  const url = `${baseUrl}/api/tv/videos?platform=android&limit=${limit}&page=${page}&category=${encodeURIComponent(category)}`;
  const { status, body } = await fetchJson(url);
  assert.equal(status, 200, `${category} page ${page} HTTP ${status}`);
  assert.equal(body.success, true);
  return body as {
    videos: Array<{ id: string; title?: string }>;
    pagination: { page: number; limit: number; total: number; hasMore: boolean };
  };
}

async function pageSearch(q: string, page: number, limit: number) {
  const url = `${baseUrl}/api/tv/videos?platform=android&limit=${limit}&page=${page}&q=${encodeURIComponent(q)}`;
  const { status, body } = await fetchJson(url);
  assert.equal(status, 200, `q=${q} page ${page} HTTP ${status}`);
  assert.equal(body.success, true);
  return body as {
    videos: Array<{ id: string; title?: string }>;
    pagination: { page: number; limit: number; total: number; hasMore: boolean };
  };
}

async function exhaustCategory(category: string, limit = 50, maxPages = 40) {
  const ids: string[] = [];
  let page = 1;
  let total = 0;
  let hasMore = true;
  while (hasMore && page <= maxPages) {
    const body = await pageCategory(category, page, limit);
    total = body.pagination.total;
    for (const row of body.videos) ids.push(String(row.id));
    hasMore = Boolean(body.pagination.hasMore);
    if (!hasMore) break;
    page += 1;
  }
  const unique = new Set(ids);
  return {
    category,
    total,
    pagesFetched: page,
    loaded: ids.length,
    unique: unique.size,
    duplicates: ids.length - unique.size,
    hasMoreAtEnd: hasMore,
  };
}

async function main() {
  assert.equal(normalizeTvSearchQuery("Al-Jazeera"), normalizeTvSearchQuery("Al Jazeera"));
  assert.equal(resolveTvCountryFilter("South Africa"), "ZA");

  const route = fs.readFileSync(path.join(adminRoot, "app/api/tv/videos/route.ts"), "utf8");
  assert.ok(route.includes("applyTvPublicCatalogFilters"));
  assert.ok(route.includes('order("title"'));
  assert.ok(route.includes('order("id"'));
  assert.ok(route.includes('count: "exact"'));
  assert.ok(!/\.gte\(\s*["']last_health_checked_at["']/.test(route));

  const newsP1 = await pageCategory("News", 1, 50);
  const newsP2 = await pageCategory("News", 2, 50);
  assert.ok(newsP1.pagination.total > 50, `News total too small: ${newsP1.pagination.total}`);
  assert.equal(newsP1.pagination.hasMore, true);
  const overlap = newsP1.videos.filter((a) => newsP2.videos.some((b) => b.id === a.id));
  assert.equal(overlap.length, 0, `News page overlap: ${overlap.map((r) => r.id).join(",")}`);

  const newsExhaust = await exhaustCategory("News", 50, 30);
  assert.equal(newsExhaust.duplicates, 0);
  assert.equal(newsExhaust.hasMoreAtEnd, false);
  assert.equal(newsExhaust.unique, newsExhaust.total);

  // Sports: production may still be on legacy filter until deploy.
  // Floor: never artificially capped at 164. After canonical deploy, total jumps.
  const sportsP1 = await pageCategory("Sports", 1, 50);
  assert.ok(
    sportsP1.pagination.total > 164,
    `Sports must not be capped at 164; got ${sportsP1.pagination.total}`
  );
  const sportsCanonical = (sportsP1 as { category?: { canonical?: string } }).category?.canonical;
  if (sportsCanonical === "Sports") {
    assert.ok(
      sportsP1.pagination.total >= 500,
      `canonical Sports total expected >= 500, got ${sportsP1.pagination.total}`
    );
  }

  const sportAlias = await pageCategory("Sport", 1, 20);
  assert.ok(sportAlias.pagination.total > 0, "Sport alias must return rows");

  const alHyphen = await pageSearch("Al-Jazeera", 1, 20);
  const alSpace = await pageSearch("Al Jazeera", 1, 20);
  assert.ok(alHyphen.pagination.total > 0, "Al-Jazeera should match");
  assert.equal(alHyphen.pagination.total, alSpace.pagination.total);

  const za = await pageSearch("ZA", 1, 20);
  const sa = await pageSearch("South Africa", 1, 20);
  // South Africa as q may match titles; country= path is separate. Ensure ZA has hits.
  assert.ok(za.pagination.total > 0, "ZA search should return hits");

  const countryUrl = `${baseUrl}/api/tv/videos?platform=android&limit=20&page=1&country=${encodeURIComponent("South Africa")}`;
  const country = await fetchJson(countryUrl);
  assert.equal(country.status, 200);
  assert.ok(country.body.pagination?.total > 0, "country=South Africa should resolve to ZA region");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        news: newsExhaust,
        sportsTotal: sportsP1.pagination.total,
        sportsCanonical: sportsCanonical || null,
        sportAliasTotal: sportAlias.pagination.total,
        alJazeeraTotal: alHyphen.pagination.total,
        zaTotal: za.pagination.total,
        southAfricaCountryTotal: country.body.pagination.total,
        southAfricaQueryTotal: sa.pagination.total,
        proofs: [
          "eligibility_before_pagination",
          "stable_title_id_order",
          "exact_count",
          "no_page_overlap",
          "unique_equals_total",
          "hyphen_normalization",
          "country_name_filter",
          "sports_not_capped_164",
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
