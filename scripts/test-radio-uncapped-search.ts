/**
 * Uncapped Radio search + metadata-first contract.
 * Run: npx tsx scripts/test-radio-uncapped-search.ts
 */
import {
  buildCatalogSearchUrl,
  dedupeCatalogStations,
  mapRadioCatalogStationToHiddenTunes,
} from "../services/radio/radioCatalogApi";
import {
  resolveRadioSearchHasMore,
  shouldBypassCatalogSearchCacheForOffset,
} from "../utils/radioSearchCachePolicy";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function main() {
  // Metadata visibility
  assert(
    mapRadioCatalogStationToHiddenTunes({
      id: "a",
      name: "HTTPS",
      stream_url: "https://x",
    }) != null,
    "https appears"
  );
  assert(
    mapRadioCatalogStationToHiddenTunes({
      id: "b",
      name: "HTTP",
      stream_url: "http://x",
    }) != null,
    "http metadata appears"
  );
  assert(
    mapRadioCatalogStationToHiddenTunes({
      id: "c",
      name: "No stream",
      stream_url: null,
    }) != null,
    "missing stream appears"
  );

  const sameName = dedupeCatalogStations([
    mapRadioCatalogStationToHiddenTunes({ id: "1", name: "Dup Name", stream_url: null })!,
    mapRadioCatalogStationToHiddenTunes({ id: "2", name: "Dup Name", stream_url: null })!,
  ]);
  assertEqual(sameName.length, 2, "same-name different-ID remain");

  // No https_only; limit 40
  const url = buildCatalogSearchUrl("jazz", 1, 40);
  assert(!url.includes("https_only"), "no https_only");
  assert(url.includes("limit=40"), "page size 40");
  assert(url.includes("include_stream=1"), "optional stream enrichment");

  // Backend cursor / hasMore — never invent false from short visible pages
  assertEqual(resolveRadioSearchHasMore(0, 40, true), true, "zero visible still hasMore");
  assertEqual(resolveRadioSearchHasMore(15, 40, true), true, "short page still hasMore");
  assertEqual(resolveRadioSearchHasMore(40, 40, false), false, "backend end");

  // Simulate 1082 jazz pages — must pass 199 and never invent a 2000 stop
  const PAGE = 40;
  const TOTAL = 1082;
  let offset = 0;
  let loaded = 0;
  let pages = 0;
  let backendHasMore = true;
  while (backendHasMore) {
    const raw = Math.min(PAGE, TOTAL - offset);
    backendHasMore = offset + raw < TOTAL;
    const clientHasMore = resolveRadioSearchHasMore(raw, PAGE, backendHasMore);
    offset += PAGE;
    loaded += raw;
    pages += 1;
    if (loaded > 199) {
      assert(clientHasMore || loaded >= TOTAL, "must not stop at 199");
    }
    if (loaded > 2000) {
      throw new Error("unexpected overshoot");
    }
    if (!clientHasMore) break;
  }
  assertEqual(loaded, TOTAL, "loads full backend total");
  assertEqual(pages, Math.ceil(TOTAL / PAGE), "all pages");
  assert(shouldBypassCatalogSearchCacheForOffset("catalog-search:jazz", 40), "offset>0 network");

  // 25k-shaped query: only stop when backend hasMore false
  let broadOffset = 0;
  let broadPages = 0;
  const BROAD = 25099;
  let broadHasMore = true;
  while (broadHasMore && broadPages < 700) {
    const raw = Math.min(PAGE, BROAD - broadOffset);
    broadHasMore = broadOffset + raw < BROAD;
    const clientHasMore = resolveRadioSearchHasMore(raw, PAGE, broadHasMore);
    // No client max of 2000
    assert(clientHasMore || !broadHasMore, "no artificial 2000 stop");
    broadOffset += PAGE;
    broadPages += 1;
    if (!clientHasMore) break;
  }
  assertEqual(broadPages, Math.ceil(BROAD / PAGE), "25k+ pages reachable");

  console.log("radio-uncapped-search: ok");
}

main();
