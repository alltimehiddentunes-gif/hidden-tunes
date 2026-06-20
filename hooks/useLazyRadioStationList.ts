import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import {
  cancelRadioBrowseRequest,
  RADIO_STATION_PAGE_SIZE,
} from "../services/radio/radioBrowserApi";
import { readCachedRadioPage } from "../services/radio/radioCache";

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

export function useLazyRadioStationList({
  cacheKey,
  requestKey,
  enabled = true,
  loadPage,
}: UseLazyRadioStationListOptions) {
  const stationStoreRef = useRef(new Map<string, HiddenTunesStation>());
  const requestGenerationRef = useRef(0);

  const [listItems, setListItems] = useState<RadioStationListItem[]>(() => {
    if (!enabled || !cacheKey) return [];
    const cachedPage = readCachedRadioPage(cacheKey, 0, RADIO_STATION_PAGE_SIZE);
    cachedPage.forEach((station) => {
      stationStoreRef.current.set(station.id, station);
    });
    return cachedPage.map(toRadioStationListItem);
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
      rememberStations(stations);
      const nextItems = stations.map(toRadioStationListItem);
      setListItems((current) => (append ? [...current, ...nextItems] : nextItems));
      setHasMore(nextHasMore);
      setHasLoadedOnce(true);
    },
    [rememberStations]
  );

  const fetchPage = useCallback(
    async (offset: number, append: boolean, forceRefresh: boolean) => {
      const generation = requestGenerationRef.current;
      const result = await loadPage(offset, { append, forceRefresh });
      if (generation !== requestGenerationRef.current) return;
      applyPage(result.stations, append, result.hasMore);
    },
    [applyPage, loadPage]
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

    stationStoreRef.current.clear();

    const cachedPage = readCachedRadioPage(cacheKey, 0, RADIO_STATION_PAGE_SIZE);
    if (cachedPage.length) {
      rememberStations(cachedPage);
      setListItems(cachedPage.map(toRadioStationListItem));
      setHasMore(cachedPage.length >= RADIO_STATION_PAGE_SIZE);
      setLoading(false);
      setHasLoadedOnce(true);
    } else {
      setListItems([]);
      setHasMore(true);
      setLoading(true);
      setHasLoadedOnce(false);
    }

    void fetchPage(0, false, false).finally(() => {
      if (generation === requestGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    });

    return () => {
      requestGenerationRef.current += 1;
      cancelRadioBrowseRequest(requestKey);
    };
  }, [cacheKey, enabled, fetchPage, rememberStations, requestKey]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchPage(0, false, true).finally(() => setRefreshing(false));
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || refreshing || !hasMore) return;

    setLoadingMore(true);
    void fetchPage(listItems.length, true, false).finally(() => setLoadingMore(false));
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
