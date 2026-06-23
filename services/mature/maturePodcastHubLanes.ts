import {
  MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
  maturePodcastHubLaneCacheKey,
  type MaturePodcastHubLaneId,
  getMaturePodcastHubLane,
} from "../../constants/maturePodcastHubLanes";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { readCachedPodcastShows, writeCachedPodcastShows } from "../../utils/podcastDiscoveryCache";
import { fetchPodcastShows, type HiddenTunesPodcastShow } from "../podcastCatalogApi";
import { filterAndRankMaturePodcastShows } from "./matureQualityFilters";

function dedupeById(shows: HiddenTunesPodcastShow[]) {
  const seen = new Set<string>();
  return shows.filter((show) => {
    if (seen.has(show.id)) return false;
    seen.add(show.id);
    return true;
  });
}

export async function loadMaturePodcastHubLanePage(
  laneId: MaturePodcastHubLaneId,
  offset = 0,
  options?: { forceRefresh?: boolean }
) {
  if (!shouldIncludeMatureInApi()) {
    return { shows: [] as HiddenTunesPodcastShow[], hasMore: false };
  }

  const lane = getMaturePodcastHubLane(laneId);
  if (!lane) return { shows: [], hasMore: false };

  const cacheKey = maturePodcastHubLaneCacheKey(laneId);
  const page = Math.floor(offset / MATURE_PODCAST_HUB_LANE_PAGE_SIZE) + 1;

  if (!options?.forceRefresh && offset === 0) {
    const cached = readCachedPodcastShows(cacheKey);
    if (cached?.length) {
      return {
        shows: cached.slice(0, MATURE_PODCAST_HUB_LANE_PAGE_SIZE),
        hasMore: cached.length >= MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
      };
    }
  }

  const response = await fetchPodcastShows({
    q: lane.searchQuery,
    page,
    limit: MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
    includeMature: true,
  });

  const ranked = filterAndRankMaturePodcastShows(
    dedupeById(response.success ? response.shows : []),
    {
      categoryId: `hub:${laneId}`,
      source: "mature-hub-lane",
    }
  );

  if (ranked.length > 0 && offset === 0) {
    writeCachedPodcastShows(cacheKey, ranked, { append: false });
  }

  return {
    shows: ranked.slice(0, MATURE_PODCAST_HUB_LANE_PAGE_SIZE),
    hasMore: response.success ? response.pagination.hasMore || ranked.length >= MATURE_PODCAST_HUB_LANE_PAGE_SIZE : false,
  };
}
