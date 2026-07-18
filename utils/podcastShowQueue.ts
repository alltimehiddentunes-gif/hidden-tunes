/**
 * Same-show podcast episode queue loader.
 * Presentation/session helper only — does not change PlayerContext architecture.
 */
import {
  fetchPodcastEpisodesByShow,
  fetchPodcastShowById,
  PODCAST_CATALOG_PAGE_LIMIT,
  type PodcastCatalogEpisodeMetadata,
} from "@/services/podcastCatalogApi";
import type { PodcastEpisode } from "@/types/podcast";
import { PODCAST_PLAYBACK_QUEUE_LIMIT } from "@/utils/podcastPlaybackAdapter";

type ShowEpisodeCacheEntry = {
  showId: string;
  showTitle: string;
  episodes: PodcastEpisode[];
  total: number;
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const showEpisodeCache = new Map<string, ShowEpisodeCacheEntry>();
const showEpisodeInflight = new Map<string, Promise<ShowEpisodeCacheEntry>>();

function clean(value: unknown) {
  return String(value || "").trim();
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

export function getCachedPodcastShowEpisodes(showId: string) {
  const id = clean(showId);
  if (!id) return null;
  const cached = showEpisodeCache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
  return cached;
}

/**
 * Load paginated episodes for one showId only.
 * Newest published first (API order). Caps at PODCAST_PLAYBACK_QUEUE_LIMIT.
 */
export async function loadPodcastShowEpisodeQueue(
  showId: string,
  options?: { signal?: AbortSignal; showTitle?: string | null; limit?: number }
): Promise<ShowEpisodeCacheEntry> {
  const id = clean(showId);
  if (!id) {
    return {
      showId: "",
      showTitle: clean(options?.showTitle) || "Podcast",
      episodes: [],
      total: 0,
      fetchedAt: Date.now(),
    };
  }

  const cached = getCachedPodcastShowEpisodes(id);
  if (cached) return cached;

  const inflight = showEpisodeInflight.get(id);
  if (inflight) return inflight;

  const limit = Math.min(
    PODCAST_PLAYBACK_QUEUE_LIMIT,
    Math.max(1, Number(options?.limit || PODCAST_PLAYBACK_QUEUE_LIMIT))
  );

  const promise = (async (): Promise<ShowEpisodeCacheEntry> => {
    let showTitle = clean(options?.showTitle);
    if (!showTitle) {
      const showResponse = await fetchPodcastShowById(id);
      showTitle = clean(showResponse.show?.title) || "Podcast";
    }

    const collected: PodcastEpisode[] = [];
    let page = 1;
    let total = 0;
    let hasMore = true;

    while (hasMore && collected.length < limit) {
      if (options?.signal?.aborted) break;
      const pageLimit = Math.min(PODCAST_CATALOG_PAGE_LIMIT, limit - collected.length);
      const response = await fetchPodcastEpisodesByShow(id, page, pageLimit);
      if (!response.success) break;

      total = response.pagination.total || total;
      for (const entry of response.episodes) {
        if (clean(entry.showId) && clean(entry.showId) !== id) continue;
        collected.push(
          metadataToShowEpisode(
            { ...entry, showId: id },
            showTitle
          )
        );
        if (collected.length >= limit) break;
      }

      hasMore = Boolean(response.pagination.hasMore) && response.episodes.length > 0;
      page += 1;
      if (page > 20) break;
    }

    const entry: ShowEpisodeCacheEntry = {
      showId: id,
      showTitle,
      episodes: sortShowEpisodesNewestFirst(collected),
      total: total || collected.length,
      fetchedAt: Date.now(),
    };
    showEpisodeCache.set(id, entry);
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
