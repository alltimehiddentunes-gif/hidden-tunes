import { useCallback, useEffect, useRef, useState } from "react";

import {
  getBrowsableRadioCategories,
  getEmotionalRadioCategories,
  getMatureRadioCategories,
  type RadioCategory,
} from "../constants/radioCategories";
import { RADIO_HOME_LANE_PAGE_SIZE } from "../constants/radioFoundation";
import {
  DISCOVERY_DEFER_RAIL_IDLE_MS,
  DISCOVERY_IDLE_RAIL_LIMIT,
  DISCOVERY_PRIORITY_RAIL_LIMIT,
} from "../constants/discoveryPerformanceBudget";
import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { DISCOVERY_LANE_STAGGER_MS } from "../utils/searchPerformance";
import {
  loadRadioHomeLanePage,
  rememberRecommendedLane,
} from "../services/radio/radioHomeLanes";
import { loadRecentlyPlayedRadioItems } from "../services/radio/recentlyPlayedRadio";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import { useMatureContentSettings } from "./useMatureContentSettings";
import { shouldRunNonEssentialWork } from "../utils/performanceMode";
import { logRadioDiscoveryFetch, logRadioDiscoveryRender } from "../utils/radioDiscoveryDiagnostics";
import {
  trackDiscoveryScreenMount,
  trackDiscoveryScreenUnmount,
} from "../utils/discoveryPerformanceDiagnostics";
import { createDiscoveryScreenController } from "../utils/discoveryRequestManager";

export type RadioEmotionalWorldPreview = {
  world: RadioCategory;
};

type RadioHomeDiscoveryState = {
  featured: RadioStationListItem[];
  trending: RadioStationListItem[];
  popular: RadioStationListItem[];
  recommended: RadioStationListItem[];
  recentlyPlayed: RadioStationListItem[];
  emotionalWorlds: RadioEmotionalWorldPreview[];
  browseCategories: RadioCategory[];
  loading: boolean;
  loadingMoreRails: boolean;
  hasMoreRails: boolean;
  loadMoreRails: () => void;
  resolveStation: (stationId: string) => HiddenTunesStation | null;
};

const RADIO_HOME_RAILS = ["featured", "trending", "popular", "recent"] as const;
type RadioHomeRailId = (typeof RADIO_HOME_RAILS)[number];

function toLaneItems(stations: HiddenTunesStation[]) {
  return stations.slice(0, RADIO_HOME_LANE_PAGE_SIZE).map(toRadioStationListItem);
}

export function useRadioHomeDiscovery(): RadioHomeDiscoveryState {
  const { includeMatureInApi } = useMatureContentSettings();
  const controllerRef = useRef(createDiscoveryScreenController("radio-home"));
  const stationStoreRef = useRef(new Map<string, HiddenTunesStation>());
  const loadedRailsRef = useRef(new Set<RadioHomeRailId>());
  const lanePoolsRef = useRef({
    featured: [] as HiddenTunesStation[],
    trending: [] as HiddenTunesStation[],
    popular: [] as HiddenTunesStation[],
  });

  const [featuredPool, setFeaturedPool] = useState<HiddenTunesStation[]>([]);
  const [trendingPool, setTrendingPool] = useState<HiddenTunesStation[]>([]);
  const [popularPool, setPopularPool] = useState<HiddenTunesStation[]>([]);
  const [recommendedPool, setRecommendedPool] = useState<HiddenTunesStation[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RadioStationListItem[]>([]);
  const [emotionalWorlds, setEmotionalWorlds] = useState<RadioEmotionalWorldPreview[]>([]);
  const [browseCategories, setBrowseCategories] = useState<RadioCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreRails, setLoadingMoreRails] = useState(false);
  const [loadedRailCount, setLoadedRailCount] = useState(DISCOVERY_PRIORITY_RAIL_LIMIT);

  const rememberStations = useCallback((stations: HiddenTunesStation[]) => {
    stations.forEach((station) => {
      stationStoreRef.current.set(station.id, station);
    });
  }, []);

  const loadMoreRails = useCallback(() => {
    setLoadedRailCount((current) =>
      Math.min(RADIO_HOME_RAILS.length, current + DISCOVERY_IDLE_RAIL_LIMIT)
    );
  }, []);

  const recomputeRecommended = useCallback((recentIds: Set<string>) => {
    const pools = lanePoolsRef.current;
    const recommended = rememberRecommendedLane(pools.featured, pools.trending, recentIds);
    rememberStations(recommended);
    setRecommendedPool(recommended);
  }, [rememberStations]);

  useEffect(() => {
    logRadioDiscoveryRender("radio-home");
  }, []);

  useEffect(() => {
    const nonMatureBrowse = getBrowsableRadioCategories(includeMatureInApi).filter(
      (category) => !category.isMature
    );
    setEmotionalWorlds(
      getEmotionalRadioCategories(includeMatureInApi).map((world) => ({ world }))
    );
    setBrowseCategories([
      ...nonMatureBrowse,
      ...(includeMatureInApi ? getMatureRadioCategories(true) : []),
    ]);
  }, [includeMatureInApi]);

  useEffect(() => {
    controllerRef.current = createDiscoveryScreenController("radio-home");
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

    trackDiscoveryScreenMount("radio-home");
    const controller = controllerRef.current;

    return () => {
      controller.bumpGeneration();
      trackDiscoveryScreenUnmount("radio-home");
    };
  }, [includeMatureInApi]);

  useEffect(() => {
    const controller = controllerRef.current;
    let cancelled = false;

    const loadRail = async (railId: RadioHomeRailId) => {
      if (railId === "recent") {
        return loadRecentlyPlayedRadioItems(RADIO_HOME_LANE_PAGE_SIZE).catch(() => ({
          items: [] as RadioStationListItem[],
          stations: [] as HiddenTunesStation[],
        }));
      }

      logRadioDiscoveryFetch("home:lanes", railId);
      return loadRadioHomeLanePage(railId, {
        offset: 0,
        forceRefresh: false,
      }).catch(() => ({
        stations: [] as HiddenTunesStation[],
        hasMore: false,
        fromCache: false,
      }));
    };

    void (async () => {
      const railsToLoad = RADIO_HOME_RAILS.slice(0, loadedRailCount);
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
          const recentResult = result as Awaited<ReturnType<typeof loadRecentlyPlayedRadioItems>>;
          rememberStations(recentResult.stations);
          setRecentlyPlayed(recentResult.items);
          recentIds = new Set(recentResult.stations.map((station) => station.id));
        } else {
          const laneResult = result as { stations: HiddenTunesStation[] };
          rememberStations(laneResult.stations);
          lanePoolsRef.current[railId] = laneResult.stations;

          if (railId === "featured") setFeaturedPool(laneResult.stations);
          if (railId === "trending") setTrendingPool(laneResult.stations);
          if (railId === "popular") setPopularPool(laneResult.stations);
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
  }, [loadedRailCount, rememberStations, recomputeRecommended]);

  useEffect(() => {
    if (loadedRailCount >= RADIO_HOME_RAILS.length) return;

    const timer = setTimeout(() => {
      if (shouldRunNonEssentialWork()) {
        loadMoreRails();
      }
    }, DISCOVERY_DEFER_RAIL_IDLE_MS);

    return () => clearTimeout(timer);
  }, [loadMoreRails, loadedRailCount]);

  const resolveStation = useCallback((stationId: string) => {
    return stationStoreRef.current.get(stationId) || null;
  }, []);

  return {
    featured: toLaneItems(featuredPool),
    trending: toLaneItems(trendingPool),
    popular: toLaneItems(popularPool),
    recommended: toLaneItems(recommendedPool),
    recentlyPlayed,
    emotionalWorlds,
    browseCategories,
    loading,
    loadingMoreRails,
    hasMoreRails: loadedRailCount < RADIO_HOME_RAILS.length,
    loadMoreRails,
    resolveStation,
  };
}
