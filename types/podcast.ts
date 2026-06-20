export type PodcastEpisode = {
  id: string;
  title: string;
  podcastTitle: string;
  audioUrl: string;
  artworkUrl?: string;
  duration?: number;
  publishedAt?: string;
  source: "podcast";
};
