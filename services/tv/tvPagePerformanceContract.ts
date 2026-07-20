/**
 * Pure contracts for TV browse page performance (catalogue UI only).
 * Cards never own players. Playback stays on the existing TV session owner.
 */

export function resolveTvPageInitialLoadContract() {
  return {
    boundedHomeRequest: true as const,
    downloadsFullCatalogueOnMount: false as const,
    oneRequestPerCategoryOnMount: false as const,
    oneRequestPerCardOnMount: false as const,
    usesCachedHomeWhenAvailable: true as const,
    shellRendersBeforeAllLanes: true as const,
  };
}

export function resolveTvPageListVirtualizationContract(input: {
  outerListVirtualized: boolean;
  searchCategoryUsesMappedFullGrid: boolean;
  searchCategoryUsesVirtualizedRows: boolean;
  homeLanePreviewCapped: boolean;
}) {
  return {
    mainVerticalListVirtualized: input.outerListVirtualized,
    searchCategoryMappedFullGridForbidden: !input.searchCategoryUsesMappedFullGrid,
    searchCategoryVirtualizedRows: input.searchCategoryUsesVirtualizedRows,
    homeLanePreviewCapped: input.homeLanePreviewCapped,
    cardsDoNotOwnPlayers: true as const,
    cardsDoNotCallPlayOnRender: true as const,
  };
}

export function resolveTvPageSearchContract() {
  return {
    searchInputStableOutsideList: true as const,
    searchDebounced: true as const,
    searchLatestWinsCancellable: true as const,
    emptyQueryRestoresBrowseWithoutRemount: true as const,
    abortedSearchNotCachedAsSuccess: true as const,
  };
}

export function resolveTvPageCardContract() {
  return {
    stableChannelIdKeys: true as const,
    playbackProgressNotInEveryCardProp: true as const,
    favoritesNotReadPerCard: true as const,
    historyNotReadPerCard: true as const,
    referencesHiddenAudio: false as const,
    referencesPlayerContext: false as const,
    createsSecondPlayer: false as const,
    createsSecondVideoView: false as const,
    productionPerfPolling: false as const,
  };
}

export function resolveTvPagePaginationContract(input: {
  parallelDuplicateLoadsPrevented: boolean;
  dedupeByStableId: boolean;
}) {
  return {
    parallelDuplicateLoadsPrevented: input.parallelDuplicateLoadsPrevented,
    dedupeByStableId: input.dedupeByStableId,
    onePlayRequestPerAcceptedTap: true as const,
  };
}

/** Chunk catalogue videos into FlatList-virtualizable grid rows (2 columns). */
export function chunkTvVideosForVirtualizedRows<T>(
  videos: T[],
  columns = 2
): T[][] {
  const rows: T[][] = [];
  const cols = Math.max(1, columns);
  for (let i = 0; i < videos.length; i += cols) {
    rows.push(videos.slice(i, i + cols));
  }
  return rows;
}
