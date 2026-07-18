import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";
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
  slicePodcastEpisodeWindow,
} from "./podcastShowQueue";

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: ReturnType<typeof buildPodcastQueueContext>,
  queueMode?: "standard"
) => Promise<void>;

type EnrichActiveQueueFn = (
  expectedSongId: string,
  queue: AppSong[],
  index: number,
  queueContext?: PlaybackQueueContext,
  queueMode?: "standard"
) => Promise<void>;

export type PodcastPlaybackQueue = {
  episodes: PodcastEpisode[];
  songs: AppSong[];
  startIndex: number;
  continuationSource: string;
};

function podcastPerfLog(tag: string, payload: Record<string, unknown>) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(tag, { at: Date.now(), ...payload });
}

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
  /** Optional: merge enriched queue without restarting playback / navigation. */
  enrichActiveQueue?: EnrichActiveQueueFn;
  categoryEpisodes?: PodcastEpisode[];
  feedId?: string | null;
  creatorId?: string | null;
  categoryId?: string | null;
};

let podcastSkipFailures = 0;
let podcastSkipGeneration = 0;

/** In-flight tap guard keyed by episode id (not a long global lock). */
const playInFlightByEpisodeId = new Map<string, number>();

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

async function startPlaybackWithEpisodes(args: {
  activeEpisode: PodcastEpisode;
  showEpisodes: PodcastEpisode[];
  startIndex?: number;
  playSong: PlaySongFn;
  feedId?: string | null;
  creatorId?: string | null;
  categoryId?: string | null;
  providedLength: number;
}) {
  const {
    activeEpisode,
    showEpisodes,
    startIndex,
    playSong,
    feedId,
    creatorId,
    categoryId,
    providedLength,
  } = args;

  let episodesForQueue = showEpisodes.length
    ? mergeActiveEpisodeIntoShowQueue(showEpisodes, activeEpisode)
    : [activeEpisode];

  const { built, songs, safeIndex } = (() => {
    const builtQueue = buildPodcastPlaybackQueue(episodesForQueue, activeEpisode.id);
    const activeSong = podcastEpisodeToAppSong(activeEpisode);
    const mapped = builtQueue.songs.map((song) =>
      song.id === activeSong.id ? activeSong : song
    );
    let index =
      typeof startIndex === "number" && startIndex >= 0
        ? Math.max(0, Math.min(startIndex, mapped.length - 1))
        : builtQueue.startIndex;
    const byId = mapped.findIndex((song) => song.id === activeSong.id);
    if (byId >= 0) index = byId;
    return { built: builtQueue, songs: mapped, safeIndex: index };
  })();

  const queueContext = buildPodcastQueueContext({
    showId: activeEpisode.showId,
    showTitle: activeEpisode.showTitle,
    feedId,
    creatorId: creatorId || activeEpisode.publisher,
    categoryId: categoryId || activeEpisode.categories?.[0],
    label: activeEpisode.showTitle || "Podcasts",
  });

  const selectedSongId = podcastEpisodeToAppSong(activeEpisode).id;
  const domainSongs = assertPodcastQueueIntegrity(songs, queueContext);
  const activeIndex = Math.max(
    0,
    domainSongs.findIndex((song) => song.id === selectedSongId)
  );
  const finalIndex = activeIndex >= 0 ? activeIndex : Math.min(safeIndex, domainSongs.length - 1);
  const activeSong = domainSongs[finalIndex];

  if (!activeSong || activeSong.id !== selectedSongId) {
    const solo = assertPodcastQueueIntegrity(
      [podcastEpisodeToAppSong(activeEpisode)],
      queueContext
    );
    podcastQueueLog("accepted", {
      providedLength,
      finalLength: solo.length,
      activeIndex: 0,
      showId: activeEpisode.showId,
      feedId: feedId || null,
      expanded: false,
      foreignItemCount: 0,
      continuationSource: "selected_only_fallback",
    });
    await playSong(solo[0], solo, 0, queueContext, "standard");
    return {
      ok: true as const,
      episode: activeEpisode,
      selectedSongId,
      queueContext,
    };
  }

  podcastTrace("QUEUE_BUILT", {
    selectedEpisodeId: activeEpisode.id,
    showId: activeEpisode.showId,
    feedId: feedId || null,
    creatorId: creatorId || activeEpisode.publisher || null,
    categoryId: categoryId || activeEpisode.categories?.[0] || null,
    providedLength,
    finalLength: domainSongs.length,
    activeIndex: finalIndex,
    expanded: false,
    foreignItemCount: 0,
    continuationSource: built.continuationSource,
  });

  podcastQueueLog("accepted", {
    providedLength,
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

  await playSong(activeSong, domainSongs, finalIndex, queueContext, "standard");
  logPodcastDiagnostic("podcast_episode_play_success", {
    episodeId: activeEpisode.id,
  });

  return {
    ok: true as const,
    episode: built.episodes[finalIndex] || activeEpisode,
    selectedSongId,
    queueContext,
  };
}

function hydrateSameShowQueueInBackground(args: {
  activeEpisode: PodcastEpisode;
  seedEpisodes: PodcastEpisode[];
  selectedSongId: string;
  enrichActiveQueue?: EnrichActiveQueueFn;
  feedId?: string | null;
  creatorId?: string | null;
  categoryId?: string | null;
}) {
  const {
    activeEpisode,
    seedEpisodes,
    selectedSongId,
    enrichActiveQueue,
    feedId,
    creatorId,
    categoryId,
  } = args;
  const showId = String(activeEpisode.showId || "").trim();
  if (!showId || !enrichActiveQueue) return;

  const seedCount = seedEpisodes.length;
  const titleLooksPlaceholder =
    !cleanTitle(activeEpisode.showTitle) ||
    cleanTitle(activeEpisode.showTitle).toLowerCase() === "podcasts" ||
    cleanTitle(activeEpisode.showTitle) === cleanTitle(categoryId);

  // Skip network when the tap already supplied a solid same-show window
  // and the show title is already real (typical show-page path).
  if (seedCount >= 8 && !titleLooksPlaceholder) {
    podcastPerfLog("[PODCAST_QUEUE_BUILD]", {
      phase: "background_skipped_seed_sufficient",
      showId,
      seedCount,
    });
    return;
  }

  const startedAt = Date.now();
  void (async () => {
    try {
      podcastPerfLog("[PODCAST_QUEUE_BUILD]", {
        phase: "background_start",
        showId,
        episodeId: activeEpisode.id,
        seedCount,
      });

      const loaded = await loadPodcastShowEpisodeQueue(showId, {
        showTitle: titleLooksPlaceholder ? null : activeEpisode.showTitle,
        resolveShowTitle: titleLooksPlaceholder,
      });

      const byId = new Map<string, PodcastEpisode>();
      for (const entry of [...seedEpisodes, ...loaded.episodes]) {
        const id = String(entry.id || "").trim();
        if (!id) continue;
        const prev = byId.get(id);
        byId.set(id, prev ? { ...prev, ...entry, audioUrl: entry.audioUrl || prev.audioUrl } : entry);
      }

      let merged = mergeActiveEpisodeIntoShowQueue(
        Array.from(byId.values()),
        {
          ...activeEpisode,
          showTitle: loaded.showTitle || activeEpisode.showTitle,
        }
      );

      // Cap only when the union grows large — never shrink a healthy seed below itself.
      if (merged.length > PODCAST_PLAYBACK_QUEUE_LIMIT) {
        merged = slicePodcastEpisodeWindow(
          merged,
          activeEpisode.id,
          Math.floor(PODCAST_PLAYBACK_QUEUE_LIMIT / 2),
          Math.floor(PODCAST_PLAYBACK_QUEUE_LIMIT / 2)
        );
      }

      const built = buildPodcastPlaybackQueue(merged, activeEpisode.id);
      const activeSong = podcastEpisodeToAppSong({
        ...activeEpisode,
        showTitle: loaded.showTitle || activeEpisode.showTitle,
      });
      const songs = built.songs.map((song) =>
        song.id === activeSong.id
          ? {
              ...song,
              ...activeSong,
              streamUrl: activeSong.streamUrl || song.streamUrl,
              url: activeSong.url || song.url,
              audioUrl: activeSong.audioUrl || song.audioUrl,
            }
          : song
      );

      const queueContext = buildPodcastQueueContext({
        showId: activeEpisode.showId,
        showTitle: loaded.showTitle || activeEpisode.showTitle,
        feedId,
        creatorId: creatorId || activeEpisode.publisher,
        categoryId: categoryId || activeEpisode.categories?.[0],
        label: loaded.showTitle || activeEpisode.showTitle || "Podcasts",
      });

      const domainSongs = assertPodcastQueueIntegrity(songs, queueContext);
      const index = Math.max(
        0,
        domainSongs.findIndex((song) => song.id === selectedSongId)
      );
      if (!domainSongs.length || index < 0) return;

      // Do not replace a larger in-memory seed with a smaller network page.
      if (domainSongs.length < seedCount && !titleLooksPlaceholder) {
        podcastPerfLog("[PODCAST_QUEUE_BUILD]", {
          phase: "background_skipped_would_shrink",
          showId,
          seedCount,
          networkCount: domainSongs.length,
        });
        return;
      }

      await enrichActiveQueue(
        selectedSongId,
        domainSongs,
        index,
        queueContext,
        "standard"
      );

      podcastPerfLog("[PODCAST_QUEUE_BUILD]", {
        phase: "background_merged",
        showId,
        episodeId: activeEpisode.id,
        queueLength: domainSongs.length,
        ms: Date.now() - startedAt,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn("[podcast] background same-show hydrate failed", {
          showId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  })();
}

function cleanTitle(value: unknown) {
  return String(value || "").trim();
}

export async function playPodcastEpisodeFromShow({
  episode,
  episodes,
  startIndex,
  playSong,
  enrichActiveQueue,
  categoryEpisodes: _categoryEpisodes,
  feedId,
  creatorId,
  categoryId,
}: PlayPodcastEpisodeFromShowArgs) {
  const tapStartedAt = Date.now();
  const audioUrl = String(episode.audioUrl || "").trim();
  if (!audioUrl || !isPlayablePodcastAudioUrl(audioUrl)) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      reason: "missing_audio",
      episodeId: episode.id,
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }

  const episodeId = String(episode.id || "").trim();
  if (episodeId && playInFlightByEpisodeId.has(episodeId)) {
    podcastPerfLog("[PODCAST_PLAY_TAP]", {
      ignored: true,
      reason: "in_flight",
      episodeId,
    });
    return { ok: false as const, error: "This episode is starting" };
  }
  if (episodeId) playInFlightByEpisodeId.set(episodeId, Date.now());

  try {
    let activeEpisode = episode;
    const showId = String(activeEpisode.showId || "").trim();

    podcastPerfLog("[PODCAST_PLAY_TAP]", {
      episodeId: activeEpisode.id,
      showId: showId || null,
      providedLength: (episodes || []).length,
    });

    podcastTrace("TAP", {
      selectedEpisodeId: activeEpisode.id,
      showId: showId || null,
      feedId: feedId || null,
      creatorId: creatorId || activeEpisode.publisher || null,
      categoryId: categoryId || activeEpisode.categories?.[0] || null,
      providedLength: episodes.length,
    });

    resetPodcastSkipFailures();

    // Immediate queue: use already-available same-show metadata only.
    // Never await network on the critical tap → play path.
    let showEpisodes = (episodes || []).filter(
      (entry) => !showId || String(entry.showId || "").trim() === showId
    );
    if (!showEpisodes.length) {
      showEpisodes = [activeEpisode];
    } else {
      showEpisodes = mergeActiveEpisodeIntoShowQueue(showEpisodes, activeEpisode);
    }

    podcastTrace("QUEUE_PROVIDED", {
      selectedEpisodeId: activeEpisode.id,
      showId: activeEpisode.showId,
      feedId: feedId || null,
      creatorId: creatorId || activeEpisode.publisher || null,
      categoryId: categoryId || activeEpisode.categories?.[0] || null,
      providedLength: episodes.length,
      finalLength: showEpisodes.length,
      activeIndex: showEpisodes.findIndex((entry) => entry.id === activeEpisode.id),
      continuationSource: "provided_immediate",
      expanded: false,
    });

    const playStartedAt = Date.now();
    const result = await startPlaybackWithEpisodes({
      activeEpisode,
      showEpisodes,
      startIndex,
      playSong,
      feedId,
      creatorId,
      categoryId,
      providedLength: episodes.length,
    });

    podcastPerfLog("[PODCAST_PLAY_TAP]", {
      phase: "playback_requested",
      episodeId: activeEpisode.id,
      tapToPlayMs: Date.now() - tapStartedAt,
      playCallMs: Date.now() - playStartedAt,
    });

    if (result.ok && showId) {
      hydrateSameShowQueueInBackground({
        activeEpisode,
        seedEpisodes: showEpisodes,
        selectedSongId: result.selectedSongId,
        enrichActiveQueue,
        feedId,
        creatorId,
        categoryId,
      });
    }

    return { ok: true as const, episode: result.episode };
  } catch (error) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      episodeId: episode.id,
      message: String((error as Error)?.message || error),
    });
    return { ok: false as const, error: "This episode is unavailable" };
  } finally {
    if (episodeId) playInFlightByEpisodeId.delete(episodeId);
  }
}
