export type PodcastEpisode = {
  id: string;
  showId?: string;
  title: string;
  podcastTitle: string;
  audioUrl: string;
  artworkUrl?: string;
  duration?: number;
  publishedAt?: string;
  source: "podcast";
};
