import { useMemo } from "react";

import { usePlayerActions } from "../context/PlayerContext";
import {
  routeRadioPlayback,
  type PlaybackRouterDeps,
} from "../services/playback/playbackRouter";
import { addPodcastRecentlyPlayed } from "../services/podcastRecentlyPlayed";
import type { PodcastEpisode } from "../types/podcast";
import type { RadioStation } from "../types/radio";
import { logPodcastDiagnostic } from "../utils/podcastDiagnostics";
import {
  isPlayablePodcastAudioUrl,
  podcastEpisodeToAppSong,
} from "../utils/podcastPlaybackAdapter";

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
      playPodcastEpisode: async (
        episode: PodcastEpisode,
        queue?: PodcastEpisode[],
        index = 0
      ) => {
        const audioUrl = String(episode.audioUrl || "").trim();
        if (!audioUrl || !isPlayablePodcastAudioUrl(audioUrl)) {
          logPodcastDiagnostic("podcast_episode_play_failed", {
            reason: "missing_audio",
            episodeId: episode.id,
          });
          return { ok: false as const, error: "This episode is unavailable" };
        }

        logPodcastDiagnostic("podcast_episode_play_start", { episodeId: episode.id });

        const playableQueue = (queue || [episode]).filter(
          (item) => item.audioUrl && isPlayablePodcastAudioUrl(item.audioUrl)
        );
        if (!playableQueue.length) {
          return { ok: false as const, error: "This episode is unavailable" };
        }

        const songs = playableQueue.map(podcastEpisodeToAppSong);
        const safeIndex = Math.max(0, Math.min(index, songs.length - 1));

        try {
          await playSong(
            songs[safeIndex],
            songs,
            safeIndex,
            { source: "unknown", label: "Podcasts" },
            "standard"
          );
          await addPodcastRecentlyPlayed(episode);
          logPodcastDiagnostic("podcast_episode_play_success", { episodeId: episode.id });
          return { ok: true as const };
        } catch (error) {
          logPodcastDiagnostic("podcast_episode_play_failed", {
            episodeId: episode.id,
            message: String((error as Error)?.message || error),
          });
          return { ok: false as const, error: "This episode is unavailable" };
        }
      },
    };
  }, [playSong, playQueue, stopPlayback]);
}
