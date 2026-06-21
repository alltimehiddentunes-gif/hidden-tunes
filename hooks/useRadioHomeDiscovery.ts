import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getBrowsableRadioCategories,
  getEmotionalRadioCategories,
  type RadioCategory,
} from "../constants/radioCategories";
import {
  getRadioEmotionalWorld,
  stationMatchesEmotionalWorld,
} from "../constants/radioEmotionalWorlds";
import type { HiddenTunesStation, RadioStationListItem } from "../types/radio";
import { useMatureContentSettings } from "./useMatureContentSettings";
import { loadRadioCategoryPage } from "../services/radio/radioBrowserApi";
import {
  filterAvailableRadioCategoryIds,
  pickStationsForEmotionalWorld,
} from "../services/radio/radioCategoryAvailability";
import { loadRecentlyPlayedRadioItems } from "../services/radio/recentlyPlayedRadio";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import { logRadioDiscoveryFetch, logRadioDiscoveryRender } from "../utils/radioDiscoveryDiagnostics";

export type RadioEmotionalWorldPreview = {
  world: RadioCategory;
  previewStations: RadioStationListItem[];
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

function sliceItems(stations: HiddenTunesStation[], start: number, end: number) {
  return stations.slice(start, end).map(toRadioStationListItem);
}

function buildEmotionalPreviews(
  pool: HiddenTunesStation[],
  worlds: RadioCategory[],
  availableWorldIds: Set<string>
) {
  return worlds
    .filter((world) => availableWorldIds.has(world.id))
    .map((world) => {
      const taggedPool = pickStationsForEmotionalWorld(pool, world.id, 8);
      const previewStations =
        taggedPool.length >= 3
          ? taggedPool.slice(0, 5).map(toRadioStationListItem)
          : [];

      return {
        world,
        previewStations,
      };
    })
    .filter((entry) => entry.previewStations.length >= 3);
}

export function useRadioHomeDiscovery(): RadioHomeDiscoveryState {
  const { includeMatureInApi } = useMatureContentSettings();
  const stationStoreRef = useRef(new Map<string, HiddenTunesStation>());
  const [featuredPool, setFeaturedPool] = useState<HiddenTunesStation[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RadioStationListItem[]>([]);
  const [browseCategories, setBrowseCategories] = useState<RadioCategory[]>([]);
  const [availableWorldIds, setAvailableWorldIds] = useState<Set<string>>(new Set());
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

      logRadioDiscoveryFetch("home:featured-pool");
      const featuredResult = await loadRadioCategoryPage("featured", {
        offset: 0,
        forceRefresh: false,
      }).catch(() => ({ stations: [], hasMore: false, fromCache: false }));

      if (cancelled) return;

      rememberStations(featuredResult.stations);
      setFeaturedPool(featuredResult.stations);
      setLoading(false);

      const recentResult = await loadRecentlyPlayedRadioItems(10).catch(() => ({
        items: [],
        stations: [],
      }));
      if (cancelled) return;
      rememberStations(recentResult.stations);
      setRecentlyPlayed(recentResult.items);

      const emotionalCategories = getEmotionalRadioCategories(includeMatureInApi);
      const emotionalIdsFromPool = emotionalCategories
        .filter((category) => {
          const world = getRadioEmotionalWorld(category.id);
          if (!world) return false;
          return featuredResult.stations.some((station) =>
            stationMatchesEmotionalWorld(station.tags || [], world)
          );
        })
        .map((category) => category.id);

      const emotionalNeedingProbe = emotionalCategories
        .filter((category) => !emotionalIdsFromPool.includes(category.id))
        .map((category) => category.id);

      const probedEmotionalIds =
        emotionalNeedingProbe.length > 0
          ? await filterAvailableRadioCategoryIds(emotionalNeedingProbe)
          : [];

      if (cancelled) return;

      const worldIdSet = new Set([...emotionalIdsFromPool, ...probedEmotionalIds]);
      setAvailableWorldIds(worldIdSet);

      const browseCandidates = getBrowsableRadioCategories(includeMatureInApi);
      const browseIds = await filterAvailableRadioCategoryIds(
        browseCandidates.map((category) => category.id)
      );

      if (cancelled) return;

      setBrowseCategories(
        browseCandidates.filter((category) => browseIds.includes(category.id))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [includeMatureInApi, rememberStations]);

  const emotionalWorlds = useMemo(
    () =>
      buildEmotionalPreviews(
        featuredPool,
        getEmotionalRadioCategories(includeMatureInApi),
        availableWorldIds
      ),
    [availableWorldIds, featuredPool, includeMatureInApi]
  );

  const resolveStation = useCallback((stationId: string) => {
    return stationStoreRef.current.get(stationId) || null;
  }, []);

  return {
    featured: sliceItems(featuredPool, 0, 10),
    trending: sliceItems(featuredPool, 10, 18),
    popular: sliceItems(featuredPool, 18, 26),
    recommended: sliceItems(featuredPool, 26, 34),
    recentlyPlayed,
    emotionalWorlds,
    browseCategories,
    loading,
    resolveStation,
  };
}
