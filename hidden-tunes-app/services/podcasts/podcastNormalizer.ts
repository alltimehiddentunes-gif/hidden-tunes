import type { HiddenTunesPodcastEpisode } from "../podcastCatalogApi";
import type { PodcastEpisode } from "../../types/podcast";

export function normalizePodcastEpisode(
  episode: HiddenTunesPodcastEpisode,
  podcastTitle: string
): PodcastEpisode | null {
  const audioUrl = String(episode.audio_url || "").trim();

  if (!audioUrl.startsWith("https://")) return null;

  return {
    id: episode.id,
    title: episode.title,
    podcastTitle: podcastTitle.trim() || "Hidden Tunes Podcast",
    audioUrl,
    artworkUrl: episode.artwork_url,
    duration: episode.duration_seconds,
    publishedAt: episode.published_at,
    source: "podcast",
  };
}
