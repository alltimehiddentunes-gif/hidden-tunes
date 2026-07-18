import { useMemo } from "react";

import { usePlayerActions } from "../context/PlayerContext";
import {
  routeRadioPlayback,
  type PlaybackRouterDeps,
} from "../services/playback/playbackRouter";
import type { LiveRadioSessionOptions } from "../services/radio/radioPlaybackSession";
import { addPodcastRecentlyPlayed } from "../services/podcastRecentlyPlayed";
import type { PodcastEpisode } from "../types/podcast";
import type { RadioStation } from "../types/radio";
import { logPodcastDiagnostic } from "../utils/podcastDiagnostics";
import {
  buildPodcastQueueContext,
  isPlayablePodcastAudioUrl,
  podcastEpisodeToAppSong,
} from "../utils/podcastPlaybackAdapter";
import { playPodcastEpisodeFromShow } from "../utils/podcastPlayback";

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
      startIndex?: number,
      extras?: {
        categoryEpisodes?: PodcastEpisode[];
        feedId?: string | null;
        creatorId?: string | null;
        categoryId?: string | null;
      }
    ) => {
      const result = await playPodcastEpisodeFromShow({
        episode,
        episodes,
        startIndex,
        playSong,
        categoryEpisodes: extras?.categoryEpisodes,
        feedId: extras?.feedId,
        creatorId: extras?.creatorId,
        categoryId: extras?.categoryId,
      });

      if (result.ok) {
        await addPodcastRecentlyPlayed(result.episode);
        return { ok: true as const };
      }

      return { ok: false as const, error: result.error };
    };

    return {
      playRadioStation: (
        station: RadioStation,
        sessionOptions?: LiveRadioSessionOptions
      ) => routeRadioPlayback(station, deps, sessionOptions),
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
          // Single-episode entry still carries Podcast domain context so the
          // shared queue builder cannot expand into Music discovery.
          const song = podcastEpisodeToAppSong(episode);
          const context = buildPodcastQueueContext({
            showId: episode.showId,
            showTitle: episode.showTitle,
            creatorId: episode.publisher,
            categoryId: episode.categories?.[0],
          });
          await playSong(song, [song], 0, context, "standard");
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
