import { cleanText } from "@/lib/tvCatalog";

export const MOTIVATION_SOURCE_TYPES = [
  "youtube_video",
  "archive_video",
  "hls_stream",
  "mp4_file",
  "manual",
] as const;

export const MOTIVATION_ITEM_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "blocked",
  "inactive",
] as const;

export const MOTIVATION_PLAYBACK_STATUSES = [
  "unchecked",
  "playable",
  "failed",
  "blocked",
  "private",
  "deleted",
  "region_blocked",
  "embed_blocked",
] as const;

export const MOTIVATION_PUBLIC_SELECT =
  "id, title, description, thumbnail_url, channel_name, category, subcategory, tags, language, region, duration_seconds, reliability_score, is_featured, sort_order, created_at";

export const MOTIVATION_PLAY_SELECT =
  "id, source_type, source_id, source_url, embed_url, status, is_active, playback_status, reliability_score";

export const MOTIVATION_DEFAULT_PAGE_SIZE = 20;
export const MOTIVATION_MAX_PAGE_SIZE = 40;
export const MOTIVATION_TARGET_ITEMS = 5000;

export type MotivationSourceType = (typeof MOTIVATION_SOURCE_TYPES)[number];
export type MotivationItemStatus = (typeof MOTIVATION_ITEM_STATUSES)[number];
export type MotivationPlaybackStatus = (typeof MOTIVATION_PLAYBACK_STATUSES)[number];

export type MotivationItemRow = {
  id: string;
  source_type: MotivationSourceType | string;
  source_id: string;
  source_url: string;
  embed_url: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  channel_name: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  language: string | null;
  region: string | null;
  duration_seconds: number | null;
  status: MotivationItemStatus | string;
  playback_status: MotivationPlaybackStatus | string;
  is_active: boolean;
  is_featured: boolean;
  reliability_score: number | null;
  consecutive_failures: number | null;
  last_health_checked_at: string | null;
  last_health_error: string | null;
  quarantined_at: string | null;
  disabled_at: string | null;
  source_key: string | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

export type MotivationPublicItem = {
  id: string;
  title: string;
  description: string | null;
  artwork: string | null;
  channel_name: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  language: string | null;
  country: string | null;
  duration_seconds: number | null;
  reliability_score: number;
  is_featured: boolean;
};

export type MotivationListCursor = {
  sort_order: number;
  created_at: string;
  id: string;
};

export function parsePositiveInt(
  value: unknown,
  fallback: number,
  max: number
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function encodeMotivationCursor(row: MotivationListCursor) {
  return Buffer.from(
    JSON.stringify({
      s: row.sort_order,
      c: row.created_at,
      i: row.id,
    })
  ).toString("base64url");
}

export function decodeMotivationCursor(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      s?: number;
      c?: string;
      i?: string;
    };
    if (!parsed?.i || !parsed?.c) return null;
    return {
      sort_order: Number(parsed.s ?? 0),
      created_at: String(parsed.c),
      id: String(parsed.i),
    } satisfies MotivationListCursor;
  } catch {
    return null;
  }
}

export function toMotivationPublicItem(row: Record<string, unknown>): MotivationPublicItem {
  const tags = Array.isArray(row.tags)
    ? row.tags
        .map((tag) => cleanText(tag, 120))
        .filter((tag): tag is string => Boolean(tag))
    : [];

  return {
    id: String(row.id || ""),
    title: String(row.title || "Untitled"),
    description: cleanText(row.description, 2000),
    artwork: cleanText(row.thumbnail_url, 2000),
    channel_name: cleanText(row.channel_name, 200),
    category: cleanText(row.category, 120),
    subcategory: cleanText(row.subcategory, 120),
    tags,
    language: cleanText(row.language, 80),
    country: cleanText(row.region, 120),
    duration_seconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    reliability_score: Math.max(
      0,
      Math.min(100, Math.round(Number(row.reliability_score ?? 0)))
    ),
    is_featured: row.is_featured === true,
  };
}

export function buildYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function buildYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}

export function buildYouTubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
