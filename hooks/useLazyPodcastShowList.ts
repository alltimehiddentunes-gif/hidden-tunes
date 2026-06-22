import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MEDIA_DISCOVERY_PAGE_SIZE } from "../constants/mediaDiscovery";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import {
  hydrateCachedPodcastShows,
  readCachedPodcastShows,
} from "../utils/podcastDiscoveryCache";
import { filterVisiblePodcastShows } from "../utils/maturePodcastVisibility";

type LoadPageResult = {
  shows: HiddenTunesPodcastShow[];
  hasMore: boolean;
};

type UseLazyPodcastShowListOptions = {
  cacheKey: string;
  enabled?: boolean;
  loadPage: (
    offset: number,
    options: { append: boolean; forceRefresh: boolean }
  ) => Promise<LoadPageResult>;
};

function listIdsMatch(current: HiddenTunesPodcastShow[], next: HiddenTunesPodcastShow[]) {
  if (current.length !== next.length) return false;
  return current.every((item, index) => item.id === next[index]?.id);
}

function dedupeShows(shows: HiddenTunesPodcastShow[]) {
  const seen = new Set<string>();
  const deduped: HiddenTunesPodcastShow[] = [];

  for (const show of shows) {
    if (seen.has(show.id)) continue;
    seen.add(show.id);
    deduped.push(show);
  }

  return deduped;
}

export function useLazyPodcastShowList({
  cacheKey,
  enabled = true,
  loadPage,
}: UseLazyPodcastShowListOptions) {
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

  const readCachedFirstPage = useCallback((key: string) => {
    const cached = readCachedPodcastShows(key);
    if (!cached?.length) return [];
    return filterVisiblePodcastShows(cached.slice(0, MEDIA_DISCOVERY_PAGE_SIZE));
  }, []);

  const [shows, setShows] = useState<HiddenTunesPodcastShow[]>(() =>
    enabled && cacheKey ? readCachedFirstPage(cacheKey) : []
  );
  const [loading, setLoading] = useState(() => enabled && shows.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => shows.length > 0);
  const [page, setPage] = useState(() => (shows.length > 0 ? 1 : 0));

  const applyPage = useCallback(
    (nextShows: HiddenTunesPodcastShow[], append: boolean, nextHasMore: boolean) => {
      if (!mountedRef.current) return;
      setShows((current) => {
        const merged = append ? dedupeShows([...current, ...nextShows]) : nextShows;
        if (!append && listIdsMatch(current, merged)) return current;
        return merged;
      });
      setHasMore(nextHasMore);
      setHasLoadedOnce(true);
      setPage((currentPage) => (append ? currentPage + 1 : 1));
    },
    []
  );

  const fetchPage = useCallback(
    async (offset: number, append: boolean, forceRefresh: boolean) => {
      const generation = requestGenerationRef.current;
      const result = await loadPageRef.current(offset, { append, forceRefresh });
      if (generation !== requestGenerationRef.current) return;
      applyPage(result.shows, append, result.hasMore);
    },
    [applyPage]
  );

  useEffect(() => {
    if (!enabled || !cacheKey) {
      requestGenerationRef.current += 1;
      setShows([]);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setHasMore(false);
      setHasLoadedOnce(false);
      setPage(0);
      return;
    }

    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    let cancelled = false;

    const cachedPage = readCachedFirstPage(cacheKey);

    if (cachedPage.length) {
      setShows(cachedPage);
      setHasMore(cachedPage.length >= MEDIA_DISCOVERY_PAGE_SIZE);
      setLoading(false);
      setHasLoadedOnce(true);
      setPage(1);
    } else {
      setShows([]);
      setHasMore(true);
      setLoading(true);
      setHasLoadedOnce(false);
      setPage(0);
    }

    const run = async () => {
      if (!cachedPage.length) {
        const hydrated = await hydrateCachedPodcastShows(cacheKey);
        if (cancelled || generation !== requestGenerationRef.current || !mountedRef.current) return;

        if (hydrated?.length) {
          const visible = filterVisiblePodcastShows(
            hydrated.slice(0, MEDIA_DISCOVERY_PAGE_SIZE)
          );
          setShows(visible);
          setHasMore(hydrated.length >= MEDIA_DISCOVERY_PAGE_SIZE);
          setLoading(false);
          setHasLoadedOnce(true);
          setPage(1);
          return;
        }
      } else {
        return;
      }

      await fetchPage(0, false, false);
      if (generation === requestGenerationRef.current && mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      requestGenerationRef.current += 1;
    };
  }, [cacheKey, enabled, fetchPage, readCachedFirstPage]);

  const onRefresh = useCallback(() => {
    const generation = requestGenerationRef.current;
    setRefreshing(true);
    void fetchPage(0, false, true).finally(() => {
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      setRefreshing(false);
    });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || refreshing || !hasMore || loadingMoreRef.current) {
      return;
    }

    const generation = requestGenerationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void fetchPage(shows.length, true, false).finally(() => {
      loadingMoreRef.current = false;
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      setLoadingMore(false);
    });
  }, [enabled, fetchPage, hasMore, loading, loadingMore, refreshing, shows.length]);

  const listCountLabel = useMemo(() => {
    if (!shows.length) return "";
    return `${shows.length} Hidden Tunes show${shows.length === 1 ? "" : "s"}`;
  }, [shows.length]);

  const paginationState = useMemo(
    () => ({
      page,
      pageSize: MEDIA_DISCOVERY_PAGE_SIZE,
      hasMore,
      isLoadingMore: loadingMore,
      activeQuery: cacheKey.startsWith("search:") ? cacheKey.slice("search:".length) : "",
      activeCategory: cacheKey.startsWith("search:") ? "" : cacheKey,
      activeCountry: "",
      activeLanguage: "",
      activeGenre: "",
    }),
    [cacheKey, hasMore, loadingMore, page]
  );

  return {
    shows,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    hasLoadedOnce,
    page,
    paginationState,
    onRefresh,
    loadMore,
    listCountLabel,
  };
}
