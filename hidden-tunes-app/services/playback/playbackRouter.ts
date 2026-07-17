import type { PlaybackRouteResult } from "../../types/media";
import type { PodcastEpisode } from "../../types/podcast";
import type { RadioStation } from "../../types/radio";
import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import type { VideoItem } from "../../types/video";
import {
  isPodcastEpisodeSong,
  podcastEpisodeToAppSong,
} from "./podcastPlaybackAdapter";
import {
  isRadioStreamSong,
  radioStationToAppSong,
} from "./radioPlaybackAdapter";
import {
  routeVideoItemPlayback,
  routeVideoPlayback,
  tvVideoToVideoItem,
} from "./videoPlaybackAdapter";

export type NativeQueueMode = "standard" | "live_stream" | "podcast";

export type PlaybackRouterDeps = {
  playSong: (
    song: Parameters<
      import("../../context/PlayerContext").PlayerContextType["playSong"]
    >[0],
    queue?: Parameters<
      import("../../context/PlayerContext").PlayerContextType["playSong"]
    >[1],
    index?: number,
    queueMode?: NativeQueueMode
  ) => Promise<void>;
  playQueue: (
    queue: Parameters<
      import("../../context/PlayerContext").PlayerContextType["playQueue"]
    >[0],
    startIndex?: number,
    priorInterruptDone?: boolean,
    queueMode?: NativeQueueMode
  ) => Promise<void>;
  stopPlayback?: () => Promise<void>;
};

export async function routeRadioPlayback(
  station: RadioStation,
  deps: PlaybackRouterDeps,
  stationQueue: RadioStation[] = []
): Promise<PlaybackRouteResult> {
  const streamUrl = String(station.streamUrl || "").trim();

  if (!streamUrl.startsWith("https://")) {
    return {
      ok: false,
      error: "This station stream is unavailable right now.",
    };
  }

  const sourceStations = stationQueue.length ? stationQueue : [station];
  const queue = sourceStations
    .map(radioStationToAppSong)
    .filter((item) => Boolean(item.streamUrl || item.audioUrl));

  const target = radioStationToAppSong(station);
  const startIndex = Math.max(
    0,
    queue.findIndex((item) => item.id === target.id)
  );

  if (!queue.length) {
    return {
      ok: false,
      error: "This station stream is unavailable right now.",
    };
  }

  try {
    await deps.playQueue(queue, startIndex, false, "live_stream");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "This station stream is unavailable right now.",
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

  if (!playable.length || !target.audioUrl) {
    return {
      ok: false,
      error: "This episode audio is unavailable right now.",
    };
  }

  try {
    await deps.playQueue(playable, startIndex, false, "standard");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "This episode audio is unavailable right now.",
    };
  }
}

export { routeLecturePlayback } from "./lecturePlaybackRouter";

export function routeYouTubeVideoPlayback(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[],
  deps: Pick<PlaybackRouterDeps, "stopPlayback">
) {
  routeVideoPlayback(video, queueVideos, deps);
}

export function routeYouTubeVideoItemPlayback(
  video: VideoItem,
  queue: VideoItem[],
  deps: Pick<PlaybackRouterDeps, "stopPlayback">
) {
  routeVideoItemPlayback(video, queue, deps);
}

export { isRadioStreamSong, isPodcastEpisodeSong, tvVideoToVideoItem };
