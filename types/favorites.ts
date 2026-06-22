import type { ContentRating } from "./matureContent";

export type FavoriteItemType =
  | "song"
  | "artist"
  | "album"
  | "radio_station"
  | "podcast_show"
  | "podcast_episode";

export type FavoriteItemMetadata = {
  artistName?: string;
  albumName?: string;
  stationCountry?: string;
  stationLanguage?: string;
  stationGenre?: string;
  streamUrl?: string;
  podcastPublisher?: string;
  podcastFeedUrl?: string;
  episodeDate?: string;
  duration?: number | string;
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: ContentRating;
  videoId?: string;
  legacyType?: string;
  showId?: string;
  showTitle?: string;
  artistId?: string;
  albumId?: string;
  sourceName?: string;
  [key: string]: unknown;
};

export type UnifiedFavoriteItem = {
  id: string;
  type: FavoriteItemType;
  title: string;
  subtitle?: string;
  artwork?: string;
  source?: string;
  addedAt: string;
  metadata?: FavoriteItemMetadata;
};

export function favoriteStorageKey(type: FavoriteItemType, id: string) {
  return `${type}:${String(id || "").trim()}`;
}
