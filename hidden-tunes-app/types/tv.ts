export type TvChannelCatalogStatus =
  | "active"
  | "temporarily_unavailable"
  | "removed";

export type TvChannelCategory =
  | "music"
  | "sports"
  | "movie"
  | "kids"
  | "worship"
  | "concerts"
  | "culture"
  | "documentary"
  | "news"
  | "education"
  | "government"
  | "local"
  | "international"
  | "mature";

export type TvMovieSubCategory =
  | "classics"
  | "action"
  | "comedy"
  | "family"
  | "horror"
  | "sci_fi"
  | "western"
  | "indie"
  | "public_domain";

export type TvStreamType = "hls" | "dash" | "web";

export type TvSourceType =
  | "official_stream"
  | "public_broadcaster"
  | "fast"
  | "youtube_metadata"
  | "test";

export type TvChannelQuality = "SD" | "HD" | "FHD";

export type TVChannel = {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  streamUrl: string;
  websiteUrl?: string;

  country?: string;
  language?: string;

  category: TvChannelCategory;
  subCategory?: TvMovieSubCategory;

  quality?: TvChannelQuality;
  streamType?: TvStreamType;

  isLive: boolean;
  /** Derived from catalogStatus for legacy checks. */
  isActive: boolean;
  catalogStatus: TvChannelCatalogStatus;
  isMature: boolean;
  isVerifiedLegal: boolean;
  isFeatured?: boolean;

  sourceType: TvSourceType;
};

export type TvLiveSectionId =
  | "featured"
  | "music"
  | "sports"
  | "movie"
  | "kids"
  | "worship"
  | "concerts"
  | "culture"
  | "documentary"
  | "news"
  | "education"
  | "government"
  | "local"
  | "international"
  | "recent"
  | "recommended"
  | "favorites"
  | "all"
  | "mature"
  | "related"
  | "search";

export type TvPlaybackContext = {
  sectionId: TvLiveSectionId;
  channelIds: string[];
  startIndex: number;
};

/** Presentation of the single TV playback session. `closed` = no session. */
export type TvPresentationMode = "closed" | "floating" | "fullPlayer";

export type TvRecentlyWatchedEntry = {
  channelId: string;
  name: string;
  logoUrl?: string;
  category: TvChannelCategory;
  country?: string;
  watchedAt: string;
  /** Optional VOD fields — absent on existing live v1 records. */
  positionSeconds?: number;
  durationSeconds?: number;
  completed?: boolean;
  isLive?: boolean;
};
