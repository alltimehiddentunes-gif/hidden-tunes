import { useCallback, useEffect, useState } from "react";

import { getPodcastHome } from "../services/podcastService";
import type { PodcastCategoryDef } from "../constants/podcastCategories";
import type { PodcastEpisode, PodcastShow } from "../types/podcast";
import { shouldIncludeMaturePodcasts, subscribeMaturePodcastSettings } from "../utils/maturePodcastSettings";

type PodcastHomeState = {
  featured: PodcastShow[];
  trending: PodcastShow[];
  newEpisodes: PodcastEpisode[];
  popularShows: PodcastShow[];
  recommended: PodcastShow[];
  recentlyPlayed: PodcastEpisode[];
  rootSections: PodcastCategoryDef[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function usePodcastHome(): PodcastHomeState {
  const [state, setState] = useState<Omit<PodcastHomeState, "refresh">>({
    featured: [],
    trending: [],
    newEpisodes: [],
    popularShows: [],
    recommended: [],
    recentlyPlayed: [],
    rootSections: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const home = await getPodcastHome(shouldIncludeMaturePodcasts());
      setState({
        featured: home.featured,
        trending: home.trending,
        newEpisodes: home.newEpisodes,
        popularShows: home.popularShows,
        recommended: home.recommended,
        recentlyPlayed: home.recentlyPlayed,
        rootSections: home.rootSections,
        loading: false,
        error: null,
      });
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        error: "This feed could not be loaded",
      }));
    }
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
