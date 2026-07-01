export type ParsedPodcastEpisode = {
  title: string;
  description: string | null;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string | null;
  episode_number: number | null;
  season_number: number | null;
};

export type ParsedPodcastFeed = {
  title: string;
  description: string | null;
  artwork_url: string | null;
  host_name: string | null;
  publisher: string | null;
  language: string | null;
  primary_category: string | null;
  categories: string[];
  episodes: ParsedPodcastEpisode[];
};

export type PodcastIngestOptions = {
  auto_approve?: boolean;
};

export type PodcastIngestResult = {
  success: boolean;
  show_id: string;
  created_show: boolean;
  feed_url: string;
  auto_approve_requested: boolean;
  show_auto_approved: boolean;
  episodes_found: number;
  episodes_inserted: number;
  episodes_updated: number;
  episodes_skipped: number;
  episodes_auto_approved: number;
  episodes_pending: number;
  episodes_failed: number;
  message: string;
};
