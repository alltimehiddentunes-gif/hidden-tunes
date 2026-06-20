import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  HiddenTunesPodcastEpisode,
  HiddenTunesPodcastShow,
} from "../services/podcastCatalogApi";

const SHOWS_STORAGE_PREFIX = "hidden_tunes_podcast_shows_v1";
const EPISODES_STORAGE_PREFIX = "hidden_tunes_podcast_episodes_v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 32;
const STORAGE_WRITE_DEBOUNCE_MS = 1200;

type CachedShowsPayload = {
  shows: HiddenTunesPodcastShow[];
  cachedAt: number;
};

type CachedEpisodesPayload = {
  episodes: HiddenTunesPodcastEpisode[];
  cachedAt: number;
};

const showsMemoryCache = new Map<string, CachedShowsPayload>();
const episodesMemoryCache = new Map<string, CachedEpisodesPayload>();
const showsInflight = new Map<string, Promise<HiddenTunesPodcastShow[]>>();
const episodesInflight = new Map<string, Promise<HiddenTunesPodcastEpisode[]>>();
const pendingStorageWrites = new Map<string, CachedShowsPayload | CachedEpisodesPayload>();
const storageWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();

function normalizeCacheKey(value: string) {
  return String(value || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
}

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt < CACHE_TTL_MS;
}

function trimMemoryCache(cache: Map<string, unknown>) {
  if (cache.size <= MAX_MEMORY_ENTRIES) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

function schedulePersistCache(
  storagePrefix: string,
  key: string,
  payload: CachedShowsPayload | CachedEpisodesPayload
) {
  const timerKey = `${storagePrefix}:${key}`;
  pendingStorageWrites.set(timerKey, payload);

  const existing = storageWriteTimers.get(timerKey);
  if (existing) clearTimeout(existing);

  storageWriteTimers.set(
    timerKey,
    setTimeout(() => {
      storageWriteTimers.delete(timerKey);
      const pending = pendingStorageWrites.get(timerKey);
      pendingStorageWrites.delete(timerKey);
      if (!pending) return;

      void AsyncStorage.setItem(
        `${storagePrefix}:${key}`,
        JSON.stringify(pending)
      ).catch(() => {});
    }, STORAGE_WRITE_DEBOUNCE_MS)
  );
}

export function readCachedPodcastShows(categoryId: string) {
  const key = normalizeCacheKey(categoryId);
  const memoryEntry = showsMemoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.shows;
  }
  return null;
}

export async function hydrateCachedPodcastShows(categoryId: string) {
  const key = normalizeCacheKey(categoryId);
  const memoryEntry = showsMemoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.shows;
  }

  try {
    const raw = await AsyncStorage.getItem(`${SHOWS_STORAGE_PREFIX}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedShowsPayload;
    if (!Array.isArray(parsed?.shows) || !isFresh(parsed.cachedAt)) {
      await AsyncStorage.removeItem(`${SHOWS_STORAGE_PREFIX}:${key}`);
      return null;
    }

    showsMemoryCache.set(key, parsed);
    return parsed.shows;
  } catch {
    return null;
  }
}

export function writeCachedPodcastShows(
  categoryId: string,
  shows: HiddenTunesPodcastShow[]
) {
  const key = normalizeCacheKey(categoryId);
  const payload: CachedShowsPayload = {
    shows,
    cachedAt: Date.now(),
  };

  showsMemoryCache.set(key, payload);
  trimMemoryCache(showsMemoryCache);
  schedulePersistCache(SHOWS_STORAGE_PREFIX, key, payload);
}

export function getPodcastShowsInflight(categoryId: string) {
  return showsInflight.get(normalizeCacheKey(categoryId));
}

export function setPodcastShowsInflight(
  categoryId: string,
  promise: Promise<HiddenTunesPodcastShow[]>
) {
  const key = normalizeCacheKey(categoryId);
  showsInflight.set(key, promise);

  promise.finally(() => {
    if (showsInflight.get(key) === promise) {
      showsInflight.delete(key);
    }
  });

  return promise;
}

export function readCachedPodcastEpisodes(showId: string) {
  const key = normalizeCacheKey(showId);
  const memoryEntry = episodesMemoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.episodes;
  }
  return null;
}

export async function hydrateCachedPodcastEpisodes(showId: string) {
  const key = normalizeCacheKey(showId);
  const memoryEntry = episodesMemoryCache.get(key);
  if (memoryEntry && isFresh(memoryEntry.cachedAt)) {
    return memoryEntry.episodes;
  }

  try {
    const raw = await AsyncStorage.getItem(`${EPISODES_STORAGE_PREFIX}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedEpisodesPayload;
    if (!Array.isArray(parsed?.episodes) || !isFresh(parsed.cachedAt)) {
      await AsyncStorage.removeItem(`${EPISODES_STORAGE_PREFIX}:${key}`);
      return null;
    }

    episodesMemoryCache.set(key, parsed);
    return parsed.episodes;
  } catch {
    return null;
  }
}

export function writeCachedPodcastEpisodes(
  showId: string,
  episodes: HiddenTunesPodcastEpisode[]
) {
  const key = normalizeCacheKey(showId);
  const payload: CachedEpisodesPayload = {
    episodes,
    cachedAt: Date.now(),
  };

  episodesMemoryCache.set(key, payload);
  trimMemoryCache(episodesMemoryCache);
  schedulePersistCache(EPISODES_STORAGE_PREFIX, key, payload);
}

export function getPodcastEpisodesInflight(showId: string) {
  return episodesInflight.get(normalizeCacheKey(showId));
}

export function setPodcastEpisodesInflight(
  showId: string,
  promise: Promise<HiddenTunesPodcastEpisode[]>
) {
  const key = normalizeCacheKey(showId);
  episodesInflight.set(key, promise);

  promise.finally(() => {
    if (episodesInflight.get(key) === promise) {
      episodesInflight.delete(key);
    }
  });

  return promise;
}

export function readCachedPodcastSearch(query: string) {
  return readCachedPodcastShows(`search:${query}`);
}

export async function hydrateCachedPodcastSearch(query: string) {
  return hydrateCachedPodcastShows(`search:${query}`);
}

export function writeCachedPodcastSearch(
  query: string,
  shows: HiddenTunesPodcastShow[]
) {
  writeCachedPodcastShows(`search:${query}`, shows);
}
