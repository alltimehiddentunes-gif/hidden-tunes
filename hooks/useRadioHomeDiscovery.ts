import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getBrowsableRadioCategories,
  getEmotionalRadioCategories,
  type RadioCategory,
} from "../constants/radioCategories";
import { RADIO_HOME_LANE_PAGE_SIZE } from "../constants/radioFoundation";
import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { useMatureContentSettings } from "./useMatureContentSettings";
import {
  filterAvailableRadioCategoryIds,
} from "../services/radio/radioCategoryAvailability";
import {
  loadRadioHomeLanePage,
  rememberRecommendedLane,
} from "../services/radio/radioHomeLanes";
import { loadRecentlyPlayedRadioItems } from "../services/radio/recentlyPlayedRadio";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import { logRadioDiscoveryFetch, logRadioDiscoveryRender } from "../utils/radioDiscoveryDiagnostics";

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
  resolveStation: (stationId: string) => HiddenTunesStation | null;
};

function toLaneItems(stations: HiddenTunesStation[]) {
  return stations.slice(0, RADIO_HOME_LANE_PAGE_SIZE).map(toRadioStationListItem);
}

export function useRadioHomeDiscovery(): RadioHomeDiscoveryState {
  const { includeMatureInApi } = useMatureContentSettings();
  const stationStoreRef = useRef(new Map<string, HiddenTunesStation>());
  const [featuredPool, setFeaturedPool] = useState<HiddenTunesStation[]>([]);
  const [trendingPool, setTrendingPool] = useState<HiddenTunesStation[]>([]);
  const [popularPool, setPopularPool] = useState<HiddenTunesStation[]>([]);
  const [recommendedPool, setRecommendedPool] = useState<HiddenTunesStation[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RadioStationListItem[]>([]);
  const [browseCategories, setBrowseCategories] = useState<RadioCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const rememberStations = useCallback((stations: HiddenTunesStation[]) => {
    stations.forEach((station) => {
      stationStoreRef.current.set(station.id, station);
    });
  }, []);

  useEffect(() => {
    logRadioDiscoveryRender("radio-home");
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);

      logRadioDiscoveryFetch("home:lanes", "featured+trending+popular");
      const [featuredResult, trendingResult, popularResult] = await Promise.all([
        loadRadioHomeLanePage("featured", { offset: 0, forceRefresh: false }).catch(() => ({
          stations: [],
          hasMore: false,
          fromCache: false,
        })),
        loadRadioHomeLanePage("trending", { offset: 0, forceRefresh: false }).catch(() => ({
          stations: [],
          hasMore: false,
          fromCache: false,
        })),
        loadRadioHomeLanePage("popular", { offset: 0, forceRefresh: false }).catch(() => ({
          stations: [],
          hasMore: false,
          fromCache: false,
        })),
      ]);

      if (cancelled) return;

      rememberStations([
        ...featuredResult.stations,
        ...trendingResult.stations,
        ...popularResult.stations,
      ]);
      setFeaturedPool(featuredResult.stations);
      setTrendingPool(trendingResult.stations);
      setPopularPool(popularResult.stations);
      setLoading(false);

      const recentResult = await loadRecentlyPlayedRadioItems(RADIO_HOME_LANE_PAGE_SIZE).catch(
        () => ({ items: [], stations: [] })
      );
      if (cancelled) return;

      rememberStations(recentResult.stations);
      setRecentlyPlayed(recentResult.items);

      const recentIds = new Set(recentResult.stations.map((station) => station.id));
      const recommended = rememberRecommendedLane(
        featuredResult.stations,
        trendingResult.stations,
        recentIds
      );
      rememberStations(recommended);
      setRecommendedPool(recommended);

      const browseCandidates = getBrowsableRadioCategories(includeMatureInApi);
      const availableBrowse = await filterAvailableRadioCategoryIds(
        browseCandidates.map((category) => category.id)
      );

      if (cancelled) return;

      setBrowseCategories(
        browseCandidates.filter((category) => availableBrowse.includes(category.id))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [includeMatureInApi, rememberStations]);

  const emotionalWorlds = useMemo(
    () =>
      getEmotionalRadioCategories(includeMatureInApi).map((world) => ({
        world,
      })),
    [includeMatureInApi]
  );

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
    resolveStation,
  };
}
