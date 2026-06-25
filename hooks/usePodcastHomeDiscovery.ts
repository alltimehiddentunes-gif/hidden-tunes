import { useCallback, useEffect, useRef, useState } from "react";

import {
  getBrowsablePodcastCategories,
  getEmotionalPodcastCategories,
  getMaturePodcastSubcategories,
  type PodcastCategory,
} from "../constants/podcastCategories";
import { PODCAST_HOME_LANE_PAGE_SIZE } from "../constants/podcastFoundation";
import {
  DISCOVERY_DEFER_RAIL_IDLE_MS,
  DISCOVERY_IDLE_RAIL_LIMIT,
  DISCOVERY_PRIORITY_RAIL_LIMIT,
} from "../constants/discoveryPerformanceBudget";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import type { PodcastShowListItem } from "../types/podcastDiscovery";
import { DISCOVERY_LANE_STAGGER_MS } from "../utils/searchPerformance";
import {
  loadPodcastHomeLanePage,
  rememberRecommendedPodcastLane,
} from "../services/podcast/podcastHomeLanes";
import { loadRecentlyPlayedPodcastItems } from "../services/podcast/recentlyPlayedPodcasts";
import { toPodcastShowListItem } from "../services/podcast/podcastNormalizer";
import { useMatureContentSettings } from "./useMatureContentSettings";
import { shouldRunNonEssentialWork } from "../utils/performanceMode";
import {
  trackDiscoveryScreenMount,
  trackDiscoveryScreenUnmount,
} from "../utils/discoveryPerformanceDiagnostics";
import { createDiscoveryScreenController } from "../utils/discoveryRequestManager";

export type PodcastEmotionalWorldPreview = {
  world: PodcastCategory;
};

type PodcastHomeDiscoveryState = {
  featured: PodcastShowListItem[];
  trending: PodcastShowListItem[];
  popular: PodcastShowListItem[];
  recommended: PodcastShowListItem[];
  recentlyPlayed: PodcastShowListItem[];
  emotionalWorlds: PodcastEmotionalWorldPreview[];
  browseCategories: PodcastCategory[];
  matureCategories: PodcastCategory[];
  loading: boolean;
  loadingMoreRails: boolean;
  hasMoreRails: boolean;
  loadMoreRails: () => void;
  resolveShow: (showId: string) => HiddenTunesPodcastShow | null;
};

const PODCAST_HOME_RAILS = ["featured", "trending", "popular", "recent"] as const;
type PodcastHomeRailId = (typeof PODCAST_HOME_RAILS)[number];

function toLaneItems(shows: HiddenTunesPodcastShow[]) {
  return shows.slice(0, PODCAST_HOME_LANE_PAGE_SIZE).map(toPodcastShowListItem);
}

export function usePodcastHomeDiscovery(): PodcastHomeDiscoveryState {
  const { includeMatureInApi } = useMatureContentSettings();
  const controllerRef = useRef(createDiscoveryScreenController("podcast-home"));
  const showStoreRef = useRef(new Map<string, HiddenTunesPodcastShow>());
  const loadedRailsRef = useRef(new Set<PodcastHomeRailId>());
  const lanePoolsRef = useRef({
    featured: [] as HiddenTunesPodcastShow[],
    trending: [] as HiddenTunesPodcastShow[],
    popular: [] as HiddenTunesPodcastShow[],
  });

  const [featuredPool, setFeaturedPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [trendingPool, setTrendingPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [popularPool, setPopularPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [recommendedPool, setRecommendedPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<PodcastShowListItem[]>([]);
  const [emotionalWorlds, setEmotionalWorlds] = useState<PodcastEmotionalWorldPreview[]>([]);
  const [browseCategories, setBrowseCategories] = useState<PodcastCategory[]>([]);
  const [matureCategories, setMatureCategories] = useState<PodcastCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreRails, setLoadingMoreRails] = useState(false);
  const [loadedRailCount, setLoadedRailCount] = useState(DISCOVERY_PRIORITY_RAIL_LIMIT);

  const rememberShows = useCallback((shows: HiddenTunesPodcastShow[]) => {
    shows.forEach((show) => {
      showStoreRef.current.set(show.id, show);
    });
  }, []);

  const loadMoreRails = useCallback(() => {
    setLoadedRailCount((current) =>
      Math.min(PODCAST_HOME_RAILS.length, current + DISCOVERY_IDLE_RAIL_LIMIT)
    );
  }, []);

  const recomputeRecommended = useCallback((recentIds: Set<string>) => {
    const pools = lanePoolsRef.current;
    const recommended = rememberRecommendedPodcastLane(
      pools.featured,
      pools.trending,
      recentIds
    );
    rememberShows(recommended);
    setRecommendedPool(recommended);
  }, [rememberShows]);

  useEffect(() => {
    setEmotionalWorlds(
      getEmotionalPodcastCategories(includeMatureInApi).map((world) => ({ world }))
    );
    setBrowseCategories(getBrowsablePodcastCategories(includeMatureInApi));
    setMatureCategories(includeMatureInApi ? getMaturePodcastSubcategories() : []);
  }, [includeMatureInApi]);

  useEffect(() => {
    controllerRef.current = createDiscoveryScreenController("podcast-home");
    loadedRailsRef.current.clear();
    lanePoolsRef.current = { featured: [], trending: [], popular: [] };
    setFeaturedPool([]);
    setTrendingPool([]);
    setPopularPool([]);
    setRecommendedPool([]);
    setRecentlyPlayed([]);
    setLoadedRailCount(DISCOVERY_PRIORITY_RAIL_LIMIT);
    setLoading(true);
    setLoadingMoreRails(false);

    trackDiscoveryScreenMount("podcast-home");
    const controller = controllerRef.current;

    return () => {
      controller.bumpGeneration();
      trackDiscoveryScreenUnmount("podcast-home");
    };
  }, [includeMatureInApi]);

  useEffect(() => {
    const controller = controllerRef.current;
    let cancelled = false;

    const loadRail = async (railId: PodcastHomeRailId) => {
      if (railId === "recent") {
        return loadRecentlyPlayedPodcastItems(PODCAST_HOME_LANE_PAGE_SIZE).catch(() => ({
          items: [] as PodcastShowListItem[],
          shows: [] as HiddenTunesPodcastShow[],
        }));
      }

      return loadPodcastHomeLanePage(railId, 0, { forceRefresh: false }).catch(() => ({
        shows: [] as HiddenTunesPodcastShow[],
        hasMore: false,
      }));
    };

    void (async () => {
      const railsToLoad = PODCAST_HOME_RAILS.slice(0, loadedRailCount);
      const pendingRails = railsToLoad.filter((railId) => !loadedRailsRef.current.has(railId));
      if (!pendingRails.length) return;

      setLoadingMoreRails(pendingRails.length > 0 && !loadedRailsRef.current.has("featured"));

      for (let index = 0; index < pendingRails.length; index += 1) {
        if (cancelled) return;

        const railId = pendingRails[index];
        const result = await controller.run(`rail:${railId}`, async () => loadRail(railId));
        if (cancelled || result == null) return;

        loadedRailsRef.current.add(railId);
        let recentIds = new Set(
          recentlyPlayed.map((item) => item.id).filter(Boolean)
        );

        if (railId === "recent") {
          const recentResult = result as Awaited<
            ReturnType<typeof loadRecentlyPlayedPodcastItems>
          >;
          rememberShows(recentResult.shows);
          setRecentlyPlayed(recentResult.items);
          recentIds = new Set(recentResult.shows.map((show) => show.id));
        } else {
          const laneResult = result as { shows: HiddenTunesPodcastShow[] };
          rememberShows(laneResult.shows);
          lanePoolsRef.current[railId] = laneResult.shows;

          if (railId === "featured") setFeaturedPool(laneResult.shows);
          if (railId === "trending") setTrendingPool(laneResult.shows);
          if (railId === "popular") setPopularPool(laneResult.shows);
        }

        if (railId === "featured") setLoading(false);
        recomputeRecommended(recentIds);

        if (index + 1 < pendingRails.length) {
          await new Promise((resolve) => setTimeout(resolve, DISCOVERY_LANE_STAGGER_MS));
        }
      }

      if (!cancelled) {
        setLoading(false);
        setLoadingMoreRails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadedRailCount, rememberShows, recomputeRecommended]);

  useEffect(() => {
    if (loadedRailCount >= PODCAST_HOME_RAILS.length) return;

    const timer = setTimeout(() => {
      if (shouldRunNonEssentialWork()) {
        loadMoreRails();
      }
    }, DISCOVERY_DEFER_RAIL_IDLE_MS);

    return () => clearTimeout(timer);
  }, [loadMoreRails, loadedRailCount]);

  const resolveShow = useCallback((showId: string) => {
    return showStoreRef.current.get(showId) || null;
  }, []);

  return {
    featured: toLaneItems(featuredPool),
    trending: toLaneItems(trendingPool),
    popular: toLaneItems(popularPool),
    recommended: toLaneItems(recommendedPool),
    recentlyPlayed,
    emotionalWorlds,
    browseCategories,
    matureCategories,
    loading,
    loadingMoreRails,
    hasMoreRails: loadedRailCount < PODCAST_HOME_RAILS.length,
    loadMoreRails,
    resolveShow,
  };
}
