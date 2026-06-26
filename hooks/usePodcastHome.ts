import { useCallback, useEffect, useState } from "react";

import { buildStaticPodcastHomeSync } from "../services/podcastService";
import type { PodcastCategoryDef } from "../constants/podcastCategories";
import type { PodcastEpisode, PodcastShow } from "../types/podcast";
import { loadPodcastRecentlyPlayed } from "../services/podcastRecentlyPlayed";
import { shouldIncludeMaturePodcasts, subscribeMaturePodcastSettings } from "../utils/maturePodcastSettings";

type PodcastHomeState = {
  featured: PodcastShow[];
  trending: PodcastShow[];
  newEpisodes: PodcastEpisode[];
  popularShows: PodcastShow[];
  recommended: PodcastShow[];
  recentlyPlayed: PodcastEpisode[];
  rootSections: PodcastCategoryDef[];
  browseCategories: PodcastCategoryDef[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

function createHomeState(includeMature: boolean): Omit<PodcastHomeState, "refresh"> {
  return {
    ...buildStaticPodcastHomeSync(includeMature),
    loading: false,
    error: null,
  };
}

async function loadRecentlyPlayedWithTimeout(limit: number, timeoutMs = 2000) {
  try {
    return await Promise.race([
      loadPodcastRecentlyPlayed(limit),
      new Promise<PodcastEpisode[]>((resolve) => {
        setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
  } catch {
    return [];
  }
}

export function usePodcastHome(): PodcastHomeState {
  const [state, setState] = useState<Omit<PodcastHomeState, "refresh">>(() =>
    createHomeState(shouldIncludeMaturePodcasts())
  );

  const load = useCallback(async () => {
    const includeMature = shouldIncludeMaturePodcasts();
    setState(createHomeState(includeMature));

    const recent = await loadRecentlyPlayedWithTimeout(8);
    setState((current) => ({
      ...current,
      recentlyPlayed: recent,
      loading: false,
      error: null,
    }));
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeMaturePodcastSettings(() => {
      void load();
    });
    return () => {
      unsubscribe();
    };
  }, [load]);

  return { ...state, refresh: load };
}
