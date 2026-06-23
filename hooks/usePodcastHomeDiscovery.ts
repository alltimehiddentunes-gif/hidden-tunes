import { useCallback, useEffect, useRef, useState } from "react";

import {
  getBrowsablePodcastCategories,
  getEmotionalPodcastCategories,
  type PodcastCategory,
} from "../constants/podcastCategories";
import { PODCAST_HOME_LANE_PAGE_SIZE } from "../constants/podcastFoundation";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import type { PodcastShowListItem } from "../types/podcastDiscovery";
import { HOME_LANE_STAGGER_MS } from "../utils/searchPerformance";
import {
  loadPodcastHomeLanePage,
  rememberRecommendedPodcastLane,
} from "../services/podcast/podcastHomeLanes";
import { loadRecentlyPlayedPodcastItems } from "../services/podcast/recentlyPlayedPodcasts";
import { toPodcastShowListItem } from "../services/podcast/podcastNormalizer";
import { useMatureContentSettings } from "./useMatureContentSettings";

export type PodcastEmotionalWorldPreview = {
  world: PodcastCategory;
};

type PodcastHomeDiscoveryState = {
  featured: PodcastShowListItem[];
  trending: PodcastShowListItem[];
  popular: PodcastShowListItem[];
  recommended: PodcastShowListItem[];
  recentlyPlayed: PodcastShowListItem[];
  emotionalWorlds: PodcastEmotionalWorldPreview[];
  browseCategories: PodcastCategory[];
  matureCategories: PodcastCategory[];
  loading: boolean;
  resolveShow: (showId: string) => HiddenTunesPodcastShow | null;
};

function toLaneItems(shows: HiddenTunesPodcastShow[]) {
  return shows.slice(0, PODCAST_HOME_LANE_PAGE_SIZE).map(toPodcastShowListItem);
}

export function usePodcastHomeDiscovery(): PodcastHomeDiscoveryState {
  const { includeMatureInApi } = useMatureContentSettings();
  const showStoreRef = useRef(new Map<string, HiddenTunesPodcastShow>());
  const [featuredPool, setFeaturedPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [trendingPool, setTrendingPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [popularPool, setPopularPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [recommendedPool, setRecommendedPool] = useState<HiddenTunesPodcastShow[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<PodcastShowListItem[]>([]);
  const [emotionalWorlds, setEmotionalWorlds] = useState<PodcastEmotionalWorldPreview[]>([]);
  const [browseCategories, setBrowseCategories] = useState<PodcastCategory[]>([]);
  const [matureCategories, setMatureCategories] = useState<PodcastCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const rememberShows = useCallback((shows: HiddenTunesPodcastShow[]) => {
    shows.forEach((show) => {
      showStoreRef.current.set(show.id, show);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);

      const featuredResult = await loadPodcastHomeLanePage("featured", 0, {
        forceRefresh: false,
      }).catch(() => ({
        shows: [],
        hasMore: false,
      }));

      if (cancelled) return;

      rememberShows(featuredResult.shows);
      setFeaturedPool(featuredResult.shows);
      setLoading(false);

      await new Promise((resolve) => setTimeout(resolve, HOME_LANE_STAGGER_MS));
      if (cancelled) return;

      const [trendingResult, popularResult] = await Promise.all([
        loadPodcastHomeLanePage("trending", 0, { forceRefresh: false }).catch(() => ({
          shows: [],
          hasMore: false,
        })),
        loadPodcastHomeLanePage("popular", 0, { forceRefresh: false }).catch(() => ({
          shows: [],
          hasMore: false,
        })),
      ]);

      if (cancelled) return;

      rememberShows([...trendingResult.shows, ...popularResult.shows]);
      setTrendingPool(trendingResult.shows);
      setPopularPool(popularResult.shows);

      const recentResult = await loadRecentlyPlayedPodcastItems(PODCAST_HOME_LANE_PAGE_SIZE).catch(
        () => ({ items: [], shows: [] })
      );
      if (cancelled) return;

      rememberShows(recentResult.shows);
      setRecentlyPlayed(recentResult.items);

      const recentIds = new Set(recentResult.shows.map((show) => show.id));
      const recommended = rememberRecommendedPodcastLane(
        featuredResult.shows,
        trendingResult.shows,
        recentIds
      );
      rememberShows(recommended);
      setRecommendedPool(recommended);

      const emotionalCandidates = getEmotionalPodcastCategories(includeMatureInApi);
      const browseCandidates = getBrowsablePodcastCategories(includeMatureInApi);

      if (cancelled) return;

      setEmotionalWorlds(emotionalCandidates.map((world) => ({ world })));
      setBrowseCategories(browseCandidates);

      if (includeMatureInApi) {
        const { filterAvailableMaturePodcastCategories } = await import(
          "../services/mature/maturePodcastCategoryAvailability"
        );
        const { PODCAST_MATURE_SUBCATEGORIES } = await import(
          "../constants/podcastMatureCategories"
        );
        const available = await filterAvailableMaturePodcastCategories().catch(() => []);
        if (cancelled) return;
        const availableIds = new Set(available.map((cat) => cat.id));
        setMatureCategories(
          PODCAST_MATURE_SUBCATEGORIES.filter((cat) => availableIds.has(cat.id)).map((sub) => ({
            id: sub.id,
            title: sub.title,
            subtitle: sub.subtitle,
            icon: sub.icon,
            gradient: sub.gradient,
            catalogQuery: sub.catalogQuery,
            fallbackQuery: sub.fallbackQuery,
            tier: "mature" as const,
            isMature: true,
          }))
        );
      } else {
        setMatureCategories([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [includeMatureInApi, rememberShows]);

  const resolveShow = useCallback((showId: string) => {
    return showStoreRef.current.get(showId) || null;
  }, []);

  return {
    featured: toLaneItems(featuredPool),
    trending: toLaneItems(trendingPool),
    popular: toLaneItems(popularPool),
    recommended: toLaneItems(recommendedPool),
    recentlyPlayed,
    emotionalWorlds,
    browseCategories,
    matureCategories,
    loading,
    resolveShow,
  };
}
