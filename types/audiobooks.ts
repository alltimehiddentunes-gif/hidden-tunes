export type AudiobookCategory = {
  id: string;
  slug: string;
  name: string;
  title: string;
  subtitle?: string | null;
  icon?: string | null;
  artwork_url?: string | null;
  artworkUrl?: string | null;
  imageUrl?: string | null;
  gradient?: readonly [string, string];
  item_count: number;
  is_mature?: boolean;
};

export type AudiobookItem = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  cover_url?: string | null;
  author_name?: string | null;
  narrator_name?: string | null;
  series_title?: string | null;
  series_position?: number | null;
  category_slug?: string | null;
  categories: string[];
  language?: string | null;
  publisher?: string | null;
  duration_seconds?: number | null;
  chapter_count: number;
  is_featured?: boolean;
  is_verified?: boolean;
  published_at?: string | null;
  created_at?: string | null;
  is_mature?: boolean;
};

export type AudiobookChapter = {
  id: string;
  audiobook_id: string;
  title: string;
  description?: string | null;
  chapter_number?: number | null;
  duration_seconds?: number | null;
  published_at?: string | null;
  created_at?: string | null;
};

export type AudiobookPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type AudiobookPage = {
  items: AudiobookItem[];
  pagination: AudiobookPagination;
};

export type AudiobookDetail = {
  audiobook: AudiobookItem;
  chapters: AudiobookChapter[];
};

export type AudiobookPlayResponse = {
  audiobook_id: string;
  title: string;
  audio_url: string;
  file?: {
    id: string;
    audiobook_id: string;
    title?: string | null;
    audio_url: string;
    duration_seconds?: number | null;
    format?: string | null;
    mime_type?: string | null;
    bitrate?: number | null;
  };
};
