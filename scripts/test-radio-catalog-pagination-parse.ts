/**
 * Production paging contract tests.
 * Run: npx tsx scripts/test-radio-catalog-pagination-parse.ts
 */
import { parseRadioCatalogPagination } from "../services/radio/radioCatalogApi";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function main() {
  // Madagascar: 11 total, single page, hasMore false
  const mada = parseRadioCatalogPagination(
    {
      success: true,
      stations: new Array(11).fill({ id: "x", name: "n" }),
      pagination: { page: 1, limit: 40, total: 11, totalPages: 1, hasMore: false },
    },
    { requestOffset: 0, requestLimit: 40, rawBackendRowsReturned: 11 }
  );
  assertEqual(mada.backendTotal, 11, "mada total");
  assertEqual(mada.backendHasMore, false, "mada hasMore");
  assertEqual(mada.backendNextOffset, undefined, "mada no next");
  assertEqual(mada.rawBackendRowsReturned, 11, "mada raw");

  // Jazz page 1
  const jazz1 = parseRadioCatalogPagination(
    {
      success: true,
      pagination: { page: 1, limit: 40, total: 1082, totalPages: 28, hasMore: true },
    },
    { requestOffset: 0, requestLimit: 40, rawBackendRowsReturned: 40 }
  );
  assertEqual(jazz1.backendTotal, 1082, "jazz total");
  assertEqual(jazz1.backendHasMore, true, "jazz hasMore");
  assertEqual(jazz1.backendNextOffset, 40, "jazz next offset = +limit (page-based)");

  // Jazz page 2 cursor
  const jazz2 = parseRadioCatalogPagination(
    {
      pagination: { page: 2, limit: 40, total: 1082, totalPages: 28, hasMore: true },
    },
    { requestOffset: 40, requestLimit: 40, rawBackendRowsReturned: 40 }
  );
  assertEqual(jazz2.backendNextOffset, 80, "jazz page2 next");

  // Short normalized page must not invent hasMore=false when backend says true
  const short = parseRadioCatalogPagination(
    { pagination: { page: 1, limit: 40, total: 1082, totalPages: 28, hasMore: true } },
    { requestOffset: 0, requestLimit: 40, rawBackendRowsReturned: 2 }
  );
  assertEqual(short.backendHasMore, true, "short raw still hasMore from backend");
  assertEqual(short.backendNextOffset, 40, "short raw still advances by limit");

  console.log("radio-catalog-pagination-parse: ok");
}

main();
