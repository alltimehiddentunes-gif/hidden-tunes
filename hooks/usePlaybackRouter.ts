import { useMemo } from "react";

import { usePlayerActions, type AppSong } from "../context/PlayerContext";
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
import { playPodcastEpisodeFromShow } from "../utils/podcastPlayback";

const PODCAST_QUEUE_CONTEXT = { source: "unknown" as const, label: "Podcasts" };

export function usePlaybackRouter() {
  const { playSong, playQueue, stopPlayback } = usePlayerActions();

  return useMemo(() => {
    const deps: PlaybackRouterDeps = {
      playSong,
      playQueue,
      stopPlayback,
    };

    const playPodcastEpisodeFromShowWithRecent = async (
      episode: PodcastEpisode,
      episodes: PodcastEpisode[],
      startIndex?: number
    ) => {
      const result = await playPodcastEpisodeFromShow({
        episode,
        episodes,
        startIndex,
        playSong,
      });

      if (result.ok) {
        await addPodcastRecentlyPlayed(result.episode);
        return { ok: true as const };
      }

      return { ok: false as const, error: result.error };
    };

    return {
      playRadioStation: (station: RadioStation) => routeRadioPlayback(station, deps),
      playPodcastEpisodeFromShow: playPodcastEpisodeFromShowWithRecent,
      playPodcastEpisode: async (
        episode: PodcastEpisode,
        queue?: PodcastEpisode[],
        index = 0
      ) => {
        if (queue?.length) {
          return playPodcastEpisodeFromShowWithRecent(episode, queue, index);
        }

        const audioUrl = String(episode.audioUrl || "").trim();
        if (!audioUrl || !isPlayablePodcastAudioUrl(audioUrl)) {
          logPodcastDiagnostic("podcast_episode_play_failed", {
            reason: "missing_audio",
            episodeId: episode.id,
          });
          return { ok: false as const, error: "This episode is unavailable" };
        }

        logPodcastDiagnostic("podcast_episode_play_start", { episodeId: episode.id });

        try {
          await playSong(
            podcastEpisodeToAppSong(episode),
            [podcastEpisodeToAppSong(episode)],
            0,
            PODCAST_QUEUE_CONTEXT,
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
