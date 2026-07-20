/**
 * Radio search pagination must not stop early when playable cache is incomplete.
 * Run: npx tsx scripts/test-radio-search-pagination.ts
 */
import {
  isCatalogRadioSearchCacheKey,
  RADIO_SEARCH_MAX_CONSECUTIVE_EMPTY_PAGES,
  resolveRadioSearchHasMore,
  shouldBypassCatalogSearchCacheForOffset,
  shouldFallThroughCatalogSearchCacheEnd,
} from "../utils/radioSearchCachePolicy";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

/**
 * Simulate jazz-like paging: backend total 1082, page size 40, some pages
 * yield fewer visible rows, at least one page adds zero unique visible rows.
 */
function simulateCatalogSearchPagination() {
  const BACKEND_TOTAL = 1082;
  const PAGE_SIZE = 40;
  const pages = Math.ceil(BACKEND_TOTAL / PAGE_SIZE);

  // Visible yield per backend page (after HTTPS / dedupe). Includes a zero-add page.
  const visiblePerPage = [
    15, 28, 32, 31, 32, 30, 28, 37, 32, 29, 24, 26, 27, 19, 28, 24, 24, 19, 21, 22,
    23, 21, 18, 24, 13, 10, 18, 2,
  ];
  assertEqual(visiblePerPage.length, pages, "page count matches jazz shape");

  // Inject a zero-unique page mid-stream (duplicates / all filtered).
  visiblePerPage[5] = 0;

  let nextBackendOffset = 0;
  let backendHasMore = true;
  let visible = 0;
  let pagesRequested = 0;
  let emptyStreak = 0;
  const seenOffsets = new Set<number>();

  while (backendHasMore) {
    const offset = nextBackendOffset;
    assert(!seenOffsets.has(offset), `offset ${offset} must not repeat`);
    seenOffsets.add(offset);

    const pageIndex = Math.floor(offset / PAGE_SIZE);
    const backendRows = Math.min(PAGE_SIZE, BACKEND_TOTAL - offset);
    const uniqueAdded = visiblePerPage[pageIndex] ?? 0;
    backendHasMore = offset + backendRows < BACKEND_TOTAL;
    // Client hasMore follows backend, not visible page length.
    const clientHasMore = resolveRadioSearchHasMore(uniqueAdded, PAGE_SIZE, backendHasMore);

    nextBackendOffset = offset + PAGE_SIZE;
    pagesRequested += 1;
    visible += uniqueAdded;

    if (uniqueAdded === 0 && clientHasMore) {
      emptyStreak += 1;
      assert(
        emptyStreak <= RADIO_SEARCH_MAX_CONSECUTIVE_EMPTY_PAGES,
        "empty-page guard must bound zero-add continuation"
      );
      continue;
    }
    emptyStreak = 0;

    if (!clientHasMore) break;

    // Must not stop merely because visible is ~199.
    assert(visible !== 199 || clientHasMore, "must not stop at 199 while backend has more");
  }

  assertEqual(pagesRequested, pages, "requested all backend pages");
  assertEqual(seenOffsets.size, pages, "no repeated offsets");
  assert(visible > 199, `visible playable ${visible} must exceed early-stop 199`);
  assert(visible < BACKEND_TOTAL, "playable may be below backend match total");
  assertEqual(backendHasMore, false, "backend exhausted");
}

function main() {
  assertEqual(isCatalogRadioSearchCacheKey("catalog-search:jazz"), true, "jazz key");

  // Incomplete 199-row cache at last slice must fall through (legacy meta unknown).
  assertEqual(
    shouldFallThroughCatalogSearchCacheEnd({
      cacheKey: "catalog-search:jazz",
      offset: 160,
      pageLength: 39,
      cacheTotal: 199,
      backendHasMore: undefined,
    }),
    true,
    "199 cache end falls through"
  );

  // Known backend exhaustion may stop at cache end.
  assertEqual(
    shouldFallThroughCatalogSearchCacheEnd({
      cacheKey: "catalog-search:jazz",
      offset: 160,
      pageLength: 39,
      cacheTotal: 199,
      backendHasMore: false,
    }),
    false,
    "backend done trusts cache end"
  );

  // Mid-cache pages do not fall through.
  assertEqual(
    shouldFallThroughCatalogSearchCacheEnd({
      cacheKey: "catalog-search:jazz",
      offset: 40,
      pageLength: 40,
      cacheTotal: 199,
      backendHasMore: true,
    }),
    false,
    "mid-cache keeps serving"
  );

  // Offset>0 catalog-search bypasses playable cache for backend cursor ownership.
  assertEqual(
    shouldBypassCatalogSearchCacheForOffset("catalog-search:jazz", 40),
    true,
    "bypass offset 40"
  );
  assertEqual(
    shouldBypassCatalogSearchCacheForOffset("catalog-search:jazz", 0),
    false,
    "allow offset 0 cache"
  );
  assertEqual(
    shouldBypassCatalogSearchCacheForOffset("featured", 40),
    false,
    "category still uses cache pages"
  );

  // hasMore must not die because filtered page < 40.
  assertEqual(resolveRadioSearchHasMore(0, 40, true), true, "zero visible still hasMore");
  assertEqual(resolveRadioSearchHasMore(15, 40, true), true, "short visible still hasMore");
  assertEqual(resolveRadioSearchHasMore(40, 40, false), false, "backend end");

  simulateCatalogSearchPagination();

  console.log("radio-search-pagination: ok");
}

main();
