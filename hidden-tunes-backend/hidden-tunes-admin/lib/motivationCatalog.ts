import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  "id, slug, title, description, thumbnail_url, channel_name, speaker_name, category, subcategory, category_slug, categories, tags, language, region, duration_seconds, reliability_score, is_featured, sort_order, published_at, created_at";

export const MOTIVATION_PLAY_SELECT =
  "id, source_type, source_id, source_url, embed_url, status, is_active, playback_status, reliability_score";

export const MOTIVATION_DEFAULT_PAGE_SIZE = 40;
export const MOTIVATION_MAX_PAGE_SIZE = 40;
export const MOTIVATION_CATEGORIES = [
  { id: "daily-motivation", slug: "daily-motivation", name: "Daily Motivation", sort_order: 10 },
  { id: "discipline", slug: "discipline", name: "Discipline", sort_order: 20 },
  { id: "focus", slug: "focus", name: "Focus", sort_order: 30 },
  { id: "success", slug: "success", name: "Success", sort_order: 40 },
  { id: "confidence", slug: "confidence", name: "Confidence", sort_order: 50 },
  { id: "healing", slug: "healing", name: "Healing", sort_order: 60 },
  { id: "faith-purpose", slug: "faith-purpose", name: "Faith & Purpose", sort_order: 70 },
  { id: "study-motivation", slug: "study-motivation", name: "Study Motivation", sort_order: 80 },
  { id: "fitness-motivation", slug: "fitness-motivation", name: "Fitness Motivation", sort_order: 90 },
  { id: "business-motivation", slug: "business-motivation", name: "Business Motivation", sort_order: 100 },
  { id: "mindset", slug: "mindset", name: "Mindset", sort_order: 110 },
  { id: "speeches", slug: "speeches", name: "Speeches", sort_order: 120 },
  { id: "life-lessons", slug: "life-lessons", name: "Life Lessons", sort_order: 130 },
  { id: "short-motivationals", slug: "short-motivationals", name: "Short Motivationals", sort_order: 140 },
] as const;

export const MOTIVATION_TARGET_ITEMS = 5000;
export const MOTIVATION_RELIABILITY_THRESHOLD = 60;

export type MotivationPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type MotivationPublicListItem = MotivationPublicItem & {
  slug: string | null;
  category_slug: string | null;
  categories: string[];
  speaker_name: string | null;
  published_at: string | null;
};

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

export function toMotivationPublicItem(row: Record<string, unknown>): MotivationPublicListItem {
  const tags = Array.isArray(row.tags)
    ? row.tags
        .map((tag) => cleanText(tag, 120))
        .filter((tag): tag is string => Boolean(tag))
    : [];
  const categories = Array.isArray(row.categories)
    ? row.categories
        .map((entry) => cleanText(entry, 80))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  return {
    id: String(row.id || ""),
    slug: cleanText(row.slug, 160),
    title: String(row.title || "Untitled"),
    description: cleanText(row.description, 2000),
    artwork: cleanText(row.thumbnail_url, 2000),
    channel_name: cleanText(row.channel_name, 200),
    speaker_name: cleanText(row.speaker_name, 200) || cleanText(row.channel_name, 200),
    category: cleanText(row.category, 120),
    subcategory: cleanText(row.subcategory, 120),
    category_slug: cleanText(row.category_slug, 120),
    categories,
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
    published_at: cleanText(row.published_at, 40),
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

export function buildMotivationPagination(
  page: number,
  limit: number,
  total: number
): MotivationPagination {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

export function cleanMotivationFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

export function serializeMotivationError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) {
    return { message: error.message || "Unknown error.", name: error.name };
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message:
        typeof record.message === "string" && record.message.trim()
          ? record.message
          : "Unknown database error.",
      code: record.code || null,
      details: record.details || null,
      hint: record.hint || null,
    };
  }
  return String(error);
}

export function jsonMotivationError(error: string, status: number, details?: unknown) {
  if (details) {
    console.error("[motivation]", error, serializeMotivationError(details));
  }
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

function encodeCategoryToken(category: string) {
  const needsQuotes = /[^a-zA-Z0-9_]/.test(category);
  return needsQuotes
    ? `"${category.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : category;
}

export function buildMotivationCategoryOrFilter(categorySlug: string) {
  const encoded = encodeCategoryToken(categorySlug);
  const categoryName =
    MOTIVATION_CATEGORIES.find((entry) => entry.slug === categorySlug)?.name ||
    categorySlug;
  return `category_slug.eq.${encoded},categories.cs.{${encoded}},category.ilike.${escapeIlikePattern(categoryName)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPublicMotivationFilters(query: any, options: {
  categorySlug?: string | null;
  searchQuery?: string | null;
  featuredOnly?: boolean;
}) {
  let next = query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("is_mature", false)
    .gte("reliability_score", MOTIVATION_RELIABILITY_THRESHOLD);

  if (options.featuredOnly) next = next.eq("is_featured", true);

  if (options.categorySlug) {
    next = next.or(buildMotivationCategoryOrFilter(options.categorySlug));
  }

  if (options.searchQuery) {
    const escaped = escapeIlikePattern(options.searchQuery);
    next = next.or(
      `title.ilike.%${escaped}%,speaker_name.ilike.%${escaped}%,channel_name.ilike.%${escaped}%,description.ilike.%${escaped}%`
    );
  }

  return next;
}

export async function listMotivationItems(options: {
  page: number;
  limit: number;
  categorySlug?: string | null;
  searchQuery?: string | null;
  featuredOnly?: boolean;
}) {
  const from = (options.page - 1) * options.limit;
  const to = from + options.limit - 1;

  let query = supabaseAdmin
    .from("motivation_items")
    .select(MOTIVATION_PUBLIC_SELECT, { count: "exact" })
    .order("sort_order", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  query = applyPublicMotivationFilters(query, options);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    items: ((data || []) as Record<string, unknown>[]).map(toMotivationPublicItem),
    pagination: buildMotivationPagination(options.page, options.limit, count || 0),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidMotivationUuid(value: string) {
  return UUID_RE.test(String(value || "").trim());
}

export type MotivationPlayResolution =
  | {
      ok: true;
      id: string;
      source_type: string;
      source_id: string;
      media_type: string;
      stream_url: string;
      embed_url: string | null;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 415 | 422 | 500;
      error: string;
    };

const MOTIVATION_SUPPORTED_PLAY_MEDIA = new Set(["audio", "video", "stream", "embed"]);

function isPromotedMotivationItem(row: {
  status?: string | null;
  is_active?: boolean | null;
  is_verified?: boolean | null;
  playback_status?: string | null;
  reliability_score?: number | null;
}) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.is_verified === true &&
    row.playback_status === "playable" &&
    Number(row.reliability_score ?? 100) >= MOTIVATION_RELIABILITY_THRESHOLD
  );
}

export async function resolveMotivationPlayback(itemId: string): Promise<MotivationPlayResolution> {
  const cleaned = String(itemId || "").trim();
  if (!cleaned) {
    return { ok: false, status: 400, error: "Motivation item id is required." };
  }
  if (!isValidMotivationUuid(cleaned)) {
    return { ok: false, status: 400, error: "Invalid motivation item ID." };
  }

  const { data: item, error: itemError } = await supabaseAdmin
    .from("motivation_items")
    .select(
      "id, source_type, source_id, embed_url, status, is_active, is_verified, playback_status, reliability_score, is_mature"
    )
    .eq("id", cleaned)
    .maybeSingle();

  if (itemError) {
    console.error("[motivation] play item load failed", serializeMotivationError(itemError));
    return { ok: false, status: 500, error: "Failed to load motivation play URL." };
  }

  if (!item || !isPromotedMotivationItem(item)) {
    return {
      ok: false,
      status: 404,
      error: "Motivation item not found or not currently playable.",
    };
  }

  if ((item as { is_mature?: boolean }).is_mature === true) {
    return {
      ok: false,
      status: 403,
      error: "Mature motivation playback requires age confirmation.",
    };
  }

  const { data: file, error: fileError } = await supabaseAdmin
    .from("motivation_files")
    .select("id, audio_url, video_url, media_type, playback_status, is_active, is_primary")
    .eq("item_id", cleaned)
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("is_primary", true)
    .maybeSingle();

  if (fileError) {
    console.error("[motivation] play file load failed", serializeMotivationError(fileError));
    return { ok: false, status: 500, error: "Failed to load motivation play URL." };
  }

  if (!file) {
    return { ok: false, status: 404, error: "Motivation media is unavailable." };
  }

  const mediaType = String(file.media_type || "").trim().toLowerCase();
  if (!MOTIVATION_SUPPORTED_PLAY_MEDIA.has(mediaType)) {
    return { ok: false, status: 415, error: "Motivation media type is not supported." };
  }

  const streamUrl =
    mediaType === "audio"
      ? String(file.audio_url || "").trim()
      : mediaType === "video" || mediaType === "stream"
        ? String(file.video_url || file.audio_url || "").trim()
        : "";

  if (mediaType !== "embed" && !streamUrl) {
    return { ok: false, status: 404, error: "Motivation media is unavailable." };
  }

  return {
    ok: true,
    id: cleaned,
    source_type: String(item.source_type || ""),
    source_id: String(item.source_id || ""),
    media_type: mediaType,
    stream_url: streamUrl,
    embed_url: cleanText((item as { embed_url?: string | null }).embed_url, 2000) || null,
  };
}

export async function loadMotivationDetail(idParam: string) {
  const cleaned = String(idParam || "").trim();
  if (!cleaned) return null;

  let query = applyPublicMotivationFilters(
    supabaseAdmin.from("motivation_items").select(MOTIVATION_PUBLIC_SELECT),
    {}
  );

  query = isValidMotivationUuid(cleaned) ? query.eq("id", cleaned) : query.eq("slug", cleaned);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return toMotivationPublicItem(data as Record<string, unknown>);
}

export async function countMotivationItemsForCategory(categorySlug: string) {
  const query = applyPublicMotivationFilters(
    supabaseAdmin.from("motivation_items").select("id", { count: "exact", head: true }),
    { categorySlug }
  );
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function listMotivationCategories() {
  const { data, error } = await supabaseAdmin
    .from("motivation_categories")
    .select("id, name, slug, description, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const rows = [];
  for (const row of data || []) {
    const slug = String(row.slug || "");
    rows.push({
      id: String(row.id || slug),
      slug,
      name: String(row.name || slug),
      title: String(row.name || slug),
      subtitle: cleanText(row.description, 200) || "Hidden Tunes Motivation",
      description: cleanText(row.description, 500),
      sort_order: Number(row.sort_order || 0),
      item_count: slug ? await countMotivationItemsForCategory(slug) : 0,
    });
  }

  return rows;
}

export function resolveMotivationCategoryName(slug: string) {
  return (
    MOTIVATION_CATEGORIES.find((entry) => entry.slug === slug)?.name ||
    slug.replace(/-/g, " ")
  );
}

const LEGACY_CATEGORY_SLUG_MAP: Record<string, string> = {
  motivation: "daily-motivation",
  "motivational speeches": "speeches",
  "self-improvement": "mindset",
  "business motivation": "business-motivation",
  "gym motivation": "fitness-motivation",
  "study motivation": "study-motivation",
  "faith motivation": "faith-purpose",
  "success stories": "life-lessons",
  "emotional worlds": "healing",
  discipline: "discipline",
  focus: "focus",
  mindset: "mindset",
};

export function resolveMotivationCategorySlug(
  category?: string | null,
  subcategory?: string | null
) {
  const raw = String(subcategory || category || "Motivation").trim().toLowerCase();
  if (LEGACY_CATEGORY_SLUG_MAP[raw]) return LEGACY_CATEGORY_SLUG_MAP[raw];
  const canonical = MOTIVATION_CATEGORIES.find(
    (entry) => entry.slug === raw || entry.name.toLowerCase() === raw
  );
  if (canonical) return canonical.slug;
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function buildMotivationItemSlug(title: string, sourceId: string) {
  const base = String(title || "motivation")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${base || "motivation"}-${String(sourceId || "item").slice(0, 12)}`;
}
