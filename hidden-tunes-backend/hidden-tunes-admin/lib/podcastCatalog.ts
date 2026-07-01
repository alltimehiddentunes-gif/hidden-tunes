import { cleanText, parsePositiveInt } from "@/lib/tvCatalog";

export const PODCAST_SHOW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "blocked",
  "inactive",
] as const;

export const PODCAST_FEED_STATUSES = [
  "unchecked",
  "active",
  "inactive",
  "offline",
  "blocked",
  "pending",
  "rejected",
] as const;

export const PODCAST_EPISODE_PLAYBACK_STATUSES = [
  "unchecked",
  "playable",
  "failed",
  "blocked",
  "offline",
  "pending",
  "rejected",
] as const;

export const PODCAST_DEFAULT_PAGE_SIZE = 20;
export const PODCAST_MAX_PAGE_SIZE = 30;

export type PodcastShowStatus = (typeof PODCAST_SHOW_STATUSES)[number];
export type PodcastFeedStatus = (typeof PODCAST_FEED_STATUSES)[number];
export type PodcastEpisodePlaybackStatus =
  (typeof PODCAST_EPISODE_PLAYBACK_STATUSES)[number];

/** Public list/detail — no feed_url or internal ingest fields. */
export const PODCAST_PUBLIC_SHOW_SELECT =
  "id, slug, title, description, artwork_url, host_name, primary_category, categories, language, publisher, episode_count, is_featured, is_exclusive, is_verified, last_checked_at, created_at";

/** Public episode list — metadata only; audio_url excluded. */
export const PODCAST_PUBLIC_EPISODE_LIST_SELECT =
  "id, show_id, title, description, artwork_url, duration_seconds, published_at, episode_number, season_number, is_verified, last_checked_at, created_at";

/** Play resolution — audio URL only after explicit play request. */
export const PODCAST_EPISODE_PLAY_SELECT =
  "id, show_id, title, audio_url, duration_seconds, published_at, playback_status, status, is_active, is_verified";

export type PodcastPublicShow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  host_name: string | null;
  primary_category: string | null;
  categories: string[];
  language: string | null;
  publisher: string | null;
  episode_count: number;
  is_featured: boolean;
  is_exclusive: boolean;
  is_verified: boolean;
  last_checked_at: string | null;
};

export type PodcastPublicEpisode = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  episode_number: number | null;
  season_number: number | null;
  is_verified: boolean;
  last_checked_at: string | null;
};

export type PodcastPublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
};

export type PodcastCatalogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function parsePodcastPage(value: string | null) {
  return parsePositiveInt(value, 1, 10_000);
}

export function parsePodcastLimit(value: string | null) {
  return parsePositiveInt(value, PODCAST_DEFAULT_PAGE_SIZE, PODCAST_MAX_PAGE_SIZE);
}

export function buildPodcastPagination(
  page: number,
  limit: number,
  total: number
): PodcastCatalogPagination {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

export function normalizePodcastCategories(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];

  return value
    .map((entry) => cleanText(entry, 80))
    .filter(Boolean) as string[];
}

export function toPodcastPublicShow(row: Record<string, unknown>): PodcastPublicShow {
  return {
    id: String(row.id || ""),
    slug: String(row.slug || "").trim(),
    title: String(row.title || "Untitled"),
    description: cleanText(row.description, 1200),
    artwork_url: cleanText(row.artwork_url, 2000),
    host_name: cleanText(row.host_name, 120),
    primary_category: cleanText(row.primary_category, 120),
    categories: normalizePodcastCategories(row.categories),
    language: cleanText(row.language, 40),
    publisher: cleanText(row.publisher, 160),
    episode_count: Number.isFinite(Number(row.episode_count))
      ? Math.max(0, Number(row.episode_count))
      : 0,
    is_featured: Boolean(row.is_featured),
    is_exclusive: Boolean(row.is_exclusive),
    is_verified: Boolean(row.is_verified),
    last_checked_at: cleanText(row.last_checked_at, 40),
  };
}

export function toPodcastPublicEpisode(
  row: Record<string, unknown>
): PodcastPublicEpisode {
  return {
    id: String(row.id || ""),
    show_id: String(row.show_id || ""),
    title: String(row.title || "Untitled"),
    description: cleanText(row.description, 1200),
    artwork_url: cleanText(row.artwork_url, 2000),
    duration_seconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    published_at: cleanText(row.published_at, 40),
    episode_number: Number.isFinite(Number(row.episode_number))
      ? Number(row.episode_number)
      : null,
    season_number: Number.isFinite(Number(row.season_number))
      ? Number(row.season_number)
      : null,
    is_verified: Boolean(row.is_verified),
    last_checked_at: cleanText(row.last_checked_at, 40),
  };
}

export function toPodcastPublicCategory(
  row: Record<string, unknown>
): PodcastPublicCategory {
  return {
    id: String(row.id || ""),
    name: String(row.name || "").trim(),
    slug: String(row.slug || "").trim(),
    description: cleanText(row.description, 500),
    sort_order: Number.isFinite(Number(row.sort_order))
      ? Number(row.sort_order)
      : 0,
  };
}

export function isPlayablePodcastAudioUrl(value: unknown) {
  const url = cleanText(value, 2000);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export function buildShowCategoryOrFilter(category: string) {
  const escaped = escapeIlikePattern(category);
  const needsQuotes = /[^a-zA-Z0-9_-]/.test(category);
  const encoded = needsQuotes
    ? `"${category.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : category;

  return `primary_category.ilike.%${escaped}%,categories.cs.{${encoded}}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPublicShowFilters(query: any, options: {
  category?: string | null;
  collection?: string | null;
  isFeatured?: boolean;
  isExclusive?: boolean;
  searchQuery?: string | null;
}) {
  let next = query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active");

  if (options.isFeatured) {
    next = next.eq("is_featured", true);
  }

  if (options.isExclusive) {
    next = next.eq("is_exclusive", true);
  }

  if (options.category) {
    next = next.or(buildShowCategoryOrFilter(options.category));
  }

  if (options.collection) {
    const escaped = escapeIlikePattern(options.collection);
    next = next.ilike("primary_category", `%${escaped}%`);
  }

  if (options.searchQuery) {
    const escaped = escapeIlikePattern(options.searchQuery);
    next = next.or(
      `title.ilike.%${escaped}%,host_name.ilike.%${escaped}%,description.ilike.%${escaped}%`
    );
  }

  return next;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPublicEpisodeFilters(query: any, options: {
  showId?: string | null;
  searchQuery?: string | null;
}) {
  let next = query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");

  if (options.showId) {
    next = next.eq("show_id", options.showId);
  }

  if (options.searchQuery) {
    const escaped = escapeIlikePattern(options.searchQuery);
    next = next.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  return next;
}
