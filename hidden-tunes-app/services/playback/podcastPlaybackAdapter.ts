import type { AppSong } from "../../context/PlayerContext";
import type { PodcastEpisode } from "../../types/podcast";

export function podcastEpisodeToAppSong(episode: PodcastEpisode): AppSong {
  return {
    id: `podcast-${episode.id}`,
    title: episode.title,
    artist: episode.podcastTitle,
    audioUrl: episode.audioUrl,
    streamUrl: episode.audioUrl,
    url: episode.audioUrl,
    artworkUrl: episode.artworkUrl,
    coverUrl: episode.artworkUrl,
    thumbnail: episode.artworkUrl,
    duration: episode.duration,
    source: "podcast",
    sourceName: "Hidden Tunes",
    type: "podcast",
    isOnline: true,
  };
}

export function isPodcastEpisodeSong(song?: AppSong | null) {
  return song?.source === "podcast" || song?.type === "podcast";
}
