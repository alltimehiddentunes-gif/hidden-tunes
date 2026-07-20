import {
  chunkTvVideosForVirtualizedRows,
  resolveTvPageCardContract,
  resolveTvPageInitialLoadContract,
  resolveTvPageListVirtualizationContract,
  resolveTvPagePaginationContract,
  resolveTvPageSearchContract,
} from "../services/tv/tvPagePerformanceContract";

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function main() {
  const initial = resolveTvPageInitialLoadContract();
  assert(initial.boundedHomeRequest, "1. bounded initial");
  assertEqual(initial.downloadsFullCatalogueOnMount, false, "2. no full catalogue");

  const list = resolveTvPageListVirtualizationContract({
    outerListVirtualized: true,
    searchCategoryUsesMappedFullGrid: false,
    searchCategoryUsesVirtualizedRows: true,
    homeLanePreviewCapped: true,
  });
  assert(list.mainVerticalListVirtualized, "3. outer virtualized");
  assert(list.searchCategoryVirtualizedRows, "3b. search rows virtualized");
  assert(list.searchCategoryMappedFullGridForbidden, "3c. no full mapped grid");
  assert(list.cardsDoNotOwnPlayers, "7. cards no players");
  assert(list.cardsDoNotCallPlayOnRender, "8. no play on render");

  const search = resolveTvPageSearchContract();
  assert(search.searchInputStableOutsideList, "4. search stable");
  assert(search.searchLatestWinsCancellable, "5. search cancellable");

  const rows = chunkTvVideosForVirtualizedRows(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    2
  );
  assertEqual(rows.length, 2, "6. chunk rows");
  assertEqual(rows[0].length, 2, "6b. first row");
  assertEqual(rows[1].length, 1, "6c. remainder");

  const cards = resolveTvPageCardContract();
  assert(cards.stableChannelIdKeys, "6d. stable keys");
  assert(cards.playbackProgressNotInEveryCardProp, "16. no progress props");
  assert(cards.favoritesNotReadPerCard, "15. no fav per card");
  assertEqual(cards.createsSecondPlayer, false, "17. no second player");
  assertEqual(cards.referencesHiddenAudio, false, "19. no HiddenAudio");
  assertEqual(cards.productionPerfPolling, false, "20. no polling");

  const page = resolveTvPagePaginationContract({
    parallelDuplicateLoadsPrevented: true,
    dedupeByStableId: true,
  });
  assert(page.parallelDuplicateLoadsPrevented, "13. no parallel dup loads");
  assert(page.dedupeByStableId, "14. dedupe ids");
  assert(page.onePlayRequestPerAcceptedTap, "9. one play per tap");

  console.log("PASS: tv-page-performance-contract");
}

main();
