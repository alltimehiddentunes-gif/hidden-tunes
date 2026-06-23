import {
  fetchPodcastEpisodes,
  fetchPodcastShows,
  type HiddenTunesPodcastEpisode,
  type HiddenTunesPodcastShow,
} from "./podcastCatalogApi";
import {
  getPodcastCategory,
  resolvePodcastCategoryId,
  type PodcastCategory,
} from "../constants/podcastCategories";
import {
  PODCAST_FEATURED_MIN_QUALITY,
  PODCAST_POPULAR_MIN_QUALITY,
  podcastHomeLaneCacheKey,
  type PodcastHomeLaneId,
} from "../constants/podcastFoundation";
import { showMatchesEmotionalWorld, getPodcastEmotionalWorld } from "../constants/podcastEmotionalWorlds";
import { shouldIncludeMatureInApi } from "../utils/matureContentSettings";
import { MEDIA_DISCOVERY_PAGE_SIZE, pageFromOffset } from "../constants/mediaDiscovery";
import {
  filterVisiblePodcastEpisodes,
  filterVisiblePodcastShows,
} from "../utils/maturePodcastVisibility";
import {
  getPodcastEpisodesInflight,
  getPodcastShowsInflight,
  hydrateCachedPodcastEpisodes,
  hydrateCachedPodcastSearch,
  hydrateCachedPodcastShows,
  readCachedPodcastEpisodes,
  readCachedPodcastSearch,
  readCachedPodcastShows,
  setPodcastEpisodesInflight,
  setPodcastShowsInflight,
  writeCachedPodcastEpisodes,
  writeCachedPodcastSearch,
  writeCachedPodcastShows,
} from "../utils/podcastDiscoveryCache";
import {
  enrichShowWithQuality,
  sortShowsByEpisodeCount,
  sortShowsByQuality,
  sortShowsByRecency,
} from "./podcast/podcastQualityScore";
import { buildPodcastSearchQueries } from "../utils/mediaSearchQueryExpansion";
import { PODCAST_SEARCH_MAX_FALLBACK_QUERIES } from "../utils/searchPerformance";
import {
  filterDiscoverablePodcastShows,
  filterPlayablePodcastEpisodes,
  rankShowsByPlayabilitySignal,
} from "./podcast/podcastDiscoverability";

const SHOW_PAGE_LIMIT = MEDIA_DISCOVERY_PAGE_SIZE;
const EPISODE_PAGE_LIMIT = MEDIA_DISCOVERY_PAGE_SIZE;
const SEARCH_PAGE_LIMIT = MEDIA_DISCOVERY_PAGE_SIZE;

export { MEDIA_DISCOVERY_PAGE_SIZE as PODCAST_DISCOVERY_PAGE_SIZE };

function dedupeShows(shows: HiddenTunesPodcastShow[]) {
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const deduped: HiddenTunesPodcastShow[] = [];

  for (const show of shows) {
    if (seenIds.has(show.id)) continue;

    const slugKey = show.slug.trim().toLowerCase();
    if (slugKey && seenSlugs.has(slugKey)) continue;

    seenIds.add(show.id);
    if (slugKey) seenSlugs.add(slugKey);
    deduped.push(show);
  }

  return deduped;
}

function dedupeEpisodes(episodes: HiddenTunesPodcastEpisode[]) {
  const seenIds = new Set<string>();
  const seenAudio = new Set<string>();
  const deduped: HiddenTunesPodcastEpisode[] = [];

  for (const episode of episodes) {
    if (seenIds.has(episode.id)) continue;

    const audioKey = String(episode.audio_url || "").trim().toLowerCase();
    if (audioKey && seenAudio.has(audioKey)) continue;

    seenIds.add(episode.id);
    if (audioKey) seenAudio.add(audioKey);
    deduped.push(episode);
  }

  return deduped;
}

function filterMatureShows(shows: HiddenTunesPodcastShow[]) {
  return filterVisiblePodcastShows(shows);
}

function filterMatureEpisodes(episodes: HiddenTunesPodcastEpisode[]) {
  return filterVisiblePodcastEpisodes(episodes);
}

function stripMatureFromStandardDiscovery(shows: HiddenTunesPodcastShow[], category: PodcastCategory) {
  if (category.isMature || category.tier === "mature" || category.tier === "mature-hub") {
    return shows;
  }
  return shows.filter((show) => !show.is_mature);
}

function curateShowsForCategory(shows: HiddenTunesPodcastShow[], category: PodcastCategory) {
  let curated = dedupeShows(shows.map(enrichShowWithQuality));

  if (category.tier === "emotional") {
    const world = getPodcastEmotionalWorld(category.id);
    if (world) {
      curated = curated.filter((show) => showMatchesEmotionalWorld(show, world));
    }
  }

  if (category.laneKind === "featured") {
    curated = sortShowsByQuality(
      curated.filter((show) => (show.quality_score || 0) >= PODCAST_FEATURED_MIN_QUALITY)
    );
  } else if (category.laneKind === "trending") {
    curated = sortShowsByRecency(curated);
  } else if (category.laneKind === "popular") {
    curated = sortShowsByEpisodeCount(
      curated.filter((show) => (show.quality_score || 0) >= PODCAST_POPULAR_MIN_QUALITY)
    );
  } else if (category.id === "new-releases" || category.id === "new-this-week" || category.id === "recently-added") {
    curated = sortShowsByRecency(curated);
  } else if (category.tier === "emotional" || category.tier === "browse") {
    curated = sortShowsByQuality(curated);
  } else if (category.tier === "mature" || category.tier === "mature-hub") {
    curated = sortShowsByQuality(curated);
  }

  return stripMatureFromStandardDiscovery(curated, category);
}

function finalizeDiscoverableShows(shows: HiddenTunesPodcastShow[]) {
  return filterDiscoverablePodcastShows(shows);
}

function resolveCategoryCacheKey(categoryId: string) {
  const resolvedId = resolvePodcastCategoryId(categoryId);
  const category = getPodcastCategory(resolvedId);
  if (!category) return resolvedId;

  if (category.tier === "home-lane" && category.laneKind && category.laneKind !== "recommended") {
    return podcastHomeLaneCacheKey(category.laneKind as PodcastHomeLaneId);
  }

  if (category.laneKind === "recommended") {
    return podcastHomeLaneCacheKey("recommended");
  }

  return resolvedId;
}

async function fetchShowsFromNetwork(categoryId: string, page = 1) {
  const resolvedId = resolvePodcastCategoryId(categoryId);
  const category = getPodcastCategory(resolvedId);
  if (!category) return { shows: [] as HiddenTunesPodcastShow[], hasMore: false };
  if (category.isMature && !shouldIncludeMatureInApi()) {
    return { shows: [], hasMore: false };
  }

  if (category.tier === "mature" && category.isMature) {
    const { loadMaturePodcastCategoryPage } = await import("./mature/maturePodcastDiscovery");
    const offset = (page - 1) * SHOW_PAGE_LIMIT;
    return loadMaturePodcastCategoryPage(resolvedId, offset, {
      allowSparseExpansion: offset > 0,
    });
  }

  const includeMature = shouldIncludeMatureInApi();

  const primary = await fetchPodcastShows({
    ...category.catalogQuery,
    page,
    limit: SHOW_PAGE_LIMIT,
    includeMature: category.isMature || category.tier === "mature" ? true : includeMature,
  });

  let shows = primary.success ? primary.shows : [];
  let hasMore = primary.success ? primary.pagination.hasMore : false;

  if (!shows.length && category.fallbackQuery && page === 1) {
    const fallback = await fetchPodcastShows({
      ...category.fallbackQuery,
      page: 1,
      limit: SHOW_PAGE_LIMIT,
      includeMature: category.isMature || category.tier === "mature" ? true : includeMature,
    });
    if (fallback.success) {
      shows = fallback.shows;
      hasMore = fallback.pagination.hasMore;
    }
  }

  shows = finalizeDiscoverableShows(curateShowsForCategory(shows, category));

  if (category.isMature || category.tier === "mature") {
    shows = shows.map((show) => ({
      ...show,
      is_mature: true,
      content_rating:
        show.content_rating && show.content_rating !== "clean"
          ? show.content_rating
          : "adult",
    }));
  }

  return {
    shows: filterMatureShows(shows),
    hasMore,
  };
}

async function fetchSearchShowsFromNetwork(query: string, page = 1) {
  const includeMature = shouldIncludeMatureInApi();
  const searchQueries = (
    page === 1 ? buildPodcastSearchQueries(query, { includeMature }) : [String(query || "").trim()]
  ).slice(0, PODCAST_SEARCH_MAX_FALLBACK_QUERIES);

  let merged: HiddenTunesPodcastShow[] = [];
  let hasMore = false;

  for (let index = 0; index < searchQueries.length; index += 1) {
    const searchQuery = searchQueries[index];
    if (!searchQuery) continue;
    if (page === 1 && merged.length >= SEARCH_PAGE_LIMIT) break;

    const response = await fetchPodcastShows({
      q: searchQuery,
      page,
      limit: SEARCH_PAGE_LIMIT,
      includeMature,
    });

    if (!response.success) continue;

    const batch = rankShowsByPlayabilitySignal(
      dedupeShows(response.shows)
        .map(enrichShowWithQuality)
        .filter((show) => !show.is_mature || includeMature)
    );

    merged = dedupeShows([...merged, ...batch]);
    hasMore = hasMore || response.pagination.hasMore;

    if (page !== 1) break;
    if (index === 0 && merged.length > 0) break;
    if (merged.length >= SEARCH_PAGE_LIMIT) break;
  }

  return {
    shows: filterMatureShows(filterDiscoverablePodcastShows(merged.slice(0, SEARCH_PAGE_LIMIT))),
    hasMore,
  };
}

async function fetchEpisodesFromNetwork(showId: string, page = 1) {
  const response = await fetchPodcastEpisodes({
    show_id: showId,
    page,
    limit: EPISODE_PAGE_LIMIT,
    includeMature: shouldIncludeMatureInApi(),
  });

  return {
    episodes: filterMatureEpisodes(
      filterPlayablePodcastEpisodes(
        response.success ? dedupeEpisodes(response.episodes) : []
      )
    ),
    hasMore: response.success ? response.pagination.hasMore : false,
  };
}

export async function loadPodcastCategoryPage(
  categoryId: string,
  offset = 0,
  options?: { forceRefresh?: boolean; append?: boolean }
) {
  const resolvedId = resolvePodcastCategoryId(String(categoryId || "").trim());
  if (!resolvedId) return { shows: [], hasMore: false };

  const category = getPodcastCategory(resolvedId);
  if (category?.isMature && !shouldIncludeMatureInApi()) {
    return { shows: [], hasMore: false };
  }

  if (category?.laneKind === "recommended") {
    const { loadRecommendedPodcastLanePage } = await import("./podcast/podcastHomeLanes");
    return loadRecommendedPodcastLanePage(offset, options);
  }

  const cacheKey = resolveCategoryCacheKey(resolvedId);
  const page = pageFromOffset(offset, SHOW_PAGE_LIMIT);

  if (!options?.forceRefresh && offset === 0 && !options?.append) {
    const memoryHit = readCachedPodcastShows(cacheKey);
    if (memoryHit?.length) {
      const visible = filterMatureShows(memoryHit.slice(0, SHOW_PAGE_LIMIT));
      return {
        shows: visible,
        hasMore: memoryHit.length >= SHOW_PAGE_LIMIT,
      };
    }
  }

  const fetchPromise = fetchShowsFromNetwork(resolvedId, page).then(({ shows, hasMore }) => {
    if (shows.length > 0) {
      writeCachedPodcastShows(cacheKey, shows, { append: Boolean(options?.append || offset > 0) });
    }
    return { shows, hasMore };
  });

  if (offset === 0 && !options?.append && !options?.forceRefresh) {
    const inflight = getPodcastShowsInflight(cacheKey);
    if (inflight) {
      const shows = await inflight;
      return {
        shows: filterMatureShows(shows.slice(0, SHOW_PAGE_LIMIT)),
        hasMore: shows.length >= SHOW_PAGE_LIMIT,
      };
    }
    return setPodcastShowsInflight(
      cacheKey,
      fetchPromise.then((result) => result.shows)
    ).then((shows) => ({
      shows: filterMatureShows(shows.slice(0, SHOW_PAGE_LIMIT)),
      hasMore: shows.length >= SHOW_PAGE_LIMIT,
    }));
  }

  return fetchPromise;
}

export async function loadPodcastSearchPage(
  query: string,
  options?: { offset?: number; forceRefresh?: boolean; append?: boolean }
) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return { shows: [], hasMore: false };

  const offset = Math.max(0, Number(options?.offset) || 0);
  const cacheKey = safeQuery.toLowerCase();
  const page = pageFromOffset(offset, SEARCH_PAGE_LIMIT);

  if (!options?.forceRefresh && offset === 0 && !options?.append) {
    const memoryHit = readCachedPodcastSearch(cacheKey);
    if (memoryHit?.length) {
      return {
        shows: filterMatureShows(memoryHit.slice(0, SEARCH_PAGE_LIMIT)),
        hasMore: memoryHit.length >= SEARCH_PAGE_LIMIT,
      };
    }
  }

  const fetchPromise = fetchSearchShowsFromNetwork(safeQuery, page).then(({ shows, hasMore }) => {
    if (shows.length > 0) {
      writeCachedPodcastSearch(cacheKey, shows, {
        append: Boolean(options?.append || offset > 0),
      });
    }
    return { shows, hasMore };
  });

  if (offset === 0 && !options?.append && !options?.forceRefresh) {
    const inflight = getPodcastShowsInflight(`search:${cacheKey}`);
    if (inflight) {
      const shows = await inflight;
      return {
        shows: filterMatureShows(shows.slice(0, SEARCH_PAGE_LIMIT)),
        hasMore: shows.length >= SEARCH_PAGE_LIMIT,
      };
    }
    return setPodcastShowsInflight(
      `search:${cacheKey}`,
      fetchPromise.then((result) => result.shows)
    ).then((shows) => ({
      shows: filterMatureShows(shows.slice(0, SEARCH_PAGE_LIMIT)),
      hasMore: shows.length >= SEARCH_PAGE_LIMIT,
    }));
  }

  return fetchPromise;
}

export async function loadPodcastEpisodesPage(
  showId: string,
  offset = 0,
  options?: { forceRefresh?: boolean; append?: boolean }
) {
  const safeId = String(showId || "").trim();
  if (!safeId) return { episodes: [], hasMore: false };

  const page = pageFromOffset(offset, EPISODE_PAGE_LIMIT);

  if (!options?.forceRefresh && offset === 0 && !options?.append) {
    const memoryHit = readCachedPodcastEpisodes(safeId);
    if (memoryHit?.length) {
      return {
        episodes: filterMatureEpisodes(memoryHit.slice(0, EPISODE_PAGE_LIMIT)),
        hasMore: memoryHit.length >= EPISODE_PAGE_LIMIT,
      };
    }
  }

  const fetchPromise = fetchEpisodesFromNetwork(safeId, page).then(({ episodes, hasMore }) => {
    if (episodes.length > 0) {
      writeCachedPodcastEpisodes(safeId, episodes, {
        append: Boolean(options?.append || offset > 0),
      });
    }
    return { episodes, hasMore };
  });

  if (offset === 0 && !options?.append && !options?.forceRefresh) {
    const inflight = getPodcastEpisodesInflight(safeId);
    if (inflight) {
      const episodes = await inflight;
      return {
        episodes: filterMatureEpisodes(episodes.slice(0, EPISODE_PAGE_LIMIT)),
        hasMore: episodes.length >= EPISODE_PAGE_LIMIT,
      };
    }
    return setPodcastEpisodesInflight(
      safeId,
      fetchPromise.then((result) => result.episodes)
    ).then((episodes) => ({
      episodes: filterMatureEpisodes(episodes.slice(0, EPISODE_PAGE_LIMIT)),
      hasMore: episodes.length >= EPISODE_PAGE_LIMIT,
    }));
  }

  return fetchPromise;
}

export async function getPodcastShowsForCategory(
  categoryId: string,
  options?: { forceRefresh?: boolean }
) {
  const resolvedId = resolvePodcastCategoryId(String(categoryId || "").trim());
  if (!resolvedId) return [];

  const category = getPodcastCategory(resolvedId);
  if (category?.isMature && !shouldIncludeMatureInApi()) return [];

  const cacheKey = resolveCategoryCacheKey(resolvedId);

  if (!options?.forceRefresh) {
    const memoryHit = readCachedPodcastShows(cacheKey);
    if (memoryHit?.length) return filterMatureShows(memoryHit);

    const inflight = getPodcastShowsInflight(cacheKey);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedPodcastShows(cacheKey);
    if (storageHit?.length) return filterMatureShows(storageHit);
  }

  const fetchPromise = fetchShowsFromNetwork(resolvedId, 1)
    .then(({ shows }) => {
      if (shows.length > 0) {
        writeCachedPodcastShows(cacheKey, shows);
      }
      return shows;
    })
    .catch(async () => {
      const memoryStale = readCachedPodcastShows(cacheKey);
      if (memoryStale?.length) return filterMatureShows(memoryStale);
      return filterMatureShows((await hydrateCachedPodcastShows(cacheKey)) || []);
    });

  return setPodcastShowsInflight(cacheKey, fetchPromise);
}

export async function searchPodcastShows(
  query: string,
  options?: { forceRefresh?: boolean }
) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return [];

  const cacheKey = safeQuery.toLowerCase();

  if (!options?.forceRefresh) {
    const memoryHit = readCachedPodcastSearch(cacheKey);
    if (memoryHit?.length) return filterMatureShows(memoryHit);

    const inflight = getPodcastShowsInflight(`search:${cacheKey}`);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedPodcastSearch(cacheKey);
    if (storageHit?.length) return filterMatureShows(storageHit);
  }

  const fetchPromise = fetchSearchShowsFromNetwork(safeQuery, 1)
    .then(({ shows }) => {
      if (shows.length > 0) {
        writeCachedPodcastSearch(cacheKey, shows);
      }
      return shows;
    })
    .catch(async () => {
      const memoryStale = readCachedPodcastSearch(cacheKey);
      if (memoryStale?.length) return filterMatureShows(memoryStale);
      return filterMatureShows((await hydrateCachedPodcastSearch(cacheKey)) || []);
    });

  return setPodcastShowsInflight(`search:${cacheKey}`, fetchPromise);
}

export async function getPodcastEpisodesForShow(
  showId: string,
  options?: { forceRefresh?: boolean }
) {
  const safeId = String(showId || "").trim();
  if (!safeId) return [];

  if (!options?.forceRefresh) {
    const memoryHit = readCachedPodcastEpisodes(safeId);
    if (memoryHit?.length) return filterMatureEpisodes(memoryHit);

    const inflight = getPodcastEpisodesInflight(safeId);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedPodcastEpisodes(safeId);
    if (storageHit?.length) return filterMatureEpisodes(storageHit);
  }

  const fetchPromise = fetchEpisodesFromNetwork(safeId, 1)
    .then(({ episodes }) => {
      if (episodes.length > 0) {
        writeCachedPodcastEpisodes(safeId, episodes);
      }
      return episodes;
    })
    .catch(async () => {
      const memoryStale = readCachedPodcastEpisodes(safeId);
      if (memoryStale?.length) return filterMatureEpisodes(memoryStale);
      return filterMatureEpisodes((await hydrateCachedPodcastEpisodes(safeId)) || []);
    });

  return setPodcastEpisodesInflight(safeId, fetchPromise);
}

export function prefetchPodcastShowsForCategory(_categoryId: string) {
  // Intentionally disabled — browse screens load cache-first on demand only.
}

export function prefetchPodcastEpisodesForShow(_showId: string) {
  // Intentionally disabled — browse screens load cache-first on demand only.
}
