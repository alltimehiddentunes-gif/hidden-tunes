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
  const playable = queueEpisodes
    .map(podcastEpisodeToAppSong)
    .filter((song) => Boolean(song.audioUrl || song.streamUrl));

  const target = podcastEpisodeToAppSong(episode);
  const startIndex = Math.max(
    0,
    playable.findIndex((song) => song.id === target.id)
  );

  logPodcastRuntime("episode_play_tap", {
    title: episode.title,
    audioPresent: Boolean(target.audioUrl),
    playerReceivedUrl: Boolean(target.audioUrl || target.streamUrl),
  });

  if (!playable.length || !target.audioUrl) {
    logPodcastRuntime("episode_play_error", {
      title: episode.title,
      reason: "missing_audio_url",
    });
    return {
      ok: false,
      error: "This episode is unavailable right now.",
    };
  }

  try {
    await deps.playQueue(
      playable,
      startIndex,
      false,
      { source: "podcast", label: episode.podcastTitle },
      "podcast"
    );
    logPodcastRuntime("episode_play_success", {
      title: episode.title,
      queueSize: playable.length,
    });
    return { ok: true };
  } catch (error) {
    logPodcastRuntime("episode_play_error", {
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
