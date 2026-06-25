import { useCallback, useEffect, useRef, useState } from "react";

import {
  MATURE_PODCAST_HUB_LANES,
  MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
  type MaturePodcastHubLaneId,
} from "../constants/maturePodcastHubLanes";
import { MATURE_MIN_HUB_RAIL_ITEMS } from "../constants/matureDiscoveryFoundation";
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
import { createDiscoveryScreenController } from "../utils/discoveryRequestManager";
import { scheduleMatureInventoryAuditIfEnabled } from "../utils/matureInventoryAudit";
import {
  trackDiscoveryScreenMount,
  trackDiscoveryScreenUnmount,
} from "../utils/discoveryPerformanceDiagnostics";

const SCREEN = "mature-podcast-hub";

function toLaneItems(shows: HiddenTunesPodcastShow[]) {
  return shows.slice(0, MATURE_PODCAST_HUB_LANE_PAGE_SIZE).map(toPodcastShowListItem);
}

function buildEmptyLanes(): Record<MaturePodcastHubLaneId, PodcastShowListItem[]> {
  return MATURE_PODCAST_HUB_LANES.reduce(
    (lanes, lane) => {
      lanes[lane.id] = [];
      return lanes;
    },
    {} as Record<MaturePodcastHubLaneId, PodcastShowListItem[]>
  );
}

export function useMaturePodcastHubDiscovery(enabled: boolean) {
  const showStoreRef = useRef(new Map<string, HiddenTunesPodcastShow>());
  const controllerRef = useRef(createDiscoveryScreenController(SCREEN));
  const [laneShows, setLaneShows] = useState(buildEmptyLanes);
  const [loadedLaneCount, setLoadedLaneCount] = useState(DISCOVERY_PRIORITY_RAIL_LIMIT);
  const [loading, setLoading] = useState(enabled);

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
      controllerRef.current.bumpGeneration();
      cancelMaturePodcastDiscovery();
      setLaneShows(buildEmptyLanes());
      setLoadedLaneCount(DISCOVERY_PRIORITY_RAIL_LIMIT);
      setLoading(false);
      return;
    }

    trackDiscoveryScreenMount(SCREEN);
    scheduleMatureInventoryAuditIfEnabled();

    const controller = controllerRef.current;
    const generation = controller.getGeneration();
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const nextLanes = buildEmptyLanes();
      const lanesToLoad = MATURE_PODCAST_HUB_LANES.slice(0, loadedLaneCount);

      for (let index = 0; index < lanesToLoad.length; index += 1) {
        if (cancelled || controller.getGeneration() !== generation) return;

        const lane = lanesToLoad[index];
        const result = await controller.run(`hub-lane:${lane.id}`, (signal) =>
          loadMaturePodcastHubLanePage(lane.id, 0, { signal }).catch(() => ({
            shows: [],
            hasMore: false,
          }))
        );

        if (cancelled || controller.getGeneration() !== generation) return;

        const shows = result?.shows || [];
        if (shows.length >= MATURE_MIN_HUB_RAIL_ITEMS) {
          rememberShows(shows);
          nextLanes[lane.id] = toLaneItems(shows);
        }

        setLaneShows({ ...nextLanes });

        if (index === 0) setLoading(false);

        if (index + 1 < lanesToLoad.length) {
          await new Promise((resolve) => setTimeout(resolve, DISCOVERY_LANE_STAGGER_MS));
        }
      }

      if (!cancelled && controller.getGeneration() === generation) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.bumpGeneration();
      trackDiscoveryScreenUnmount(SCREEN);
    };
  }, [enabled, loadedLaneCount, rememberShows]);

  const resolveShow = useCallback((showId: string) => {
    return showStoreRef.current.get(showId) || null;
  }, []);

  const populatedLanes = MATURE_PODCAST_HUB_LANES.filter(
    (lane) => (laneShows[lane.id] || []).length >= MATURE_MIN_HUB_RAIL_ITEMS
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
