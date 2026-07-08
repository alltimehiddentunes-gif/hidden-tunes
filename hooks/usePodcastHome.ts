import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildStaticPodcastHomeSync,
  getPodcastHomeShowSections,
} from "../services/podcastService";
import { fetchPodcastHomeMetadata } from "../services/podcastCatalogApi";
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
  homeShowSections: ReturnType<typeof getPodcastHomeShowSections>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

function createHomeState(includeMature: boolean): Omit<PodcastHomeState, "refresh"> {
  const home = buildStaticPodcastHomeSync(includeMature);
  return {
    ...home,
    homeShowSections: getPodcastHomeShowSections(includeMature),
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
  const mountedRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const signal = controller.signal;
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    const includeMature = shouldIncludeMaturePodcasts();
    const fallback = createHomeState(includeMature);
    await Promise.resolve();
    if (!mountedRef.current || signal?.aborted || generation !== loadGenerationRef.current) {
      return;
    }
    setState(fallback);

    const [recent, backendHome] = await Promise.all([
      loadRecentlyPlayedWithTimeout(8),
      fetchPodcastHomeMetadata({
        page: 1,
        limit: 24,
        includeMature,
        signal,
      }),
    ]);

    if (!mountedRef.current || signal?.aborted || generation !== loadGenerationRef.current) {
      return;
    }
    if (activeControllerRef.current === controller) {
      activeControllerRef.current = null;
    }

    setState((current) => ({
      ...current,
      homeShowSections: backendHome.success ? backendHome.sections : current.homeShowSections,
      recentlyPlayed: recent,
      loading: false,
      error: null,
    }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const loadTimer = setTimeout(() => {
      void load();
    }, 0);
    const unsubscribe = subscribeMaturePodcastSettings(() => {
      void load();
    });
    return () => {
      mountedRef.current = false;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
      clearTimeout(loadTimer);
      unsubscribe();
    };
  }, [load]);

  return useMemo(() => ({ ...state, refresh: load }), [load, state]);
}
