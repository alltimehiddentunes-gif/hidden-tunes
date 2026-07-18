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
import {
  loadPodcastShowEpisodeQueue,
  mergeActiveEpisodeIntoShowQueue,
} from "./podcastShowQueue";

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
 * Deterministic Podcast queue: same-show episodes only (API / publishedAt order).
 * Never mixes Music / other domains. Related-show continuation is intentionally deferred.
 */
export function buildPodcastPlaybackQueue(
  episodes: PodcastEpisode[],
  selectedEpisodeId?: string,
  _options?: { categoryEpisodes?: PodcastEpisode[] }
): PodcastPlaybackQueue {
  const showOrdered = orderPodcastEpisodesForQueue(episodes).slice(
    0,
    PODCAST_PLAYBACK_QUEUE_LIMIT
  );
  const selectedId = String(selectedEpisodeId || "").trim();
  const showId = String(showOrdered[0]?.showId || "").trim();

  // Keep only the active show — ignore category bleed.
  const sameShow = showOrdered.filter(
    (episode) => !showId || String(episode.showId || "").trim() === showId
  );

  let startIndex = Math.max(
    0,
    sameShow.findIndex((episode) => episode.id === selectedId)
  );
  if (startIndex < 0) startIndex = 0;

  const active = sameShow[startIndex];
  if (active && !isPlayablePodcastAudioUrl(String(active.audioUrl || ""))) {
    const playableIndex = sameShow.findIndex((episode) =>
      isPlayablePodcastAudioUrl(String(episode.audioUrl || ""))
    );
    if (playableIndex >= 0 && selectedId && sameShow[playableIndex].id === selectedId) {
      startIndex = playableIndex;
    }
  }

  return {
    episodes: sameShow,
    songs: sameShow.map(podcastEpisodeToAppSong),
    startIndex,
    continuationSource: "show",
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
  categoryEpisodes: _categoryEpisodes,
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

  let activeEpisode = episode;
  const showId = String(activeEpisode.showId || "").trim();

  podcastTrace("TAP", {
    selectedEpisodeId: activeEpisode.id,
    showId: showId || null,
    feedId: feedId || null,
    creatorId: creatorId || activeEpisode.publisher || null,
    categoryId: categoryId || activeEpisode.categories?.[0] || null,
    providedLength: episodes.length,
  });

  resetPodcastSkipFailures();

  let showEpisodes = (episodes || []).filter(
    (entry) => !showId || String(entry.showId || "").trim() === showId
  );

  if (showId) {
    try {
      const loaded = await loadPodcastShowEpisodeQueue(showId, {
        showTitle: activeEpisode.showTitle,
      });
      if (loaded.episodes.length) {
        if (
          loaded.showTitle &&
          (!activeEpisode.showTitle ||
            activeEpisode.showTitle === categoryId ||
            activeEpisode.showTitle.toLowerCase() === "podcasts")
        ) {
          activeEpisode = {
            ...activeEpisode,
            showTitle: loaded.showTitle,
          };
        }
        showEpisodes = mergeActiveEpisodeIntoShowQueue(
          loaded.episodes,
          activeEpisode
        );
      }
    } catch (error) {
      if (__DEV__) {
        console.warn("[podcast] same-show episode load failed", {
          showId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } else if (__DEV__) {
    console.warn("[podcast] orphan episode has no showId", {
      episodeId: activeEpisode.id,
    });
  }

  if (!showEpisodes.length) {
    showEpisodes = [activeEpisode];
  } else {
    showEpisodes = mergeActiveEpisodeIntoShowQueue(showEpisodes, activeEpisode);
  }

  const built = buildPodcastPlaybackQueue(showEpisodes, activeEpisode.id);
  // Ensure the tapped episode (with resolved URL) wins over a metadata twin.
  const songs = built.songs.map((song) =>
    song.id === podcastEpisodeToAppSong(activeEpisode).id
      ? podcastEpisodeToAppSong(activeEpisode)
      : song
  );
  let safeIndex =
    typeof startIndex === "number" && startIndex >= 0
      ? Math.max(0, Math.min(startIndex, songs.length - 1))
      : built.startIndex;
  const selectedSongId = podcastEpisodeToAppSong(activeEpisode).id;
  const byId = songs.findIndex((song) => song.id === selectedSongId);
  if (byId >= 0) safeIndex = byId;

  podcastTrace("QUEUE_PROVIDED", {
    selectedEpisodeId: activeEpisode.id,
    showId: activeEpisode.showId,
    feedId: feedId || null,
    creatorId: creatorId || activeEpisode.publisher || null,
    categoryId: categoryId || activeEpisode.categories?.[0] || null,
    providedLength: episodes.length,
    finalLength: songs.length,
    activeIndex: safeIndex,
    continuationSource: built.continuationSource,
    expanded: false,
  });

  if (!songs.length) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      reason: "empty_queue",
      episodeId: activeEpisode.id,
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }

  const queueContext = buildPodcastQueueContext({
    showId: activeEpisode.showId,
    showTitle: activeEpisode.showTitle,
    feedId,
    creatorId: creatorId || activeEpisode.publisher,
    categoryId: categoryId || activeEpisode.categories?.[0],
    label: activeEpisode.showTitle || "Podcasts",
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
    const solo = assertPodcastQueueIntegrity(
      [podcastEpisodeToAppSong(activeEpisode)],
      queueContext
    );
    podcastQueueLog("accepted", {
      providedLength: episodes.length,
      finalLength: solo.length,
      activeIndex: 0,
      showId: activeEpisode.showId,
      feedId: feedId || null,
      expanded: false,
      foreignItemCount: 0,
      continuationSource: "selected_only_fallback",
    });
    await playSong(solo[0], solo, 0, queueContext, "standard");
    return { ok: true as const, episode: activeEpisode };
  }

  podcastTrace("QUEUE_BUILT", {
    selectedEpisodeId: activeEpisode.id,
    showId: activeEpisode.showId,
    feedId: feedId || null,
    creatorId: creatorId || activeEpisode.publisher || null,
    categoryId: categoryId || activeEpisode.categories?.[0] || null,
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
    showId: activeEpisode.showId,
    feedId: feedId || null,
    expanded: false,
    foreignItemCount: 0,
  });

  logPodcastDiagnostic("podcast_auto_next_queue_created", {
    episodeId: activeEpisode.id,
    queueSize: domainSongs.length,
    startIndex: finalIndex,
  });
  logPodcastDiagnostic("podcast_episode_play_start", {
    episodeId: activeEpisode.id,
  });

  try {
    // Single public playback entry: playSong only (PlayerContext may delegate to playQueue).
    await playSong(activeSong, domainSongs, finalIndex, queueContext, "standard");
    logPodcastDiagnostic("podcast_episode_play_success", {
      episodeId: activeEpisode.id,
    });
    return {
      ok: true as const,
      episode: built.episodes[finalIndex] || activeEpisode,
    };
  } catch (error) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      episodeId: activeEpisode.id,
      message: String((error as Error)?.message || error),
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }
}
