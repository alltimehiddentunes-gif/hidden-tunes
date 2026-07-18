import type { AppSong } from "../context/PlayerContext";
import type { PodcastEpisode } from "../types/podcast";
import { logPodcastDiagnostic } from "./podcastDiagnostics";
import {
  assertPodcastQueueIntegrity,
  buildPodcastQueueContext,
  isPlayablePodcastAudioUrl,
  orderPodcastEpisodesForQueue,
  PODCAST_MAX_AUTO_NEXT_FAILURES,
  PODCAST_PLAYBACK_QUEUE_LIMIT,
  podcastEpisodeToAppSong,
  podcastQueueLog,
  podcastTrace,
} from "./podcastPlaybackAdapter";

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: ReturnType<typeof buildPodcastQueueContext>,
  queueMode?: "standard"
) => Promise<void>;

export type PodcastPlaybackQueue = {
  episodes: PodcastEpisode[];
  songs: AppSong[];
  startIndex: number;
  continuationSource: string;
};

/**
 * Deterministic Podcast queue:
 * selected show episodes (API order) first. Optional same-category block only after.
 * Never mixes Music / other domains.
 */
export function buildPodcastPlaybackQueue(
  episodes: PodcastEpisode[],
  selectedEpisodeId?: string,
  options?: { categoryEpisodes?: PodcastEpisode[] }
): PodcastPlaybackQueue {
  const showOrdered = orderPodcastEpisodesForQueue(episodes).slice(
    0,
    PODCAST_PLAYBACK_QUEUE_LIMIT
  );
  const selectedId = String(selectedEpisodeId || "").trim();
  const showId = String(showOrdered[0]?.showId || "").trim();

  const seen = new Set(showOrdered.map((episode) => episode.id));
  const sources = ["show"];
  let merged = [...showOrdered];

  const categoryEpisodes = orderPodcastEpisodesForQueue(options?.categoryEpisodes || []);
  for (const episode of categoryEpisodes) {
    if (merged.length >= PODCAST_PLAYBACK_QUEUE_LIMIT) break;
    const id = String(episode.id || "").trim();
    if (!id || seen.has(id)) continue;
    // Same-show already covered; category continuation is other shows only after show block.
    if (showId && String(episode.showId || "").trim() === showId) continue;
    seen.add(id);
    merged.push(episode);
    if (!sources.includes("category")) sources.push("category");
  }

  merged = merged.slice(0, PODCAST_PLAYBACK_QUEUE_LIMIT);

  let startIndex = Math.max(
    0,
    merged.findIndex((episode) => episode.id === selectedId)
  );
  if (startIndex < 0) startIndex = 0;

  // Active episode must be playable; keep metadata siblings for resolve-on-demand.
  const active = merged[startIndex];
  if (active && !isPlayablePodcastAudioUrl(String(active.audioUrl || ""))) {
    const playableIndex = merged.findIndex((episode) =>
      isPlayablePodcastAudioUrl(String(episode.audioUrl || ""))
    );
    if (playableIndex >= 0 && selectedId && merged[playableIndex].id === selectedId) {
      startIndex = playableIndex;
    }
  }

  return {
    episodes: merged,
    songs: merged.map(podcastEpisodeToAppSong),
    startIndex,
    continuationSource: sources.join(">"),
  };
}

type PlayPodcastEpisodeFromShowArgs = {
  episode: PodcastEpisode;
  episodes: PodcastEpisode[];
  startIndex?: number;
  playSong: PlaySongFn;
  categoryEpisodes?: PodcastEpisode[];
  feedId?: string | null;
  creatorId?: string | null;
  categoryId?: string | null;
};

let podcastSkipFailures = 0;
let podcastSkipGeneration = 0;

export function resetPodcastSkipFailures() {
  podcastSkipFailures = 0;
  podcastSkipGeneration += 1;
}

export function getPodcastSkipFailures() {
  return podcastSkipFailures;
}

export function bumpPodcastSkipFailure() {
  podcastSkipFailures += 1;
  return podcastSkipFailures;
}

export function canPodcastSkipInvalidNext() {
  return podcastSkipFailures < PODCAST_MAX_AUTO_NEXT_FAILURES;
}

export async function playPodcastEpisodeFromShow({
  episode,
  episodes,
  startIndex,
  playSong,
  categoryEpisodes,
  feedId,
  creatorId,
  categoryId,
}: PlayPodcastEpisodeFromShowArgs) {
  const audioUrl = String(episode.audioUrl || "").trim();
  if (!audioUrl || !isPlayablePodcastAudioUrl(audioUrl)) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      reason: "missing_audio",
      episodeId: episode.id,
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }

  podcastTrace("TAP", {
    selectedEpisodeId: episode.id,
    showId: episode.showId,
    feedId: feedId || null,
    creatorId: creatorId || episode.publisher || null,
    categoryId: categoryId || episode.categories?.[0] || null,
    providedLength: episodes.length,
  });

  resetPodcastSkipFailures();

  const built = buildPodcastPlaybackQueue(episodes, episode.id, { categoryEpisodes });
  // Ensure the tapped episode (with resolved URL) wins over a metadata twin.
  const songs = built.songs.map((song) =>
    song.id === podcastEpisodeToAppSong(episode).id ? podcastEpisodeToAppSong(episode) : song
  );
  let safeIndex =
    typeof startIndex === "number" && startIndex >= 0
      ? Math.max(0, Math.min(startIndex, songs.length - 1))
      : built.startIndex;
  const selectedSongId = podcastEpisodeToAppSong(episode).id;
  const byId = songs.findIndex((song) => song.id === selectedSongId);
  if (byId >= 0) safeIndex = byId;

  podcastTrace("QUEUE_PROVIDED", {
    selectedEpisodeId: episode.id,
    showId: episode.showId,
    feedId: feedId || null,
    creatorId: creatorId || episode.publisher || null,
    categoryId: categoryId || episode.categories?.[0] || null,
    providedLength: episodes.length,
    finalLength: songs.length,
    activeIndex: safeIndex,
    continuationSource: built.continuationSource,
    expanded: false,
  });

  if (!songs.length) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      reason: "empty_queue",
      episodeId: episode.id,
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }

  const queueContext = buildPodcastQueueContext({
    showId: episode.showId,
    showTitle: episode.showTitle,
    feedId,
    creatorId: creatorId || episode.publisher,
    categoryId: categoryId || episode.categories?.[0],
    label: episode.showTitle || "Podcasts",
  });

  const domainSongs = assertPodcastQueueIntegrity(songs, queueContext);
  const activeIndex = Math.max(
    0,
    domainSongs.findIndex((song) => song.id === selectedSongId)
  );
  const finalIndex = activeIndex >= 0 ? activeIndex : Math.min(safeIndex, domainSongs.length - 1);
  const activeSong = domainSongs[finalIndex];

  if (!activeSong || activeSong.id !== selectedSongId) {
    // Fallback: selected episode only — never Music discovery.
    const solo = assertPodcastQueueIntegrity([podcastEpisodeToAppSong(episode)], queueContext);
    podcastQueueLog("accepted", {
      providedLength: episodes.length,
      finalLength: solo.length,
      activeIndex: 0,
      showId: episode.showId,
      feedId: feedId || null,
      expanded: false,
      foreignItemCount: 0,
      continuationSource: "selected_only_fallback",
    });
    await playSong(solo[0], solo, 0, queueContext, "standard");
    return { ok: true as const, episode };
  }

  podcastTrace("QUEUE_BUILT", {
    selectedEpisodeId: episode.id,
    showId: episode.showId,
    feedId: feedId || null,
    creatorId: creatorId || episode.publisher || null,
    categoryId: categoryId || episode.categories?.[0] || null,
    providedLength: episodes.length,
    finalLength: domainSongs.length,
    activeIndex: finalIndex,
    expanded: false,
    foreignItemCount: 0,
    continuationSource: built.continuationSource,
  });

  podcastQueueLog("accepted", {
    providedLength: episodes.length,
    finalLength: domainSongs.length,
    activeIndex: finalIndex,
    showId: episode.showId,
    feedId: feedId || null,
    expanded: false,
    foreignItemCount: 0,
  });

  logPodcastDiagnostic("podcast_auto_next_queue_created", {
    episodeId: episode.id,
    queueSize: domainSongs.length,
    startIndex: finalIndex,
  });
  logPodcastDiagnostic("podcast_episode_play_start", { episodeId: episode.id });

  try {
    // Single public playback entry: playSong only (PlayerContext may delegate to playQueue).
    await playSong(activeSong, domainSongs, finalIndex, queueContext, "standard");
    logPodcastDiagnostic("podcast_episode_play_success", { episodeId: episode.id });
    return {
      ok: true as const,
      episode: built.episodes[finalIndex] || episode,
    };
  } catch (error) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      episodeId: episode.id,
      message: String((error as Error)?.message || error),
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }
}
