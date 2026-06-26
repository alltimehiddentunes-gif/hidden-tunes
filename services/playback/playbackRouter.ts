import type { PlaybackQueueContext } from "../../context/PlayerContext";
import type { AppSong } from "../../context/PlayerContext";
import type { PlaybackRouteResult } from "../../types/media";
import type { PodcastEpisode } from "../../types/podcast";
import type { RadioStation } from "../../types/radio";
import {
  isPodcastEpisodeSong,
  podcastEpisodeToAppSong,
} from "./podcastPlaybackAdapter";
import { logPodcastRuntime } from "../../utils/podcastRuntimeDiagnostics";
import {
  isRadioStreamSong,
  radioStationToAppSong,
} from "./radioPlaybackAdapter";

export type NativeQueueMode = "standard" | "live_stream" | "podcast";

export type PlaybackRouterDeps = {
  playSong: (
    song: AppSong,
    queue?: AppSong[],
    index?: number,
    queueContext?: PlaybackQueueContext,
    queueMode?: NativeQueueMode
  ) => Promise<void>;
  playQueue: (
    queue: AppSong[],
    startIndex?: number,
    priorInterruptDone?: boolean,
    queueContext?: PlaybackQueueContext,
    queueMode?: NativeQueueMode
  ) => Promise<void>;
  stopPlayback?: () => Promise<void>;
};

export async function routeRadioPlayback(
  station: RadioStation,
  deps: PlaybackRouterDeps
): Promise<PlaybackRouteResult> {
  const streamUrl = String(station.streamUrl || "").trim();

  if (!streamUrl.startsWith("https://")) {
    return {
      ok: false,
      error: "This station is unavailable right now.",
    };
  }

  const song = radioStationToAppSong(station);

  try {
    await deps.playSong(
      song,
      [song],
      0,
      { source: "radio", label: station.title },
      "live_stream"
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "This station is unavailable right now.",
    };
  }
}

export async function routePodcastPlayback(
  episode: PodcastEpisode,
  queueEpisodes: PodcastEpisode[],
  deps: PlaybackRouterDeps
): Promise<PlaybackRouteResult> {
  const target = podcastEpisodeToAppSong(episode);
  const targetAudioUrl = String(target.audioUrl || target.streamUrl || "").trim();
  const playable = queueEpisodes
    .map(podcastEpisodeToAppSong)
    .filter((song) => Boolean(String(song.audioUrl || song.streamUrl || "").trim()));
  const queue = playable.some((song) => song.id === target.id) ? playable : [target, ...playable];
  const startIndex = Math.max(
    0,
    queue.findIndex((song) => song.id === target.id)
  );

  logPodcastRuntime("PODCAST_EPISODE_PLAY_ATTEMPT", {
    episodeId: episode.id,
    showId: episode.showId,
    title: episode.title,
    audioPresent: Boolean(targetAudioUrl),
    queueSize: queue.length,
  });

  if (!targetAudioUrl) {
    logPodcastRuntime("PODCAST_EPISODE_MISSING_AUDIO_URL", {
      episodeId: episode.id,
      showId: episode.showId,
      title: episode.title,
    });
    return {
      ok: false,
      error: "This episode is unavailable right now.",
    };
  }

  try {
    await deps.playSong(
      target,
      queue,
      startIndex,
      { source: "podcast", label: episode.podcastTitle },
      "podcast"
    );
    logPodcastRuntime("PODCAST_EPISODE_PLAY_STARTED", {
      episodeId: episode.id,
      showId: episode.showId,
      title: episode.title,
      queueSize: queue.length,
      startIndex,
    });
    return { ok: true };
  } catch (error) {
    logPodcastRuntime("episode_play_error", {
      episodeId: episode.id,
      showId: episode.showId,
      title: episode.title,
      reason: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: "This episode is unavailable right now.",
    };
  }
}

export { isRadioStreamSong, isPodcastEpisodeSong };
