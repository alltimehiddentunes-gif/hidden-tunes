export type TvChannelCategory =
  | "music"
  | "worship"
  | "concerts"
  | "culture"
  | "documentary"
  | "news"
  | "education"
  | "local"
  | "international"
  | "mature";

export type TvStreamType = "hls" | "dash" | "web";

export type TvSourceType =
  | "official_stream"
  | "public_broadcaster"
  | "fast"
  | "youtube_metadata";

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

  quality?: TvChannelQuality;
  streamType?: TvStreamType;

  isLive: boolean;
  isActive: boolean;
  isMature: boolean;
  isVerifiedLegal: boolean;
  isFeatured?: boolean;

  sourceType: TvSourceType;
};

export type TvLiveSectionId =
  | "featured"
  | "music"
  | "worship"
  | "concerts"
  | "culture"
  | "documentary"
  | "news"
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

export type TvRecentlyWatchedEntry = {
  channelId: string;
  name: string;
  logoUrl?: string;
  category: TvChannelCategory;
  country?: string;
  watchedAt: string;
};
