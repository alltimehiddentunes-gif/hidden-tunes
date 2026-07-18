import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";
import type { PodcastEpisode } from "../types/podcast";

const SUPPORTED_AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg)(\?|$)/i;
const PODCAST_AUDIO_HOST =
  /megaphone\.fm|simplecast\.com|podtrac\.com|blubrry\.com|acast\.com|libsyn\.com|spreaker\.com|anchor\.fm|buzzsprout\.com|omnycontent\.com|art19\.com|bbci\.co\.uk/i;

export const PODCAST_EPISODE_SONG_PREFIX = "podcast-";
export const PODCAST_QUEUE_TYPE = "podcast";
export const PODCAST_SHOW_CONTEXT_TYPE = "podcast-show";
export const PODCAST_MAX_AUTO_NEXT_FAILURES = 5;
export const PODCAST_PLAYBACK_QUEUE_LIMIT = 48;

type PodcastTracePayload = Record<string, string | number | boolean | null | undefined>;

export function podcastTrace(event: string, payload: PodcastTracePayload = {}) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[PODCAST_TRACE] ${event}`, {
    at: Date.now(),
    ...payload,
  });
}

export function podcastQueueLog(
  event: "accepted" | "rejected_foreign_items",
  payload: PodcastTracePayload = {}
) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[PODCAST_QUEUE] ${event}`, {
    at: Date.now(),
    ...payload,
  });
}

export function isPlayablePodcastAudioUrl(url: string) {
  const clean = String(url || "").trim();
  if (!clean.startsWith("https://") && !clean.startsWith("http://")) return false;
  if (SUPPORTED_AUDIO_EXTENSIONS.test(clean)) return true;
  if (PODCAST_AUDIO_HOST.test(clean)) return true;
  return clean.includes("/audio") || clean.includes("media") || clean.includes("podcast");
}

export function podcastEpisodeSongId(episodeId: string) {
  return `${PODCAST_EPISODE_SONG_PREFIX}${episodeId}`;
}

export function parsePodcastEpisodeSongId(songId?: string | null) {
  const clean = String(songId || "");
  if (!clean.startsWith(PODCAST_EPISODE_SONG_PREFIX)) return null;
  return clean.slice(PODCAST_EPISODE_SONG_PREFIX.length) || null;
}

export function isPodcastAppSong(song?: AppSong | null) {
  return Boolean(parsePodcastEpisodeSongId(song?.id));
}

function podcastArtist(episode: PodcastEpisode) {
  return episode.showTitle || episode.publisher || "Podcast";
}

/** Metadata or playable Podcast episode → AppSong. Empty URL allowed for resolve-on-demand. */
export function podcastEpisodeToAppSong(episode: PodcastEpisode): AppSong {
  const artist = podcastArtist(episode);
  const audioUrl = String(episode.audioUrl || "").trim();
  const showId = String(episode.showId || "").trim();
  const categoryId = Array.isArray(episode.categories) ? episode.categories[0] : undefined;

  return {
    id: podcastEpisodeSongId(episode.id),
    title: episode.title || "Untitled Episode",
    artist,
    album: episode.showTitle || artist,
    albumId: showId || undefined,
    user: { name: artist },
    channelTitle: artist,
    artworkUrl: episode.artworkUrl,
    coverUrl: episode.artworkUrl,
    thumbnail: episode.artworkUrl,
    artwork: episode.artworkUrl,
    streamUrl: audioUrl,
    url: audioUrl,
    audioUrl,
    duration: episode.durationSeconds,
    genre: categoryId || "Podcast",
    mood: episode.emotionalWorld,
    source: "hidden-tunes",
    sourceName: "Podcast",
    type: "r2",
    isOnline: true,
  };
}

export type PodcastQueueContext = PlaybackQueueContext & {
  queueType?: typeof PODCAST_QUEUE_TYPE;
  contextType?: string;
  contextId?: string;
  contextTitle?: string;
};

export function buildPodcastQueueContext(input: {
  showId?: string | null;
  showTitle?: string | null;
  feedId?: string | null;
  creatorId?: string | null;
  categoryId?: string | null;
  label?: string | null;
}): PodcastQueueContext {
  const showId = String(input.showId || "").trim();
  const showTitle = String(input.showTitle || "").trim();
  const feedId = String(input.feedId || "").trim();
  const creatorId = String(input.creatorId || "").trim();
  const categoryId = String(input.categoryId || "").trim();

  return {
    // Keep source bounded; PlayerContext historically maps source "podcast" → "unknown".
    // Domain identity is carried by queueType / contextType / albumId markers.
    source: "unknown",
    label: input.label || showTitle || "Podcasts",
    albumId: showId || undefined,
    albumTitle: showTitle || undefined,
    artistId: creatorId || undefined,
    artistName: creatorId || showTitle || undefined,
    genre: categoryId || undefined,
    railId: feedId || undefined,
    queueType: PODCAST_QUEUE_TYPE,
    contextType: PODCAST_SHOW_CONTEXT_TYPE,
    contextId: showId || undefined,
    contextTitle: showTitle || undefined,
  };
}

export function isPodcastQueueContext(
  context?: PlaybackQueueContext | null
): context is PodcastQueueContext {
  if (!context) return false;
  if ((context as PodcastQueueContext).queueType === PODCAST_QUEUE_TYPE) return true;
  if ((context as PodcastQueueContext).contextType === PODCAST_SHOW_CONTEXT_TYPE) return true;
  if (String(context.label || "").toLowerCase() === "podcasts") return true;
  return false;
}

export function filterPodcastDomainSongs(queue: AppSong[]): AppSong[] {
  const seen = new Set<string>();
  const next: AppSong[] = [];
  for (const song of queue) {
    if (!isPodcastAppSong(song)) continue;
    const id = String(song.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(song);
  }
  return next;
}

export function assertPodcastQueueIntegrity(
  queue: AppSong[],
  context?: PlaybackQueueContext | null
): AppSong[] {
  const domainOnly = filterPodcastDomainSongs(queue);
  const foreignCount = Math.max(0, queue.length - domainOnly.length);
  if (foreignCount > 0) {
    podcastQueueLog("rejected_foreign_items", {
      foreignItemCount: foreignCount,
      providedLength: queue.length,
      finalLength: domainOnly.length,
      showId: context?.albumId || (context as PodcastQueueContext)?.contextId || null,
      queueType: (context as PodcastQueueContext)?.queueType || null,
    });
  }
  return domainOnly;
}

/**
 * Preserve API/show order. Do not sort by title.
 * Keep metadata-only siblings for resolve-on-demand Next.
 */
export function orderPodcastEpisodesForQueue(episodes: PodcastEpisode[]): PodcastEpisode[] {
  const seen = new Set<string>();
  const next: PodcastEpisode[] = [];
  for (const episode of episodes) {
    const id = String(episode?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(episode);
  }
  return next;
}

export function podcastSongNeedsResolve(song?: AppSong | null) {
  if (!isPodcastAppSong(song)) return false;
  return !String(song?.streamUrl || song?.url || song?.audioUrl || "").trim();
}
