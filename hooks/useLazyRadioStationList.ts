import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import {
  cancelRadioBrowseRequest,
  RADIO_STATION_PAGE_SIZE,
} from "../services/radio/radioBrowserApi";
import {
  hydrateCachedRadioStations,
  isRadioCacheFresh,
  readCachedRadioPage,
  readRadioCachePaginationMeta,
} from "../services/radio/radioCache";
import { dedupeStationsById } from "../utils/dedupeStationsById";
import {
  isCatalogRadioSearchCacheKey,
  RADIO_SEARCH_MAX_CONSECUTIVE_EMPTY_PAGES,
  shouldRevalidateShortRadioSearchCache,
} from "../utils/radioSearchCachePolicy";
import { isCatalogAbortError, isCatalogTimeoutError } from "../services/catalogJsonFetch";

type LoadPageResult = {
  stations: HiddenTunesStation[];
  hasMore: boolean;
  backendTotal?: number;
  backendPageRowCount?: number;
  backendNextOffset?: number;
  rawBackendRowsReturned?: number;
  source?: string;
  stopReason?: string;
};

type UseLazyRadioStationListOptions = {
  cacheKey: string;
  requestKey: string;
  enabled?: boolean;
  loadPage: (
    offset: number,
    options: { append: boolean; forceRefresh: boolean }
  ) => Promise<LoadPageResult>;
};

function listItemsMatch(
  current: RadioStationListItem[],
  next: RadioStationListItem[]
) {
  if (current.length !== next.length) return false;
  return current.every((item, index) => item.id === next[index]?.id);
}

function logListPageDiag(payload: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log("[RadioSearchTrace]", payload);
}

export function useLazyRadioStationList({
  cacheKey,
  requestKey,
  enabled = true,
  loadPage,
}: UseLazyRadioStationListOptions) {
  const stationStoreRef = useRef(new Map<string, HiddenTunesStation>());
  const requestGenerationRef = useRef(0);
  const loadPageRef = useRef(loadPage);
  const loadingMoreRef = useRef(false);
  const mountedRef = useRef(true);
  /** Backend page cursor — advances by PAGE_SIZE, not filtered UI length. */
  const nextOffsetRef = useRef(0);
  const consecutiveEmptyPagesRef = useRef(0);
  const backendTotalRef = useRef<number | undefined>(undefined);
  const pagesRequestedRef = useRef(0);
  /** O(1) membership for append dedupe — avoid full-list rededupe each page. */
  const seenListIdsRef = useRef(new Set<string>());

  loadPageRef.current = loadPage;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [listItems, setListItems] = useState<RadioStationListItem[]>(() => {
    if (!enabled || !cacheKey) return [];
    const cachedPage = readCachedRadioPage(cacheKey, 0, RADIO_STATION_PAGE_SIZE);
    cachedPage.forEach((station) => {
      stationStoreRef.current.set(station.id, station);
    });
    const meta = readRadioCachePaginationMeta(cacheKey);
    // Only the first cache page is painted here — always resume at backend
    // page 2 (offset 40), never jump via stale nextBackendOffset.
    nextOffsetRef.current = cachedPage.length ? RADIO_STATION_PAGE_SIZE : 0;
    backendTotalRef.current = meta?.backendTotal;
    const items = dedupeStationsById(cachedPage.map(toRadioStationListItem));
    seenListIdsRef.current = new Set(items.map((item) => item.id));
    return items;
  });

  const [loading, setLoading] = useState(() => enabled && listItems.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => listItems.length > 0);
  const [backendTotal, setBackendTotal] = useState<number | undefined>(() => {
    if (!enabled || !cacheKey) return undefined;
    return readRadioCachePaginationMeta(cacheKey)?.backendTotal;
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  const rememberStations = useCallback((stations: HiddenTunesStation[]) => {
    stations.forEach((station) => {
      stationStoreRef.current.set(station.id, station);
    });
  }, []);

  const applyPage = useCallback(
    (
      stations: HiddenTunesStation[],
      append: boolean,
      nextHasMore: boolean,
      requestOffset: number,
      meta?: {
        backendTotal?: number;
        backendPageRowCount?: number;
        backendNextOffset?: number;
        rawBackendRowsReturned?: number;
        source?: string;
        stopReason?: string;
      }
    ) => {
      if (!mountedRef.current) return { uniqueAdded: 0, visibleCount: 0 };

      rememberStations(stations);
      const nextItems = stations.map(toRadioStationListItem);
      let uniqueAdded = 0;
      let visibleCount = 0;

      setListItems((current) => {
        if (!append) {
          const unique = dedupeStationsById(nextItems);
          seenListIdsRef.current = new Set(unique.map((item) => item.id));
          uniqueAdded = unique.length;
          visibleCount = unique.length;
          if (listItemsMatch(current, unique)) return current;
          return unique;
        }

        // O(page): only scan the new page against an id set.
        const seen = seenListIdsRef.current;
        const added: RadioStationListItem[] = [];
        for (const item of nextItems) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          added.push(item);
        }
        uniqueAdded = added.length;
        visibleCount = current.length + added.length;
        if (!added.length) return current;
        return current.concat(added);
      });

      // Page-based backend: prefer backendNextOffset; else advance by PAGE_SIZE.
      // Never use normalized/unique counts (would rematerialize page 1 after short pages).
      if (typeof meta?.backendNextOffset === "number" && Number.isFinite(meta.backendNextOffset)) {
        nextOffsetRef.current = meta.backendNextOffset;
      } else if (nextHasMore) {
        nextOffsetRef.current = requestOffset + RADIO_STATION_PAGE_SIZE;
      } else {
        nextOffsetRef.current = requestOffset + RADIO_STATION_PAGE_SIZE;
      }
      setHasMore(nextHasMore);
      setHasLoadedOnce(true);

      if (typeof meta?.backendTotal === "number" && Number.isFinite(meta.backendTotal)) {
        backendTotalRef.current = meta.backendTotal;
        setBackendTotal(meta.backendTotal);
      }

      logListPageDiag({
        query: cacheKey,
        requestOffset,
        requestLimit: RADIO_STATION_PAGE_SIZE,
        rawBackendRowsReturned: meta?.rawBackendRowsReturned ?? meta?.backendPageRowCount,
        backendTotal: backendTotalRef.current ?? meta?.backendTotal,
        backendHasMore: nextHasMore,
        backendNextOffset: nextOffsetRef.current,
        normalizedRows: stations.length,
        uniqueAdded,
        source: meta?.source,
        stopReason: meta?.stopReason,
      });

      return { uniqueAdded, visibleCount };
    },
    [cacheKey, rememberStations]
  );

  const fetchPage = useCallback(
    async (offset: number, append: boolean, forceRefresh: boolean) => {
      const generation = requestGenerationRef.current;
      try {
        pagesRequestedRef.current += 1;
        const hasMoreBefore = true;
        const result = await loadPageRef.current(offset, { append, forceRefresh });
        if (generation !== requestGenerationRef.current) return;

        // Stale/bounded timeout must not clobber a newer successful paint.
        if (
          result.stopReason === "catalog-timeout-cache-preserved" ||
          result.source === "cache-timeout"
        ) {
          if (seenListIdsRef.current.size > 0) {
            setHasLoadedOnce(true);
            return;
          }
        }

        setLoadError(null);
        const applied = applyPage(result.stations, append, result.hasMore, offset, {
          backendTotal: result.backendTotal,
          backendPageRowCount: result.backendPageRowCount,
          backendNextOffset: result.backendNextOffset,
          rawBackendRowsReturned: result.rawBackendRowsReturned,
          source: result.source,
          stopReason: result.stopReason,
        });

        // Zero-add page: backend may still have pages (HTTPS filter / dedupe).
        // Continue with a bounded guard so FlatList onEndReached is not required.
        if (applied.uniqueAdded > 0) {
          consecutiveEmptyPagesRef.current = 0;
        } else if (append && result.hasMore) {
          consecutiveEmptyPagesRef.current += 1;
          if (
            consecutiveEmptyPagesRef.current < RADIO_SEARCH_MAX_CONSECUTIVE_EMPTY_PAGES
          ) {
            logListPageDiag({
              cacheKey,
              requestOffset: offset,
              uniqueAdded: 0,
              hasMoreBefore,
              hasMoreAfter: result.hasMore,
              emptyStreak: consecutiveEmptyPagesRef.current,
              stopReason: "zero-add-continue",
            });
            if (generation !== requestGenerationRef.current) return;
            await fetchPage(nextOffsetRef.current, true, false);
            return;
          }

          setHasMore(false);
          logListPageDiag({
            cacheKey,
            requestOffset: offset,
            stopReason: "empty-page-guard",
            emptyStreak: consecutiveEmptyPagesRef.current,
          });
        }
      } catch (error) {
        // Expected cancellation from query change / unmount — never LogBox.
        if (isCatalogAbortError(error) || (error as Error)?.name === "AbortError") {
          return;
        }
        // Bounded catalog timeout — keep visible cache, do not exhaust pagination,
        // do not become an unhandled rejection / LogBox TimeoutError.
        if (isCatalogTimeoutError(error)) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.warn("[RadioList] catalog_api_timeout (preserved cache)", {
              cacheKey,
              offset,
              append,
              visibleCount: seenListIdsRef.current.size,
            });
          }
          if (generation === requestGenerationRef.current) {
            setHasLoadedOnce(true);
          }
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.warn("[RadioList] page load failed", {
            cacheKey,
            offset,
            message,
          });
        }
        if (generation === requestGenerationRef.current) {
          setHasLoadedOnce(true);
          setLoadError(message);
        }
        return;
      }
    },
    [applyPage, cacheKey]
  );

  useEffect(() => {
    if (!enabled || !cacheKey) {
      requestGenerationRef.current += 1;
      cancelRadioBrowseRequest(requestKey);
      stationStoreRef.current.clear();
      nextOffsetRef.current = 0;
      consecutiveEmptyPagesRef.current = 0;
      pagesRequestedRef.current = 0;
      backendTotalRef.current = undefined;
      seenListIdsRef.current.clear();
      loadingMoreRef.current = false;
      setListItems([]);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setHasMore(false);
      setHasLoadedOnce(false);
      setBackendTotal(undefined);
      setLoadError(null);
      return;
    }

    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    let cancelled = false;
    loadingMoreRef.current = false;
    consecutiveEmptyPagesRef.current = 0;
    pagesRequestedRef.current = 0;
    nextOffsetRef.current = 0;
    seenListIdsRef.current.clear();
    setLoadError(null);

    const cachedPage = readCachedRadioPage(cacheKey, 0, RADIO_STATION_PAGE_SIZE);
    const meta = readRadioCachePaginationMeta(cacheKey);
    backendTotalRef.current = meta?.backendTotal;
    if (typeof meta?.backendTotal === "number") {
      setBackendTotal(meta.backendTotal);
    }

    const needsShortRevalidate = shouldRevalidateShortRadioSearchCache(
      cacheKey,
      cachedPage.length,
      RADIO_STATION_PAGE_SIZE
    );
    const hasFreshCache =
      cachedPage.length > 0 && isRadioCacheFresh(cacheKey) && !needsShortRevalidate;

    if (cachedPage.length) {
      rememberStations(cachedPage);
      const items = dedupeStationsById(cachedPage.map(toRadioStationListItem));
      seenListIdsRef.current = new Set(items.map((item) => item.id));
      setListItems(items);
      nextOffsetRef.current = RADIO_STATION_PAGE_SIZE;
      // Catalog-search: incomplete playable caches must not lock hasMore=false.
      const catalogSearch = isCatalogRadioSearchCacheKey(cacheKey);
      setHasMore(
        catalogSearch
          ? meta?.backendHasMore !== false
          : cachedPage.length >= RADIO_STATION_PAGE_SIZE || needsShortRevalidate
      );
      setLoading(false);
      setLoadingMore(false);
      setHasLoadedOnce(true);
    } else {
      stationStoreRef.current.clear();
      setListItems([]);
      setHasMore(true);
      setLoading(true);
      setLoadingMore(false);
      setHasLoadedOnce(false);
      setBackendTotal(undefined);
    }

    const run = async () => {
      try {
        if (!cachedPage.length) {
          const hydrated = await hydrateCachedRadioStations(cacheKey);
          if (cancelled || generation !== requestGenerationRef.current) return;

          if (hydrated?.length) {
            const hydratedMeta = readRadioCachePaginationMeta(cacheKey);
            const hydratedPage = hydrated.slice(0, RADIO_STATION_PAGE_SIZE);
            const hydratedNeedsRevalidate = shouldRevalidateShortRadioSearchCache(
              cacheKey,
              hydratedPage.length,
              RADIO_STATION_PAGE_SIZE
            );
            rememberStations(hydratedPage);
            const items = dedupeStationsById(hydratedPage.map(toRadioStationListItem));
            seenListIdsRef.current = new Set(items.map((item) => item.id));
            setListItems(items);
            nextOffsetRef.current = RADIO_STATION_PAGE_SIZE;
            backendTotalRef.current = hydratedMeta?.backendTotal;
            if (typeof hydratedMeta?.backendTotal === "number") {
              setBackendTotal(hydratedMeta.backendTotal);
            }
            const catalogSearch = isCatalogRadioSearchCacheKey(cacheKey);
            setHasMore(
              catalogSearch
                ? hydratedMeta?.backendHasMore !== false
                : hydrated.length >= RADIO_STATION_PAGE_SIZE || hydratedNeedsRevalidate
            );
            setLoading(false);
            setHasLoadedOnce(true);

            if (isRadioCacheFresh(cacheKey) && !hydratedNeedsRevalidate) return;

            await fetchPage(0, false, hydratedNeedsRevalidate);
            if (generation === requestGenerationRef.current) {
              setLoading(false);
              setRefreshing(false);
            }
            return;
          }
        }

        if (hasFreshCache) return;

        await fetchPage(0, false, needsShortRevalidate);
        if (generation === requestGenerationRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      } catch (error) {
        // Belt-and-suspenders: fetchPage should catch timeouts; never leave void run() unhandled.
        if (isCatalogAbortError(error) || isCatalogTimeoutError(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.warn("[RadioList] initial load failed", {
            cacheKey,
            message,
          });
        }
        if (generation === requestGenerationRef.current) {
          setLoadError(message);
        }
      } finally {
        if (!cancelled && generation === requestGenerationRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      requestGenerationRef.current += 1;
      cancelRadioBrowseRequest(requestKey);
      loadingMoreRef.current = false;
    };
  }, [cacheKey, enabled, fetchPage, rememberStations, requestKey]);

  const onRefresh = useCallback(() => {
    requestGenerationRef.current += 1;
    cancelRadioBrowseRequest(requestKey);
    loadingMoreRef.current = false;
    consecutiveEmptyPagesRef.current = 0;
    pagesRequestedRef.current = 0;
    nextOffsetRef.current = 0;
    setLoadingMore(false);
    setRefreshing(true);
    const generation = requestGenerationRef.current;
    void fetchPage(0, false, true).finally(() => {
      if (mountedRef.current && generation === requestGenerationRef.current) {
        setRefreshing(false);
      }
    });
  }, [fetchPage, requestKey]);

  const loadMore = useCallback(() => {
    if (
      !enabled ||
      loading ||
      loadingMore ||
      refreshing ||
      !hasMore ||
      loadingMoreRef.current
    ) {
      return;
    }

    const offset = nextOffsetRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void fetchPage(offset, true, false).finally(() => {
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    });
  }, [enabled, fetchPage, hasMore, loading, loadingMore, refreshing]);

  const resolveStation = useCallback(
    (stationId: string) => stationStoreRef.current.get(stationId) || null,
    []
  );

  // Prefer backend total when known; never claim "live/playable" for untested rows.
  const listCountLabel = useMemo(() => {
    if (!listItems.length) return "";
    const loaded = listItems.length;
    const total =
      typeof backendTotal === "number" && Number.isFinite(backendTotal) && backendTotal > 0
        ? backendTotal
        : undefined;
    const fmt = (n: number) => n.toLocaleString("en-US");
    if (total != null && loaded < total) {
      return `${fmt(loaded)} loaded of ${fmt(total)} stations`;
    }
    if (total != null) {
      return `${fmt(total)} station${total === 1 ? "" : "s"}`;
    }
    return `${fmt(loaded)} station${loaded === 1 ? "" : "s"}`;
  }, [backendTotal, listItems.length]);

  const upsertStation = useCallback((station: HiddenTunesStation) => {
    if (!station?.id) return;
    stationStoreRef.current.set(station.id, station);
  }, []);

  return {
    listItems,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    hasLoadedOnce,
    loadError,
    onRefresh,
    loadMore,
    resolveStation,
    upsertStation,
    listCountLabel,
    backendTotal,
  };
}
