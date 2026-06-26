import { useCallback, useEffect, useState } from "react";

import { getStaticPodcastHomeFromSeeds } from "../services/podcastService";
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
  browseCategories: PodcastCategoryDef[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const EMPTY_HOME = {
  featured: [] as PodcastShow[],
  trending: [] as PodcastShow[],
  newEpisodes: [] as PodcastEpisode[],
  popularShows: [] as PodcastShow[],
  recommended: [] as PodcastShow[],
  recentlyPlayed: [] as PodcastEpisode[],
  rootSections: [] as PodcastCategoryDef[],
  browseCategories: [] as PodcastCategoryDef[],
};

export function usePodcastHome(): PodcastHomeState {
  const [state, setState] = useState<Omit<PodcastHomeState, "refresh">>({
    ...EMPTY_HOME,
    loading: false,
    error: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const home = await getStaticPodcastHomeFromSeeds(shouldIncludeMaturePodcasts());
      setState({
        featured: home.featured,
        trending: home.trending,
        newEpisodes: home.newEpisodes,
        popularShows: home.popularShows,
        recommended: home.recommended,
        recentlyPlayed: home.recentlyPlayed,
        rootSections: home.rootSections,
        browseCategories: home.browseCategories,
        loading: false,
        error: null,
      });
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        error: "Podcasts could not be loaded right now.",
      }));
    } finally {
      setState((current) => ({ ...current, loading: false }));
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
