/**
 * Focused contract tests for mobile TV search query helpers + coverage repair.
 * Run: npx tsx scripts/test-tv-search-coverage.ts
 */
import assert from "node:assert/strict";

import {
  normalizeTvSearchQuery,
  resolveTvSearchCountryCode,
} from "../utils/tvSearchQuery";

function testNormalize() {
  assert.equal(normalizeTvSearchQuery("  Al-Jazeera  "), "Al Jazeera");
  assert.equal(normalizeTvSearchQuery("Sky_News"), "Sky News");
  assert.equal(normalizeTvSearchQuery("France  24"), "France 24");
  assert.equal(normalizeTvSearchQuery("Canal+"), "Canal+");
}

function testCountryResolve() {
  assert.equal(resolveTvSearchCountryCode("South Africa"), "ZA");
  assert.equal(resolveTvSearchCountryCode("south-africa"), "ZA");
  assert.equal(resolveTvSearchCountryCode("United States"), "US");
  assert.equal(resolveTvSearchCountryCode("USA"), "US");
  assert.equal(resolveTvSearchCountryCode("United Kingdom"), "GB");
  assert.equal(resolveTvSearchCountryCode("UK"), "GB");
  assert.equal(resolveTvSearchCountryCode("Nigeria"), "NG");
  // Ambiguous free-text must NOT become a country code
  assert.equal(resolveTvSearchCountryCode("af"), null);
  assert.equal(resolveTvSearchCountryCode("News"), null);
  assert.equal(resolveTvSearchCountryCode("France 24"), null);
}

async function testProductionCoverage() {
  const base = "https://admin.hiddentunes.com";

  async function probe(path: string) {
    const response = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    assert.equal(response.ok, true, `HTTP ${response.status} for ${path}`);
    return (await response.json()) as {
      videos?: unknown[];
      pagination?: { hasMore?: boolean; total?: number };
    };
  }

  // Production accepts both raw and normalised hyphenated title queries.
  const rawHyphen = await probe(
    `/api/tv/videos?q=${encodeURIComponent("Al-Jazeera")}&page=1&limit=10&platform=android`
  );
  const normHyphen = await probe(
    `/api/tv/videos?q=${encodeURIComponent(normalizeTvSearchQuery("Al-Jazeera"))}&page=1&limit=10&platform=android`
  );
  assert.ok((rawHyphen.videos || []).length > 0, "raw Al-Jazeera should hit");
  assert.ok((normHyphen.videos || []).length > 0, "normalised Al Jazeera should hit");

  // Production accepts country-name search; ISO filtering remains supported.
  const nameQ = await probe(
    `/api/tv/videos?q=${encodeURIComponent("South Africa")}&page=1&limit=40&platform=android`
  );
  const code = resolveTvSearchCountryCode("South Africa");
  assert.equal(code, "ZA");
  const byCountry = await probe(
    `/api/tv/videos?country=${code}&page=1&limit=40&platform=android`
  );
  assert.ok((nameQ.videos || []).length > 0, "South Africa q should hit");
  assert.ok((byCountry.videos || []).length > 0, "ZA country filter should hit");

  // Pagination retains query and reaches later pages for broad matches.
  const news1 = await probe(`/api/tv/videos?q=News&page=1&limit=40&platform=android`);
  assert.equal(news1.pagination?.hasMore, true);
  const news2 = await probe(`/api/tv/videos?q=News&page=2&limit=40&platform=android`);
  assert.ok((news2.videos || []).length > 0, "News page 2 must return rows");
}

async function main() {
  testNormalize();
  testCountryResolve();
  await testProductionCoverage();
  console.log("test-tv-search-coverage: PASS");
}

main().catch((error) => {
  console.error("test-tv-search-coverage: FAIL");
  console.error(error);
  process.exitCode = 1;
});
