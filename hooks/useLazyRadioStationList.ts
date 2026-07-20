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
} from "../services/radio/radioCache";
import { dedupeStationsById } from "../utils/dedupeStationsById";
import { shouldRevalidateShortRadioSearchCache } from "../utils/radioSearchCachePolicy";

type LoadPageResult = {
  stations: HiddenTunesStation[];
  hasMore: boolean;
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
    return dedupeStationsById(cachedPage.map(toRadioStationListItem));
  });

  const [loading, setLoading] = useState(() => enabled && listItems.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => listItems.length > 0);

  const rememberStations = useCallback((stations: HiddenTunesStation[]) => {
    stations.forEach((station) => {
      stationStoreRef.current.set(station.id, station);
    });
  }, []);

  const applyPage = useCallback(
    (stations: HiddenTunesStation[], append: boolean, nextHasMore: boolean) => {
      if (!mountedRef.current) return;
      rememberStations(stations);
      const nextItems = stations.map(toRadioStationListItem);

      setListItems((current) => {
        const combined = append ? [...current, ...nextItems] : nextItems;
        const unique = dedupeStationsById(combined);

        if (
          typeof __DEV__ !== "undefined" &&
          __DEV__ &&
          requestKey.startsWith("search:")
        ) {
          console.log("[RadioSearchDedup]", {
            incoming: nextItems.length,
            previous: current.length,
            combined: combined.length,
            unique: unique.length,
            duplicatesRemoved: combined.length - unique.length,
          });
        }

        if (!append && listItemsMatch(current, unique)) return current;
        return unique;
      });
      setHasMore(nextHasMore);
      setHasLoadedOnce(true);
    },
    [rememberStations, requestKey]
  );

  const fetchPage = useCallback(
    async (offset: number, append: boolean, forceRefresh: boolean) => {
      const generation = requestGenerationRef.current;
      const result = await loadPageRef.current(offset, { append, forceRefresh });
      if (generation !== requestGenerationRef.current) return;
      applyPage(result.stations, append, result.hasMore);
    },
    [applyPage]
  );

  useEffect(() => {
    if (!enabled || !cacheKey) {
      requestGenerationRef.current += 1;
      cancelRadioBrowseRequest(requestKey);
      stationStoreRef.current.clear();
      setListItems([]);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setHasMore(false);
      setHasLoadedOnce(false);
      return;
    }

    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    let cancelled = false;

    const cachedPage = readCachedRadioPage(cacheKey, 0, RADIO_STATION_PAGE_SIZE);
    const needsShortRevalidate = shouldRevalidateShortRadioSearchCache(
      cacheKey,
      cachedPage.length,
      RADIO_STATION_PAGE_SIZE
    );
    const hasFreshCache =
      cachedPage.length > 0 && isRadioCacheFresh(cacheKey) && !needsShortRevalidate;

    if (cachedPage.length) {
      rememberStations(cachedPage);
      setListItems(dedupeStationsById(cachedPage.map(toRadioStationListItem)));
      // Short catalog-search pages must not lock hasMore=false (poisoned 9-row caches).
      setHasMore(cachedPage.length >= RADIO_STATION_PAGE_SIZE || needsShortRevalidate);
      setLoading(false);
      setHasLoadedOnce(true);
    } else {
      stationStoreRef.current.clear();
      setListItems([]);
      setHasMore(true);
      setLoading(true);
      setHasLoadedOnce(false);
    }

    const run = async () => {
      if (!cachedPage.length) {
        const hydrated = await hydrateCachedRadioStations(cacheKey);
        if (cancelled || generation !== requestGenerationRef.current) return;

        if (hydrated?.length) {
          const hydratedPage = hydrated.slice(0, RADIO_STATION_PAGE_SIZE);
          const hydratedNeedsRevalidate = shouldRevalidateShortRadioSearchCache(
            cacheKey,
            hydratedPage.length,
            RADIO_STATION_PAGE_SIZE
          );
          rememberStations(hydratedPage);
          setListItems(dedupeStationsById(hydratedPage.map(toRadioStationListItem)));
          setHasMore(
            hydrated.length >= RADIO_STATION_PAGE_SIZE || hydratedNeedsRevalidate
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
    };

    void run();

    return () => {
      cancelled = true;
      requestGenerationRef.current += 1;
      cancelRadioBrowseRequest(requestKey);
    };
  }, [cacheKey, enabled, fetchPage, rememberStations, requestKey]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchPage(0, false, true).finally(() => {
      if (mountedRef.current) setRefreshing(false);
    });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || refreshing || !hasMore || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    void fetchPage(listItems.length, true, false).finally(() => {
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    });
  }, [
    enabled,
    fetchPage,
    hasMore,
    listItems.length,
    loading,
    loadingMore,
    refreshing,
  ]);

  const resolveStation = useCallback(
    (stationId: string) => stationStoreRef.current.get(stationId) || null,
    []
  );

  const listCountLabel = useMemo(() => {
    if (!listItems.length) return "";
    return `${listItems.length} live station${listItems.length === 1 ? "" : "s"}`;
  }, [listItems.length]);

  return {
    listItems,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    hasLoadedOnce,
    onRefresh,
    loadMore,
    resolveStation,
    listCountLabel,
  };
}
