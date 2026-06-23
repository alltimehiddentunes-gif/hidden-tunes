import { useCallback, useEffect, useRef, useState } from "react";

import {
  MATURE_PODCAST_HUB_LANES,
  MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
  type MaturePodcastHubLaneId,
} from "../constants/maturePodcastHubLanes";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { loadMaturePodcastHubLanePage } from "../services/mature/maturePodcastHubLanes";
import type { PodcastShowListItem } from "../types/podcastDiscovery";
import { toPodcastShowListItem } from "../services/podcast/podcastNormalizer";
import { HOME_LANE_STAGGER_MS } from "../utils/searchPerformance";

function toLaneItems(shows: HiddenTunesPodcastShow[]) {
  return shows.slice(0, MATURE_PODCAST_HUB_LANE_PAGE_SIZE).map(toPodcastShowListItem);
}

export function useMaturePodcastHubDiscovery(enabled: boolean) {
  const showStoreRef = useRef(new Map<string, HiddenTunesPodcastShow>());
  const [laneShows, setLaneShows] = useState<Record<MaturePodcastHubLaneId, PodcastShowListItem[]>>({
    featured: [],
    trending: [],
    popular: [],
    "new-episodes": [],
    "dating-relationships": [],
    "sexual-health": [],
    "adult-psychology": [],
    "adult-comedy": [],
    "real-stories": [],
    "after-dark": [],
    "hidden-gems": [],
  });
  const [loading, setLoading] = useState(enabled);

  const rememberShows = useCallback((shows: HiddenTunesPodcastShow[]) => {
    shows.forEach((show) => {
      showStoreRef.current.set(show.id, show);
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLaneShows({
        featured: [],
        trending: [],
        popular: [],
        "new-episodes": [],
        "dating-relationships": [],
        "sexual-health": [],
        "adult-psychology": [],
        "adult-comedy": [],
        "real-stories": [],
        "after-dark": [],
        "hidden-gems": [],
      });
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      const nextLanes: Record<MaturePodcastHubLaneId, PodcastShowListItem[]> = {
        featured: [],
        trending: [],
        popular: [],
        "new-episodes": [],
        "dating-relationships": [],
        "sexual-health": [],
        "adult-psychology": [],
        "adult-comedy": [],
        "real-stories": [],
        "after-dark": [],
        "hidden-gems": [],
      };

      for (let index = 0; index < MATURE_PODCAST_HUB_LANES.length; index += 1) {
        if (cancelled) return;

        const lane = MATURE_PODCAST_HUB_LANES[index];
        const result = await loadMaturePodcastHubLanePage(lane.id, 0).catch(() => ({
          shows: [],
          hasMore: false,
        }));

        if (cancelled) return;

        rememberShows(result.shows);
        nextLanes[lane.id] = toLaneItems(result.shows);
        setLaneShows({ ...nextLanes });

        if (index === 0) setLoading(false);

        if (index + 1 < MATURE_PODCAST_HUB_LANES.length) {
          await new Promise((resolve) => setTimeout(resolve, HOME_LANE_STAGGER_MS));
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, rememberShows]);

  const resolveShow = useCallback((showId: string) => {
    return showStoreRef.current.get(showId) || null;
  }, []);

  const populatedLanes = MATURE_PODCAST_HUB_LANES.filter(
    (lane) => (laneShows[lane.id] || []).length > 0
  );

  return {
    laneShows,
    populatedLanes,
    loading,
    resolveShow,
  };
}
