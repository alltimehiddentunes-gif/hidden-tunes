import { useMemo } from "react";

import { usePlayerActions } from "../context/PlayerContext";
import {
  routePodcastPlayback,
  routeRadioPlayback,
  type PlaybackRouterDeps,
} from "../services/playback/playbackRouter";
import type { PodcastEpisode } from "../types/podcast";
import type { RadioStation } from "../types/radio";

export function usePlaybackRouter() {
  const { playSong, playQueue, stopPlayback } = usePlayerActions();

  return useMemo(() => {
    const deps: PlaybackRouterDeps = {
      playSong,
      playQueue,
      stopPlayback,
    };

    return {
      playRadioStation: (station: RadioStation) => routeRadioPlayback(station, deps),
      playPodcastEpisode: (episode: PodcastEpisode, queue: PodcastEpisode[]) =>
        routePodcastPlayback(episode, queue, deps),
    };
  }, [playSong, playQueue, stopPlayback]);
}
