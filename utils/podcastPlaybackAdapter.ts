import type { AppSong } from "../context/PlayerContext";
import type { PodcastEpisode } from "../types/podcast";

const SUPPORTED_AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg)(\?|$)/i;

export function isPlayablePodcastAudioUrl(url: string) {
  const clean = String(url || "").trim();
  if (!clean.startsWith("https://") && !clean.startsWith("http://")) return false;
  if (SUPPORTED_AUDIO_EXTENSIONS.test(clean)) return true;
  return clean.includes("/audio") || clean.includes("media") || clean.includes("podcast");
}

export function podcastEpisodeToAppSong(episode: PodcastEpisode): AppSong {
  const artist = episode.showTitle || episode.publisher || "Podcast";

  return {
    id: `podcast-${episode.id}`,
    title: episode.title || "Untitled Episode",
    artist,
    user: { name: artist },
    channelTitle: artist,
    artworkUrl: episode.artworkUrl,
    coverUrl: episode.artworkUrl,
    thumbnail: episode.artworkUrl,
    artwork: episode.artworkUrl,
    streamUrl: episode.audioUrl,
    url: episode.audioUrl,
    audioUrl: episode.audioUrl,
    duration: episode.durationSeconds,
    genre: "Podcast",
    mood: episode.emotionalWorld,
    source: "hidden-tunes",
    sourceName: "Podcast",
    type: "r2",
    isOnline: true,
  };
}

export function isPodcastAppSong(song?: AppSong | null) {
  return Boolean(song?.id?.startsWith("podcast-"));
}
