import { useCallback, useEffect, useRef, useState } from "react";

import { useMountedRef } from "./useMountedRef";

import { MEDIA_DISCOVERY_PAGE_SIZE } from "../constants/mediaDiscovery";
import type { HiddenTunesPodcastEpisode } from "../services/podcastCatalogApi";
import {
  hydrateCachedPodcastEpisodes,
  readCachedPodcastEpisodes,
} from "../utils/podcastDiscoveryCache";
import {
  enrichEpisodesWithShowMaturity,
  filterVisiblePodcastEpisodes,
} from "../utils/maturePodcastVisibility";
import { filterPlayablePodcastEpisodes } from "../services/podcast/podcastDiscoverability";
import { clearRssEpisodeCacheForShow } from "../services/podcast/podcastItunesRssSource";
import {
  createDiscoveryScreenController,
  type DiscoveryScreenController,
} from "../utils/discoveryRequestManager";

type LoadPageOptions = {
  append: boolean;
  forceRefresh: boolean;
  signal?: AbortSignal;
};

type LoadPageResult = {
  episodes: HiddenTunesPodcastEpisode[];
  hasMore: boolean;
};

type UseLazyPodcastEpisodeListOptions = {
  showId: string;
  showIsMature?: boolean;
  enabled?: boolean;
  /** When set, fetches run through discoveryRequestManager with abort support. */
  discoveryScreen?: string;
  loadPage: (offset: number, options: LoadPageOptions) => Promise<LoadPageResult>;
};

function dedupeEpisodes(episodes: HiddenTunesPodcastEpisode[]) {
  const seen = new Set<string>();
  const deduped: HiddenTunesPodcastEpisode[] = [];

  for (const episode of episodes) {
    if (seen.has(episode.id)) continue;
    seen.add(episode.id);
    deduped.push(episode);
  }

  return deduped;
}

export function useLazyPodcastEpisodeList({
  showId,
  showIsMature = false,
  enabled = true,
  discoveryScreen = "podcast-show-episodes",
  loadPage,
}: UseLazyPodcastEpisodeListOptions) {
  const requestGenerationRef = useRef(0);
  const loadPageRef = useRef(loadPage);
  const loadingMoreRef = useRef(false);
  const mountedRef = useMountedRef();
  const discoveryControllerRef = useRef<DiscoveryScreenController | null>(null);

  loadPageRef.current = loadPage;

  useEffect(() => {
    const controller = createDiscoveryScreenController(discoveryScreen);
    discoveryControllerRef.current = controller;

    return () => {
      controller.bumpGeneration();
      clearRssEpisodeCacheForShow(showId);
      discoveryControllerRef.current = null;
    };
  }, [discoveryScreen, showId]);

  const normalizeVisible = useCallback(
    (items: HiddenTunesPodcastEpisode[]) => {
      const enriched = enrichEpisodesWithShowMaturity(items, showIsMature);
      return filterPlayablePodcastEpisodes(
        filterVisiblePodcastEpisodes(enriched, { showIsMature })
      );
    },
    [showIsMature]
  );

  const readCachedFirstPage = useCallback(
    (id: string) => {
      const cached = readCachedPodcastEpisodes(id);
      if (!cached?.length) return [];
      return normalizeVisible(cached.slice(0, MEDIA_DISCOVERY_PAGE_SIZE));
    },
    [normalizeVisible]
  );

  const [episodes, setEpisodes] = useState<HiddenTunesPodcastEpisode[]>(() =>
    enabled && showId ? readCachedFirstPage(showId) : []
  );
  const [loading, setLoading] = useState(() => enabled && episodes.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => episodes.length > 0);

  const applyPage = useCallback(
    (nextEpisodes: HiddenTunesPodcastEpisode[], append: boolean, nextHasMore: boolean) => {
      setEpisodes((current) => {
        const merged = append ? dedupeEpisodes([...current, ...nextEpisodes]) : nextEpisodes;
        return merged;
      });
      setHasMore(nextHasMore);
      setHasLoadedOnce(true);
    },
    []
  );

  const fetchPage = useCallback(
    async (offset: number, append: boolean, forceRefresh: boolean) => {
      const generation = requestGenerationRef.current;

      const runLoad = async (signal?: AbortSignal) =>
        loadPageRef.current(offset, { append, forceRefresh, signal });

      let result: LoadPageResult | null;
      const controller = discoveryControllerRef.current;

      if (controller) {
        result = await controller.run(`episodes:${showId}:${offset}`, (signal) => runLoad(signal));
        if (result == null) return;
      } else {
        result = await runLoad();
      }

      if (generation !== requestGenerationRef.current) return;
      applyPage(normalizeVisible(result.episodes), append, result.hasMore);
    },
    [applyPage, normalizeVisible, showId]
  );

  useEffect(() => {
    if (!enabled || !showId) {
      requestGenerationRef.current += 1;
      discoveryControllerRef.current?.bumpGeneration();
      setEpisodes([]);
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

    const cachedPage = readCachedFirstPage(showId);

    if (cachedPage.length) {
      setEpisodes(cachedPage);
      setHasMore(cachedPage.length >= MEDIA_DISCOVERY_PAGE_SIZE);
      setLoading(false);
      setHasLoadedOnce(true);
    } else {
      setEpisodes([]);
      setHasMore(true);
      setLoading(true);
      setHasLoadedOnce(false);
    }

    const run = async () => {
      if (!cachedPage.length) {
        const hydrated = await hydrateCachedPodcastEpisodes(showId);
        if (cancelled || generation !== requestGenerationRef.current) return;

        if (hydrated?.length) {
          const visible = normalizeVisible(hydrated.slice(0, MEDIA_DISCOVERY_PAGE_SIZE));
          setEpisodes(visible);
          setHasMore(hydrated.length >= MEDIA_DISCOVERY_PAGE_SIZE);
          setLoading(false);
          setHasLoadedOnce(true);
          return;
        }
      } else {
        return;
      }

      await fetchPage(0, false, false);
      if (generation === requestGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      requestGenerationRef.current += 1;
      discoveryControllerRef.current?.bumpGeneration();
      clearRssEpisodeCacheForShow(showId);
    };
  }, [enabled, fetchPage, normalizeVisible, readCachedFirstPage, showId]);

  useEffect(() => {
    setEpisodes((current) => normalizeVisible(current));
  }, [normalizeVisible]);

  const onRefresh = useCallback(() => {
    const generation = requestGenerationRef.current;
    setRefreshing(true);
    void fetchPage(0, false, true).finally(() => {
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      setRefreshing(false);
    });
  }, [fetchPage, mountedRef]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || refreshing || !hasMore || loadingMoreRef.current) {
      return;
    }

    const generation = requestGenerationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void fetchPage(episodes.length, true, false).finally(() => {
      loadingMoreRef.current = false;
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      setLoadingMore(false);
    });
  }, [enabled, episodes.length, fetchPage, hasMore, loading, loadingMore, mountedRef, refreshing]);

  return {
    episodes,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    hasLoadedOnce,
    onRefresh,
    loadMore,
  };
}
