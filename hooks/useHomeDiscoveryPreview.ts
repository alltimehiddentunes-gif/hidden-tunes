import { useEffect, useMemo, useState } from "react";

import { PODCAST_ROOT_SECTIONS } from "../constants/podcastCategories";
import { buildStaticPodcastHomeSync, getPodcastHomeShowSections } from "../services/podcastService";
import { loadRadioHomeLanePage } from "../services/radio/radioHomeLanes";
import { toRadioStationListItem } from "../services/radio/radioNormalizer";
import type { PodcastCategoryDef } from "../constants/podcastCategories";
import type { PodcastShow } from "../types/podcast";
import type { PodcastHomeShowSection } from "../services/podcastService";
import type { RadioStationListItem } from "../types/radio";
import { shouldIncludeMaturePodcasts } from "../utils/maturePodcastSettings";

type HomeDiscoveryPreviewState = {
  radioStations: RadioStationListItem[];
  radioLoading: boolean;
  podcastFeatured: PodcastShow[];
  podcastSections: PodcastHomeShowSection[];
  podcastCategories: PodcastCategoryDef[];
  audiobookCategories: PodcastCategoryDef[];
};

const EMPTY_STATE: HomeDiscoveryPreviewState = {
  radioStations: [],
  radioLoading: false,
  podcastFeatured: [],
  podcastSections: [],
  podcastCategories: [],
  audiobookCategories: [],
};

export function useHomeDiscoveryPreview(enabled: boolean): HomeDiscoveryPreviewState {
  const [radioStations, setRadioStations] = useState<RadioStationListItem[]>([]);
  const [radioLoading, setRadioLoading] = useState(false);

  const podcastSnapshot = useMemo(() => {
    const includeMature = shouldIncludeMaturePodcasts();
    const home = buildStaticPodcastHomeSync(includeMature);
    return {
      podcastFeatured: home.featured.slice(0, 8),
      podcastSections: getPodcastHomeShowSections(includeMature).slice(0, 2),
      podcastCategories: home.browseCategories.slice(0, 8),
      audiobookCategories: PODCAST_ROOT_SECTIONS.filter((section) => !section.matureOnly).slice(
        0,
        4
      ),
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRadioStations([]);
      setRadioLoading(false);
      return;
    }

    let cancelled = false;
    setRadioLoading(true);

    void loadRadioHomeLanePage("featured", { limit: 8 })
      .then((result) => {
        if (cancelled) return;
        setRadioStations(result.stations.map(toRadioStationListItem));
      })
      .catch(() => {
        if (!cancelled) setRadioStations([]);
      })
      .finally(() => {
        if (!cancelled) setRadioLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) {
    return EMPTY_STATE;
  }

  return {
    radioStations,
    radioLoading,
    ...podcastSnapshot,
  };
}
