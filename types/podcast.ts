export type PodcastMatureLevel = "safe" | "explicit" | "adult";

export type PodcastShow = {
  id: string;
  title: string;
  publisher: string;
  description: string;
  artworkUrl: string;
  feedUrl: string;
  websiteUrl?: string;
  language: string;
  country?: string;
  categories: string[];
  emotionalWorld?: string;
  isExplicit: boolean;
  matureLevel: PodcastMatureLevel;
  lastEpisodeDate?: string;
  source: "rss";
};

export type PodcastEpisode = {
  id: string;
  showId: string;
  showTitle: string;
  publisher?: string;
  title: string;
  description: string;
  artworkUrl: string;
  audioUrl: string;
  durationSeconds?: number;
  publishedAt?: string;
  episodeUrl?: string;
  language: string;
  categories: string[];
  emotionalWorld?: string;
  isExplicit: boolean;
  matureLevel: PodcastMatureLevel;
  source: "podcast_rss";
};

export type PodcastCategory = {
  id: string;
  title: string;
  description: string;
  icon?: string;
  matureOnly: boolean;
  children?: PodcastCategory[];
};

export type PodcastSeed = {
  title: string;
  feedUrl: string;
  category: string;
  language: string;
  country?: string;
  isExplicit: boolean;
  matureLevel: PodcastMatureLevel;
  emotionalWorld?: string;
};

export type PodcastSearchResult = {
  kind: "show" | "episode";
  show?: PodcastShow;
  episode?: PodcastEpisode;
};
