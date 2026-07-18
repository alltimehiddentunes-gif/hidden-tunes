/**
 * Same-show podcast episode queue loader.
 * Bounded window only — never blocks tap-to-play on a full-show crawl.
 */
import {
  fetchPodcastEpisodesByShow,
  fetchPodcastShowById,
  PODCAST_CATALOG_PAGE_LIMIT,
  type PodcastCatalogEpisodeMetadata,
} from "@/services/podcastCatalogApi";
import type { PodcastEpisode } from "@/types/podcast";

/** Initial same-show window fetched after playback starts (one API page). */
export const PODCAST_SHOW_QUEUE_INITIAL_LIMIT = 16;
const MAX_CACHE_ENTRIES = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;

type ShowEpisodeCacheEntry = {
  showId: string;
  showTitle: string;
  episodes: PodcastEpisode[];
  total: number;
  fetchedAt: number;
  pagesFetched: number;
};

const showEpisodeCache = new Map<string, ShowEpisodeCacheEntry>();
const showEpisodeInflight = new Map<string, Promise<ShowEpisodeCacheEntry>>();

function clean(value: unknown) {
  return String(value || "").trim();
}

function podcastPerfLog(tag: string, payload: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(tag, { at: Date.now(), ...payload });
}

function metadataToShowEpisode(
  metadata: PodcastCatalogEpisodeMetadata,
  showTitle: string
): PodcastEpisode {
  return {
    id: metadata.id,
    showId: metadata.showId,
    showTitle,
    title: metadata.title,
    description: metadata.description || "",
    artworkUrl: metadata.artworkUrl || "",
    audioUrl: "",
    durationSeconds: metadata.durationSeconds,
    publishedAt: metadata.publishedAt,
    language: "unknown",
    categories: [],
    isExplicit: false,
    matureLevel: "safe",
    source: "podcast_rss",
  };
}

function sortShowEpisodesNewestFirst(episodes: PodcastEpisode[]) {
  return [...episodes].sort((a, b) => {
    const aTime = Date.parse(String(a.publishedAt || "")) || 0;
    const bTime = Date.parse(String(b.publishedAt || "")) || 0;
    if (aTime !== bTime) return bTime - aTime;
    return clean(a.id).localeCompare(clean(b.id));
  });
}

function evictCacheIfNeeded() {
  while (showEpisodeCache.size > MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of showEpisodeCache) {
      if (entry.fetchedAt < oldestAt) {
        oldestAt = entry.fetchedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    showEpisodeCache.delete(oldestKey);
  }
}

export function getPodcastShowEpisodeCacheStats() {
  return {
    entries: showEpisodeCache.size,
    maxEntries: MAX_CACHE_ENTRIES,
    inflight: showEpisodeInflight.size,
  };
}

export function getCachedPodcastShowEpisodes(showId: string) {
  const id = clean(showId);
  if (!id) return null;
  const cached = showEpisodeCache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
  return cached;
}

/**
 * Keep a bounded window around the active episode (newest-first order).
 */
export function slicePodcastEpisodeWindow(
  episodes: PodcastEpisode[],
  activeEpisodeId: string,
  before = 7,
  after = 8
): PodcastEpisode[] {
  if (!episodes.length) return [];
  const activeId = clean(activeEpisodeId);
  const index = episodes.findIndex((episode) => clean(episode.id) === activeId);
  if (index < 0) {
    return episodes.slice(0, before + after + 1);
  }
  const start = Math.max(0, index - before);
  const end = Math.min(episodes.length, index + after + 1);
  return episodes.slice(start, end);
}

/**
 * Load one bounded page of same-show episodes (metadata only).
 * Does not paginate the entire show. Dedupes concurrent requests per showId.
 */
export async function loadPodcastShowEpisodeQueue(
  showId: string,
  options?: {
    signal?: AbortSignal;
    showTitle?: string | null;
    limit?: number;
    /** When true, resolve show title via show endpoint if missing. Default false for tap path. */
    resolveShowTitle?: boolean;
  }
): Promise<ShowEpisodeCacheEntry> {
  const id = clean(showId);
  if (!id) {
    return {
      showId: "",
      showTitle: clean(options?.showTitle) || "Podcast",
      episodes: [],
      total: 0,
      fetchedAt: Date.now(),
      pagesFetched: 0,
    };
  }

  const cached = getCachedPodcastShowEpisodes(id);
  if (cached) {
    podcastPerfLog("[PODCAST_QUEUE_BUILD]", {
      source: "cache_hit",
      showId: id,
      episodeCount: cached.episodes.length,
      pagesFetched: cached.pagesFetched,
      cacheEntries: showEpisodeCache.size,
    });
    return cached;
  }

  const inflight = showEpisodeInflight.get(id);
  if (inflight) {
    podcastPerfLog("[PODCAST_QUEUE_BUILD]", {
      source: "inflight_join",
      showId: id,
    });
    return inflight;
  }

  const limit = Math.min(
    PODCAST_SHOW_QUEUE_INITIAL_LIMIT,
    Math.max(1, Number(options?.limit || PODCAST_SHOW_QUEUE_INITIAL_LIMIT))
  );

  const promise = (async (): Promise<ShowEpisodeCacheEntry> => {
    let showTitle = clean(options?.showTitle);
    const shouldResolveTitle = Boolean(options?.resolveShowTitle) && !showTitle;

    if (shouldResolveTitle) {
      podcastPerfLog("[PODCAST_FETCH]", {
        kind: "show_by_id",
        showId: id,
      });
      const showResponse = await fetchPodcastShowById(id);
      showTitle = clean(showResponse.show?.title) || "Podcast";
    }
    if (!showTitle) showTitle = "Podcast";

    if (options?.signal?.aborted) {
      return {
        showId: id,
        showTitle,
        episodes: [],
        total: 0,
        fetchedAt: Date.now(),
        pagesFetched: 0,
      };
    }

    const pageLimit = Math.min(PODCAST_CATALOG_PAGE_LIMIT, limit);
    podcastPerfLog("[PODCAST_FETCH]", {
      kind: "episodes_by_show",
      showId: id,
      page: 1,
      limit: pageLimit,
    });
    const response = await fetchPodcastEpisodesByShow(id, 1, pageLimit);

    const collected: PodcastEpisode[] = [];
    if (response.success) {
      for (const entry of response.episodes) {
        if (clean(entry.showId) && clean(entry.showId) !== id) continue;
        collected.push(metadataToShowEpisode({ ...entry, showId: id }, showTitle));
        if (collected.length >= limit) break;
      }
    }

    const entry: ShowEpisodeCacheEntry = {
      showId: id,
      showTitle,
      episodes: sortShowEpisodesNewestFirst(collected),
      total: response.pagination?.total || collected.length,
      fetchedAt: Date.now(),
      pagesFetched: 1,
    };
    showEpisodeCache.set(id, entry);
    evictCacheIfNeeded();

    podcastPerfLog("[PODCAST_QUEUE_BUILD]", {
      source: "network",
      showId: id,
      episodeCount: entry.episodes.length,
      total: entry.total,
      pagesFetched: 1,
      cacheEntries: showEpisodeCache.size,
    });

    return entry;
  })().finally(() => {
    showEpisodeInflight.delete(id);
  });

  showEpisodeInflight.set(id, promise);
  return promise;
}

/**
 * Merge active playable episode into show metadata queue (preserve API order).
 */
export function mergeActiveEpisodeIntoShowQueue(
  showEpisodes: PodcastEpisode[],
  active: PodcastEpisode
): PodcastEpisode[] {
  const activeId = clean(active.id);
  if (!activeId) return showEpisodes;

  const next = showEpisodes.map((episode) =>
    clean(episode.id) === activeId
      ? {
          ...episode,
          ...active,
          showId: clean(active.showId) || episode.showId,
          showTitle: clean(active.showTitle) || episode.showTitle,
          audioUrl: clean(active.audioUrl) || episode.audioUrl,
        }
      : episode
  );

  if (!next.some((episode) => clean(episode.id) === activeId)) {
    next.unshift(active);
  }

  return sortShowEpisodesNewestFirst(next);
}
