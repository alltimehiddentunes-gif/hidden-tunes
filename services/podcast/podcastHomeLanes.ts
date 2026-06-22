import { PODCAST_HOME_LANE_PAGE_SIZE, podcastHomeLaneCacheKey } from "../../constants/podcastFoundation";
import type { HiddenTunesPodcastShow } from "../podcastCatalogApi";
import { readCachedPodcastShows, writeCachedPodcastShows } from "../../utils/podcastDiscoveryCache";
import { loadPodcastCategoryPage } from "../podcastDiscoveryApi";
import { filterDiscoverablePodcastShows } from "./podcastDiscoverability";
import { sortShowsByQuality } from "./podcastQualityScore";

const HOME_LANE_FALLBACK_IDS = [
  "trending",
  "popular",
  "business",
  "relationships",
  "health",
  "comedy",
  "news",
  "faith",
  "african-voices",
] as const;

function dedupeById(shows: HiddenTunesPodcastShow[]) {
  const seen = new Set<string>();
  return shows.filter((show) => {
    if (seen.has(show.id)) return false;
    seen.add(show.id);
    return true;
  });
}

async function loadLaneShows(
  laneId: string,
  offset = 0,
  options?: { forceRefresh?: boolean; append?: boolean }
) {
  const result = await loadPodcastCategoryPage(laneId, offset, options).catch(() => ({
    shows: [] as HiddenTunesPodcastShow[],
    hasMore: false,
  }));

  return {
    ...result,
    shows: filterDiscoverablePodcastShows(result.shows),
  };
}

export async function loadPodcastHomeLaneWithFallback(
  preferredLaneId: "featured" | "trending" | "popular",
  offset = 0,
  options?: { forceRefresh?: boolean; append?: boolean }
) {
  if (offset > 0) {
    return loadLaneShows(preferredLaneId, offset, options);
  }

  const laneOrder = [
    preferredLaneId,
    ...HOME_LANE_FALLBACK_IDS.filter((laneId) => laneId !== preferredLaneId),
  ];

  for (const laneId of laneOrder) {
    const result = await loadLaneShows(laneId, 0, options);
    if (result.shows.length) {
      return result;
    }
  }

  return { shows: [], hasMore: false };
}

export function buildRecommendedPodcastShows(
  featured: HiddenTunesPodcastShow[],
  trending: HiddenTunesPodcastShow[],
  recentShowIds: Set<string>,
  limit = PODCAST_HOME_LANE_PAGE_SIZE
) {
  const pool = dedupeById([...trending, ...featured]).filter(
    (show) => !recentShowIds.has(show.id) && !show.is_mature
  );

  const recentCategorySet = new Set<string>();
  featured
    .filter((show) => recentShowIds.has(show.id))
    .forEach((show) => {
      show.categories.forEach((cat) => recentCategorySet.add(cat.toLowerCase()));
      if (show.primary_category) {
        recentCategorySet.add(show.primary_category.toLowerCase());
      }
    });

  const scored = pool.map((show) => {
    let score = show.quality_score || 0;
    show.categories.forEach((cat) => {
      if (recentCategorySet.has(cat.toLowerCase())) score += 8;
    });
    if (show.primary_category && recentCategorySet.has(show.primary_category.toLowerCase())) {
      score += 8;
    }
    return { show, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return sortShowsByQuality(scored.map((entry) => entry.show)).slice(0, limit);
}

export async function loadRecommendedPodcastLanePage(
  offset = 0,
  options?: { forceRefresh?: boolean; append?: boolean }
) {
  const cacheKey = podcastHomeLaneCacheKey("recommended");

  if (!options?.forceRefresh && offset === 0) {
    const cached = readCachedPodcastShows(cacheKey);
    if (cached?.length) {
      const page = filterDiscoverablePodcastShows(cached).slice(
        offset,
        offset + PODCAST_HOME_LANE_PAGE_SIZE
      );
      return {
        shows: page,
        hasMore: cached.length > offset + page.length,
      };
    }
  }

  const [featuredResult, trendingResult] = await Promise.all([
    loadPodcastHomeLaneWithFallback("featured", 0, { forceRefresh: false }),
    loadPodcastHomeLaneWithFallback("trending", 0, { forceRefresh: false }),
  ]);

  const recommended = buildRecommendedPodcastShows(
    featuredResult.shows,
    trendingResult.shows,
    new Set()
  );

  if (recommended.length > 0) {
    writeCachedPodcastShows(cacheKey, recommended, { append: false });
  }

  const page = recommended.slice(offset, offset + PODCAST_HOME_LANE_PAGE_SIZE);
  return {
    shows: page,
    hasMore: recommended.length > offset + page.length,
  };
}

export function rememberRecommendedPodcastLane(
  featured: HiddenTunesPodcastShow[],
  trending: HiddenTunesPodcastShow[],
  recentShowIds: Set<string>
) {
  const recommended = buildRecommendedPodcastShows(featured, trending, recentShowIds);
  if (recommended.length > 0) {
    void writeCachedPodcastShows(podcastHomeLaneCacheKey("recommended"), recommended, {
      append: false,
    });
  }
  return recommended;
}

export async function loadPodcastHomeLanePage(
  laneId: "featured" | "trending" | "popular",
  offset = 0,
  options?: { forceRefresh?: boolean; append?: boolean }
) {
  return loadPodcastHomeLaneWithFallback(laneId, offset, options);
}
