import {
  fetchPodcastEpisodes,
  fetchPodcastShows,
  type HiddenTunesPodcastEpisode,
  type HiddenTunesPodcastShow,
} from "./podcastCatalogApi";
import { getLaunchPodcastCategory } from "../utils/launchPodcastCategories";
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
  const deduped: HiddenTunesPodcastEpisode[] = [];

  for (const episode of episodes) {
    if (seenIds.has(episode.id)) continue;
    seenIds.add(episode.id);
    deduped.push(episode);
  }

  return deduped;
}

async function fetchShowsFromNetwork(categoryId: string) {
  const category = getLaunchPodcastCategory(categoryId);
  if (!category) return [];

  const primary = await fetchPodcastShows({
    ...category.catalogQuery,
    page: category.catalogQuery.page || 1,
    limit: SHOW_PAGE_LIMIT,
  });

  let shows = primary.success ? primary.shows : [];

  if (!shows.length && category.fallbackQuery) {
    const fallback = await fetchPodcastShows({
      ...category.fallbackQuery,
      page: category.fallbackQuery.page || 1,
      limit: SHOW_PAGE_LIMIT,
    });
    if (fallback.success) {
      shows = fallback.shows;
    }
  }

  return dedupeShows(shows);
}

async function fetchSearchShowsFromNetwork(query: string) {
  const response = await fetchPodcastShows({
    q: query,
    page: 1,
    limit: SEARCH_PAGE_LIMIT,
  });

  return response.success ? dedupeShows(response.shows) : [];
}

async function fetchEpisodesFromNetwork(showId: string) {
  const response = await fetchPodcastEpisodes({
    show_id: showId,
    page: 1,
    limit: EPISODE_PAGE_LIMIT,
  });

  return response.success ? dedupeEpisodes(response.episodes) : [];
}

export async function getPodcastShowsForCategory(
  categoryId: string,
  options?: { forceRefresh?: boolean }
) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return [];

  if (!options?.forceRefresh) {
    const memoryHit = readCachedPodcastShows(safeId);
    if (memoryHit?.length) return memoryHit;

    const inflight = getPodcastShowsInflight(safeId);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedPodcastShows(safeId);
    if (storageHit?.length) return storageHit;
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
      if (memoryStale?.length) return memoryStale;
      return (await hydrateCachedPodcastShows(safeId)) || [];
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
    if (memoryHit?.length) return memoryHit;

    const inflight = getPodcastShowsInflight(`search:${cacheKey}`);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedPodcastSearch(cacheKey);
    if (storageHit?.length) return storageHit;
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
      if (memoryStale?.length) return memoryStale;
      return (await hydrateCachedPodcastSearch(cacheKey)) || [];
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
    if (memoryHit?.length) return memoryHit;

    const inflight = getPodcastEpisodesInflight(safeId);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedPodcastEpisodes(safeId);
    if (storageHit?.length) return storageHit;
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
      if (memoryStale?.length) return memoryStale;
      return (await hydrateCachedPodcastEpisodes(safeId)) || [];
    });

  return setPodcastEpisodesInflight(safeId, fetchPromise);
}

export function prefetchPodcastShowsForCategory(categoryId: string) {
  if (readCachedPodcastShows(categoryId)?.length) return;
  void getPodcastShowsForCategory(categoryId).catch(() => {});
}

export function prefetchPodcastEpisodesForShow(showId: string) {
  if (readCachedPodcastEpisodes(showId)?.length) return;
  void getPodcastEpisodesForShow(showId).catch(() => {});
}
