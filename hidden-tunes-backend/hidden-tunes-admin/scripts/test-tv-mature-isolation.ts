import assert from "node:assert/strict";

import {
  applyTvPublicCatalogFilters,
  parseIncludeMatureParam,
  type SupabaseFilterQuery,
} from "../lib/tvPlatformPolicy";

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

function testNormalCatalogExcludesMature() {
  process.env.TV_MATURE_ISOLATION_ENABLED = "true";
  const filters: Array<{ op: string; column: string; value: unknown }> = [];
  const query = createMockQuery(filters);

  applyTvPublicCatalogFilters(query, "cross", new Date(), { includeMature: false });
  assert.ok(filters.some((row) => row.column === "is_mature" && row.value === false));
}

function testMatureCatalogRequiresApproval() {
  const filters: Array<{ op: string; column: string; value: unknown }> = [];
  const query = createMockQuery(filters);

  applyTvPublicCatalogFilters(query, "cross", new Date(), { includeMature: true });
  assert.ok(filters.some((row) => row.column === "is_mature" && row.value === true));
  assert.ok(
    filters.some((row) => row.column === "mature_source_approved" && row.value === true)
  );
}

function testIncludeMatureParamParsing() {
  assert.equal(
    parseIncludeMatureParam({
      nextUrl: {
        searchParams: new URLSearchParams("includeMature=true"),
      } as never,
      headers: new Headers(),
    }),
    true
  );
  assert.equal(
    parseIncludeMatureParam({
      nextUrl: {
        searchParams: new URLSearchParams(""),
      } as never,
      headers: new Headers(),
    }),
    false
  );
}

testNormalCatalogExcludesMature();
testMatureCatalogRequiresApproval();
testIncludeMatureParamParsing();

console.log(JSON.stringify({ ok: true, tests: 3 }, null, 2));
