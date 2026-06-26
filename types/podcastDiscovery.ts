export type PodcastShowListItem = {
  id: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  publisher?: string;
  category?: string;
  episodeCount?: number;
  episodeLabel?: string;
  language?: string;
  latestEpisodeDate?: string;
  feedUrl?: string;
  qualityScore?: number;
  qualityLabel?: string;
  is_mature?: boolean;
  content_rating?: import("./matureContent").ContentRating;
};
