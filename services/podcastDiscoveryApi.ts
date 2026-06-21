import {
  fetchPodcastEpisodes,
  fetchPodcastShows,
  type HiddenTunesPodcastEpisode,
  type HiddenTunesPodcastShow,
} from "./podcastCatalogApi";
import { getLaunchPodcastCategory } from "../utils/launchPodcastCategories";
import { shouldIncludeMatureInApi } from "../utils/matureContentSettings";
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

const SHOW_PAGE_LIMIT = 24;
const EPISODE_PAGE_LIMIT = 30;
const SEARCH_PAGE_LIMIT = 28;

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

async function fetchShowsFromNetwork(categoryId: string) {
  const category = getLaunchPodcastCategory(categoryId);
  if (!category) return [];
  if (category.isMature && !shouldIncludeMatureInApi()) return [];

  const includeMature = shouldIncludeMatureInApi();

  const primary = await fetchPodcastShows({
    ...category.catalogQuery,
    page: category.catalogQuery.page || 1,
    limit: SHOW_PAGE_LIMIT,
    includeMature,
  });

  let shows = dedupeShows(primary.success ? primary.shows : []);

  if (!shows.length && category.fallbackQuery) {
    const fallback = await fetchPodcastShows({
      ...category.fallbackQuery,
      page: category.fallbackQuery.page || 1,
      limit: SHOW_PAGE_LIMIT,
      includeMature,
    });
    if (fallback.success) {
      shows = dedupeShows(fallback.shows);
    }
  }

  if (category.isMature) {
    shows = shows.map((show) => ({
      ...show,
      is_mature: true,
      content_rating:
        show.content_rating && show.content_rating !== "clean"
          ? show.content_rating
          : "adult",
    }));
  }

  return filterMatureShows(shows);
}

async function fetchSearchShowsFromNetwork(query: string) {
  const response = await fetchPodcastShows({
    q: query,
    page: 1,
    limit: SEARCH_PAGE_LIMIT,
    includeMature: shouldIncludeMatureInApi(),
  });

  return filterMatureShows(response.success ? dedupeShows(response.shows) : []);
}

async function fetchEpisodesFromNetwork(showId: string) {
  const response = await fetchPodcastEpisodes({
    show_id: showId,
    page: 1,
    limit: EPISODE_PAGE_LIMIT,
    includeMature: shouldIncludeMatureInApi(),
  });

  return filterMatureEpisodes(response.success ? dedupeEpisodes(response.episodes) : []);
}

export async function getPodcastShowsForCategory(
  categoryId: string,
  options?: { forceRefresh?: boolean }
) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return [];

  const category = getLaunchPodcastCategory(safeId);
  if (category?.isMature && !shouldIncludeMatureInApi()) return [];

  if (!options?.forceRefresh) {
    const memoryHit = readCachedPodcastShows(safeId);
    if (memoryHit?.length) return filterMatureShows(memoryHit);

    const inflight = getPodcastShowsInflight(safeId);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedPodcastShows(safeId);
    if (storageHit?.length) return filterMatureShows(storageHit);
  }

  const fetchPromise = fetchShowsFromNetwork(safeId)
    .then((shows) => {
      if (shows.length > 0) {
        writeCachedPodcastShows(safeId, shows);
      }
      return shows;
    })
    .catch(async () => {
      const memoryStale = readCachedPodcastShows(safeId);
      if (memoryStale?.length) return filterMatureShows(memoryStale);
      return filterMatureShows((await hydrateCachedPodcastShows(safeId)) || []);
    });

  return setPodcastShowsInflight(safeId, fetchPromise);
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

  const fetchPromise = fetchSearchShowsFromNetwork(safeQuery)
    .then((shows) => {
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

  const fetchPromise = fetchEpisodesFromNetwork(safeId)
    .then((episodes) => {
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
