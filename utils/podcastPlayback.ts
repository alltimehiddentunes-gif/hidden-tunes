import type { AppSong } from "../context/PlayerContext";
import type { PodcastEpisode } from "../types/podcast";
import { logPodcastDiagnostic } from "./podcastDiagnostics";
import {
  isPlayablePodcastAudioUrl,
  podcastEpisodeToAppSong,
} from "./podcastPlaybackAdapter";
import { PODCAST_SHOW_EPISODE_LIMIT } from "../services/podcastService";

const PODCAST_QUEUE_CONTEXT = { source: "unknown" as const, label: "Podcasts" };

type PlaySongFn = (
  song: AppSong,
  queue?: AppSong[],
  index?: number,
  queueContext?: typeof PODCAST_QUEUE_CONTEXT,
  queueMode?: "standard"
) => Promise<void>;

export type PodcastPlaybackQueue = {
  episodes: PodcastEpisode[];
  songs: AppSong[];
};

export function buildPodcastPlaybackQueue(episodes: PodcastEpisode[]): PodcastPlaybackQueue {
  const episodesWithAudio = episodes
    .filter((episode) => {
      const audioUrl = String(episode.audioUrl || "").trim();
      return Boolean(audioUrl && isPlayablePodcastAudioUrl(audioUrl));
    })
    .slice(0, PODCAST_SHOW_EPISODE_LIMIT);

  return {
    episodes: episodesWithAudio,
    songs: episodesWithAudio.map(podcastEpisodeToAppSong),
  };
}

type PlayPodcastEpisodeFromShowArgs = {
  episode: PodcastEpisode;
  episodes: PodcastEpisode[];
  startIndex?: number;
  playSong: PlaySongFn;
};

export async function playPodcastEpisodeFromShow({
  episode,
  episodes,
  startIndex,
  playSong,
}: PlayPodcastEpisodeFromShowArgs) {
  const audioUrl = String(episode.audioUrl || "").trim();
  if (!audioUrl || !isPlayablePodcastAudioUrl(audioUrl)) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      reason: "missing_audio",
      episodeId: episode.id,
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }

  const { episodes: playableEpisodes, songs } = buildPodcastPlaybackQueue(episodes);
  if (!songs.length) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      reason: "empty_queue",
      episodeId: episode.id,
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }

  const resolvedIndex = playableEpisodes.findIndex((item) => item.id === episode.id);
  const safeIndex = Math.max(
    0,
    Math.min(resolvedIndex >= 0 ? resolvedIndex : 0, songs.length - 1)
  );

  logPodcastDiagnostic("podcast_auto_next_queue_created", {
    episodeId: episode.id,
    queueSize: songs.length,
    startIndex: safeIndex,
  });
  logPodcastDiagnostic("podcast_episode_play_start", { episodeId: episode.id });

  try {
    await playSong(
      songs[safeIndex],
      songs,
      safeIndex,
      PODCAST_QUEUE_CONTEXT,
      "standard"
    );
    logPodcastDiagnostic("podcast_episode_play_success", { episodeId: episode.id });
    return { ok: true as const, episode: playableEpisodes[safeIndex] };
  } catch (error) {
    logPodcastDiagnostic("podcast_episode_play_failed", {
      episodeId: episode.id,
      message: String((error as Error)?.message || error),
    });
    return { ok: false as const, error: "This episode is unavailable" };
  }
}
