import { useCallback, useEffect, useRef, useState } from "react";

import {
  MATURE_PODCAST_HUB_LANES,
  MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
  type MaturePodcastHubLaneId,
} from "../constants/maturePodcastHubLanes";
import {
  DISCOVERY_IDLE_RAIL_LIMIT,
  DISCOVERY_LANE_STAGGER_MS,
  DISCOVERY_PRIORITY_RAIL_LIMIT,
} from "../constants/discoveryPerformanceBudget";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { cancelMaturePodcastDiscovery } from "../services/mature/maturePodcastDiscovery";
import { loadMaturePodcastHubLanePage } from "../services/mature/maturePodcastHubLanes";
import type { PodcastShowListItem } from "../types/podcastDiscovery";
import { toPodcastShowListItem } from "../services/podcast/podcastNormalizer";
import {
  trackDiscoveryRequestCancelled,
  trackDiscoveryScreenMount,
  trackDiscoveryScreenUnmount,
} from "../utils/discoveryPerformanceDiagnostics";

const SCREEN = "mature-podcast-hub";

function toLaneItems(shows: HiddenTunesPodcastShow[]) {
  return shows.slice(0, MATURE_PODCAST_HUB_LANE_PAGE_SIZE).map(toPodcastShowListItem);
}

const EMPTY_LANES: Record<MaturePodcastHubLaneId, PodcastShowListItem[]> = {
  featured: [],
  trending: [],
  popular: [],
  "new-episodes": [],
  "hidden-gems": [],
};

export function useMaturePodcastHubDiscovery(enabled: boolean) {
  const showStoreRef = useRef(new Map<string, HiddenTunesPodcastShow>());
  const [laneShows, setLaneShows] = useState(EMPTY_LANES);
  const [loadedLaneCount, setLoadedLaneCount] = useState(DISCOVERY_PRIORITY_RAIL_LIMIT);
  const [loading, setLoading] = useState(enabled);
  const generationRef = useRef(0);

  const rememberShows = useCallback((shows: HiddenTunesPodcastShow[]) => {
    shows.forEach((show) => {
      showStoreRef.current.set(show.id, show);
    });
  }, []);

  const loadMoreRails = useCallback(() => {
    setLoadedLaneCount((current) =>
      Math.min(MATURE_PODCAST_HUB_LANES.length, current + DISCOVERY_IDLE_RAIL_LIMIT)
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      cancelMaturePodcastDiscovery();
      setLaneShows(EMPTY_LANES);
      setLoadedLaneCount(DISCOVERY_PRIORITY_RAIL_LIMIT);
      setLoading(false);
      return;
    }

    trackDiscoveryScreenMount(SCREEN);
    const generation = ++generationRef.current;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const nextLanes: Record<MaturePodcastHubLaneId, PodcastShowListItem[]> = { ...EMPTY_LANES };
      const lanesToLoad = MATURE_PODCAST_HUB_LANES.slice(0, loadedLaneCount);

      for (let index = 0; index < lanesToLoad.length; index += 1) {
        if (cancelled || generationRef.current !== generation) return;

        const lane = lanesToLoad[index];
        const result = await loadMaturePodcastHubLanePage(lane.id, 0).catch(() => ({
          shows: [],
          hasMore: false,
        }));

        if (cancelled || generationRef.current !== generation) return;

        rememberShows(result.shows);
        nextLanes[lane.id] = toLaneItems(result.shows);
        setLaneShows({ ...nextLanes });

        if (index === 0) setLoading(false);

        if (index + 1 < lanesToLoad.length) {
          await new Promise((resolve) => setTimeout(resolve, DISCOVERY_LANE_STAGGER_MS));
        }
      }

      if (!cancelled && generationRef.current === generation) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      generationRef.current += 1;
      trackDiscoveryRequestCancelled(SCREEN, "hub-lanes");
      trackDiscoveryScreenUnmount(SCREEN);
    };
  }, [enabled, loadedLaneCount, rememberShows]);

  const resolveShow = useCallback((showId: string) => {
    return showStoreRef.current.get(showId) || null;
  }, []);

  const populatedLanes = MATURE_PODCAST_HUB_LANES.filter(
    (lane) => (laneShows[lane.id] || []).length > 0
  );

  const hasMoreRails = loadedLaneCount < MATURE_PODCAST_HUB_LANES.length;

  return {
    laneShows,
    populatedLanes,
    loading,
    resolveShow,
    loadMoreRails,
    hasMoreRails,
  };
}
