import type { ContentRating } from "./matureContent";

export type RadioBrowserStationRaw = {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  tags?: string;
  bitrate?: number;
  codec?: string;
  votes?: number;
  clickcount?: number;
};

/** Full station record stored in cache — includes stream URL for playback on tap. */
export type HiddenTunesStation = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  language?: string;
  tags: string[];
  bitrate?: number;
  codec?: string;
  votes?: number;
  clickcount?: number;
  quality_score?: number;
  categoryId: string;
  cachedAt: number;
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: ContentRating;
};

/** Lightweight row model for FlatList — no stream URL in render props. */
export type RadioStationListItem = {
  id: string;
  title: string;
  country?: string;
  language?: string;
  genre?: string;
  tags: string[];
  artworkUrl?: string;
  subtitle: string;
  bitrate?: number;
  codec?: string;
  qualityLabel?: string;
  qualityScore?: number;
  is_mature?: boolean;
  content_rating?: ContentRating;
};

export type RadioStation = {
  id: string;
  title: string;
  streamUrl: string;
  artworkUrl?: string;
  country?: string;
  tags?: string[];
  genre?: string;
  source: "radio";
};
