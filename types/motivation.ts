export type MotivationMediaType = "audio" | "video";

export type MotivationCategory = {
  id: string;
  slug: string;
  name: string;
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  sort_order?: number;
  item_count?: number;
};

export type MotivationProgram = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  creator_id?: string | null;
  category_slug?: string | null;
  artwork_url?: string | null;
  language_code?: string | null;
  country_code?: string | null;
  program_type?: string;
  session_count?: number;
  total_duration_seconds?: number;
  published_at?: string | null;
  is_featured?: boolean;
};

export type MotivationItem = {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  artwork?: string | null;
  channel_name?: string | null;
  speaker_name?: string | null;
  category?: string | null;
  category_slug?: string | null;
  language?: string | null;
  country?: string | null;
  duration_seconds?: number | null;
  media_type?: MotivationMediaType | string;
  program_id?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
  sort_order?: number;
  is_featured?: boolean;
  published_at?: string | null;
};

export type MotivationOffsetPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type MotivationCursorPagination = {
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
};

export type MotivationPlaybackResolve = {
  itemId: string;
  title: string;
  mediaType: MotivationMediaType | string;
  playableUrl: string;
  mimeType?: string | null;
  durationSeconds?: number | null;
  programId?: string | null;
};

export type MotivationPlaybackContextType =
  | "program"
  | "category"
  | "search"
  | "featured"
  | "recommended"
  | "recent"
  | "standalone";

export type MotivationPlaybackContext = {
  contextType: MotivationPlaybackContextType;
  contextId?: string;
  contextSlug?: string;
  currentItemId: string;
  orderedItemIds: string[];
  cursor?: string | null;
  hasMore?: boolean;
};

export type MotivationHomeResponse = {
  continue_listening: MotivationItem[];
  recently_played: MotivationItem[];
  featured_programs: MotivationProgram[];
  featured_items: MotivationItem[];
  recommended: MotivationItem[];
  popular: MotivationItem[];
  new_releases: MotivationItem[];
  categories: MotivationCategory[];
};
