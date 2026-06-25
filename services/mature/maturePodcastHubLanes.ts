import {
  MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
  maturePodcastHubLaneCacheKey,
  type MaturePodcastHubLaneId,
  getMaturePodcastHubLane,
} from "../../constants/maturePodcastHubLanes";
import { MATURE_MIN_HUB_RAIL_ITEMS } from "../../constants/matureDiscoveryFoundation";
import { getMaturePodcastQueryGroup } from "../../constants/maturePodcastQueryGroups";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { readCachedPodcastShows, writeCachedPodcastShows } from "../../utils/podcastDiscoveryCache";
import { fetchPodcastShows, type HiddenTunesPodcastShow } from "../podcastCatalogApi";
import {
  dedupeMaturePodcastShows,
  filterAndRankMaturePodcastShows,
  isMaturePlayableShow,
} from "./matureQualityFilters";
import { fetchMaturePodcastBatch } from "./maturePodcastDiscovery";

function dedupeById(shows: HiddenTunesPodcastShow[]) {
  return dedupeMaturePodcastShows(shows);
}

async function loadMergedCategoryLaneShows(
  laneId: string,
  groupIds: string[],
  signal?: AbortSignal
) {
  const merged: HiddenTunesPodcastShow[] = [];
  const seen = new Set<string>();

  for (const groupId of groupIds) {
    if (signal?.aborted) break;
    const group = getMaturePodcastQueryGroup(groupId);
    if (!group) continue;

    const { ranked } = await fetchMaturePodcastBatch(group, 0, `hub:${laneId}:${groupId}`, signal);
    for (const show of ranked) {
      if (seen.has(show.id)) continue;
      seen.add(show.id);
      merged.push(show);
      if (merged.length >= MATURE_PODCAST_HUB_LANE_PAGE_SIZE * 2) break;
    }
    if (merged.length >= MATURE_PODCAST_HUB_LANE_PAGE_SIZE) break;
  }

  return filterAndRankMaturePodcastShows(merged, {
    categoryId: `hub:${laneId}`,
    source: "mature-hub-category-merge",
    finalDisplayedCount: Math.min(
      merged.filter(isMaturePlayableShow).length,
      MATURE_PODCAST_HUB_LANE_PAGE_SIZE
    ),
  });
}

export async function loadMaturePodcastHubLanePage(
  laneId: MaturePodcastHubLaneId,
  offset = 0,
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
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
      const playable = cached.filter(isMaturePlayableShow);
      if (playable.length >= MATURE_MIN_HUB_RAIL_ITEMS) {
        return {
          shows: playable.slice(0, MATURE_PODCAST_HUB_LANE_PAGE_SIZE),
          hasMore: playable.length >= MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
        };
      }
    }
  }

  let ranked: HiddenTunesPodcastShow[] = [];

  if (lane.kind === "categories" && lane.categoryGroupIds?.length) {
    ranked = await loadMergedCategoryLaneShows(laneId, lane.categoryGroupIds, options?.signal);
  } else {
    const response = await fetchPodcastShows({
      q: lane.searchQuery,
      page,
      limit: MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
      includeMature: true,
      signal: options?.signal,
    });

    ranked = filterAndRankMaturePodcastShows(dedupeById(response.success ? response.shows : []), {
      categoryId: `hub:${laneId}`,
      source: "mature-hub-lane",
      finalDisplayedCount: MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
    });
  }

  const playable = ranked.filter(isMaturePlayableShow);

  if (playable.length >= MATURE_MIN_HUB_RAIL_ITEMS && offset === 0) {
    writeCachedPodcastShows(cacheKey, playable, { append: false });
  }

  return {
    shows: playable.slice(0, MATURE_PODCAST_HUB_LANE_PAGE_SIZE),
    hasMore: playable.length >= MATURE_PODCAST_HUB_LANE_PAGE_SIZE,
  };
}
