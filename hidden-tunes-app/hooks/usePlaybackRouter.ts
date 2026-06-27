import { useMemo } from "react";

import { usePlayerActions } from "../context/PlayerContext";
import {
  routePodcastPlayback,
  routeRadioPlayback,
  routeYouTubeVideoItemPlayback,
  routeYouTubeVideoPlayback,
  type PlaybackRouterDeps,
} from "../services/playback/playbackRouter";
import type { HiddenTunesTvVideo } from "../services/tvCatalogApi";
import type { PodcastEpisode } from "../types/podcast";
import type { RadioStation } from "../types/radio";
import type { VideoItem } from "../types/video";

export function usePlaybackRouter() {
  const { playSong, playQueue, stopPlayback } = usePlayerActions();

  return useMemo(() => {
    const deps: PlaybackRouterDeps = {
      playSong,
      playQueue,
      stopPlayback,
    };

    return {
      playRadioStation: (station: RadioStation, stationQueue?: RadioStation[]) =>
        routeRadioPlayback(station, deps, stationQueue),
      playPodcastEpisode: (episode: PodcastEpisode, queue: PodcastEpisode[]) =>
        routePodcastPlayback(episode, queue, deps),
      playYouTubeVideo: (video: HiddenTunesTvVideo, queue: HiddenTunesTvVideo[]) => {
        routeYouTubeVideoPlayback(video, queue, deps);
      },
      playVideoItem: (video: VideoItem, queue: VideoItem[]) => {
        routeYouTubeVideoItemPlayback(video, queue, deps);
      },
    };
  }, [playSong, playQueue, stopPlayback]);
}
