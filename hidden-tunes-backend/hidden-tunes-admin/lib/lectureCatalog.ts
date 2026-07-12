import { cleanText, parsePositiveInt } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const LECTURE_DEFAULT_PAGE_SIZE = 40;
export const LECTURE_MAX_PAGE_SIZE = 40;

export const LECTURE_CATEGORIES = [
  { id: "business", slug: "business", name: "Business", sort_order: 10 },
  { id: "programming", slug: "programming", name: "Programming", sort_order: 20 },
  { id: "design", slug: "design", name: "Design", sort_order: 30 },
  {
    id: "music-production",
    slug: "music-production",
    name: "Music Production",
    sort_order: 40,
  },
  {
    id: "language-learning",
    slug: "language-learning",
    name: "Language Learning",
    sort_order: 50,
  },
  { id: "study-skills", slug: "study-skills", name: "Study Skills", sort_order: 60 },
  {
    id: "personal-finance",
    slug: "personal-finance",
    name: "Personal Finance",
    sort_order: 70,
  },
  {
    id: "entrepreneurship",
    slug: "entrepreneurship",
    name: "Entrepreneurship",
    sort_order: 80,
  },
  { id: "marketing", slug: "marketing", name: "Marketing", sort_order: 90 },
  { id: "productivity", slug: "productivity", name: "Productivity", sort_order: 100 },
  {
    id: "health-education",
    slug: "health-education",
    name: "Health Education",
    sort_order: 110,
  },
  {
    id: "faith-teaching",
    slug: "faith-teaching",
    name: "Faith Teaching",
    sort_order: 120,
  },
  {
    id: "academic-lectures",
    slug: "academic-lectures",
    name: "Academic Lectures",
    sort_order: 130,
  },
  { id: "tutorials", slug: "tutorials", name: "Tutorials", sort_order: 140 },
] as const;

export const LECTURE_PUBLIC_LIST_SELECT =
  "id, slug, title, subtitle, description, instructor_name, speaker_name, creator_name, category_slug, categories, topic_tags, difficulty, lesson_count, duration_seconds, artwork_url, cover_url, language, source_type, rights, is_featured, is_verified, published_at, created_at";

export const LECTURE_FILE_PUBLIC_SELECT =
  "id, item_id, title, lesson_number, media_type, mime_type, duration_seconds, is_primary, created_at";

export const LECTURE_PLAY_SELECT =
  "id, item_id, title, lesson_number, audio_url, video_url, media_type, mime_type, duration_seconds, is_primary, playback_status";

export type LecturePagination = {
  page: number;
  limit: number;
  total?: number | null;
  totalPages?: number | null;
  hasMore: boolean;
};

export type LecturePublicItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  instructor_name: string | null;
  speaker_name: string | null;
  creator_name: string | null;
  category_slug: string | null;
  categories: string[];
  topic_tags: string[];
  difficulty: string | null;
  lesson_count: number;
  duration_seconds: number | null;
  artwork_url: string | null;
  cover_url: string | null;
  language: string | null;
  source_type: string | null;
  rights: string | null;
  is_featured: boolean;
  is_verified: boolean;
  published_at: string | null;
  created_at: string | null;
};

export type LecturePublicFile = {
  id: string;
  item_id: string;
  title: string | null;
  lesson_number: number | null;
  media_type: string | null;
  mime_type: string | null;
  duration_seconds: number | null;
  is_primary: boolean;
  created_at: string | null;
};

export function parseLecturePage(value: string | null) {
  return parsePositiveInt(value, 1, 10_000);
}

export function parseLectureLimit(value: string | null) {
  return parsePositiveInt(value, LECTURE_DEFAULT_PAGE_SIZE, LECTURE_MAX_PAGE_SIZE);
}

export function buildLecturePagination(
  page: number,
  limit: number,
  total: number | null,
  hasMore?: boolean
): LecturePagination {
  const totalPages = typeof total === "number" && total > 0 ? Math.ceil(total / limit) : null;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: typeof hasMore === "boolean" ? hasMore : Boolean(totalPages && page < totalPages),
  };
}

export function cleanLectureFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

export function serializeLectureError(error: unknown) {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      message: error.message || "Unknown error.",
      name: error.name,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === "string" && record.message.trim()
        ? record.message
        : typeof record.error_description === "string"
          ? record.error_description
          : "Unknown database error.";

    return {
      message,
      code: record.code || null,
      details: record.details || null,
      hint: record.hint || null,
    };
  }

  return String(error);
}

export function logLectureError(context: string, error: unknown) {
  console.error(`[lectures] ${context}`, serializeLectureError(error));
}

export function jsonLectureError(error: string, status: number, details?: unknown) {
  return Response.json(
    {
      success: false,
      error,
      details: serializeLectureError(details),
    },
    { status }
  );
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => cleanText(entry, 80)).filter(Boolean) as string[];
}

function parseOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toLecturePublicItem(row: Record<string, unknown>): LecturePublicItem {
  return {
    id: String(row.id || ""),
    slug: String(row.slug || "").trim(),
    title: String(row.title || "Untitled"),
    subtitle: cleanText(row.subtitle, 300),
    description: cleanText(row.description, 1600),
    instructor_name: cleanText(row.instructor_name, 200),
    speaker_name: cleanText(row.speaker_name, 200),
    creator_name: cleanText(row.creator_name, 200),
    category_slug: cleanText(row.category_slug, 120),
    categories: normalizeStringArray(row.categories),
    topic_tags: normalizeStringArray(row.topic_tags),
    difficulty: cleanText(row.difficulty, 80),
    lesson_count: Math.max(0, Number(row.lesson_count || 0)),
    duration_seconds: parseOptionalNumber(row.duration_seconds),
    artwork_url: cleanText(row.artwork_url, 2000),
    cover_url: cleanText(row.cover_url, 2000),
    language: cleanText(row.language, 40),
    source_type: cleanText(row.source_type, 80),
    rights: cleanText(row.rights, 200),
    is_featured: Boolean(row.is_featured),
    is_verified: Boolean(row.is_verified),
    published_at: cleanText(row.published_at, 40),
    created_at: cleanText(row.created_at, 40),
  };
}

export function toLecturePublicFile(row: Record<string, unknown>): LecturePublicFile {
  return {
    id: String(row.id || ""),
    item_id: String(row.item_id || ""),
    title: cleanText(row.title, 300),
    lesson_number: parseOptionalNumber(row.lesson_number),
    media_type: cleanText(row.media_type, 40),
    mime_type: cleanText(row.mime_type, 120),
    duration_seconds: parseOptionalNumber(row.duration_seconds),
    is_primary: Boolean(row.is_primary),
    created_at: cleanText(row.created_at, 40),
  };
}

function dedupeKey(item: LecturePublicItem) {
  return `${item.slug || item.id}:${item.title.toLowerCase()}:${String(
    item.instructor_name || item.speaker_name || item.creator_name || ""
  ).toLowerCase()}`;
}

export function dedupeLectures(items: LecturePublicItem[]) {
  const seen = new Set<string>();
  const deduped: LecturePublicItem[] = [];

  for (const item of items) {
    const key = dedupeKey(item);
    if (seen.has(item.id) || seen.has(key)) continue;
    seen.add(item.id);
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function isPlayableLectureUrl(value: unknown) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPublicLectureFilters(query: any, options: {
  category?: string | null;
  searchQuery?: string | null;
}) {
  let next = query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable")
    .eq("is_verified", true)
    .eq("is_mature", false);

  if (options.category) {
    const category = options.category;
    next = next.or(`category_slug.eq.${category},categories.cs.{${category}}`);
  }

  if (options.searchQuery) {
    const escaped = escapeIlikePattern(options.searchQuery);
    next = next.or(
      `title.ilike.%${escaped}%,subtitle.ilike.%${escaped}%,description.ilike.%${escaped}%,instructor_name.ilike.%${escaped}%,speaker_name.ilike.%${escaped}%,creator_name.ilike.%${escaped}%`
    );
  }

  return next;
}

export async function searchLectureItems(options: {
  q?: string | null;
  page: number;
  limit: number;
  categorySlug?: string | null;
}) {
  const from = (options.page - 1) * options.limit;
  const to = from + options.limit;

  let query = supabaseAdmin
    .from("lecture_items")
    .select(LECTURE_PUBLIC_LIST_SELECT)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  query = applyPublicLectureFilters(query, {
    category: options.categorySlug || null,
    searchQuery: options.q || null,
  });

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const rows = ((data || []) as Record<string, unknown>[]).slice(0, options.limit);
  const hasMore = (data || []).length > options.limit;
  const items = dedupeLectures(
    rows.map(toLecturePublicItem)
  );

  return {
    items,
    pagination: buildLecturePagination(options.page, options.limit, null, hasMore),
  };
}

export async function listLectureItemsByCategory(options: {
  slug: string;
  page: number;
  limit: number;
}) {
  return searchLectureItems({
    page: options.page,
    limit: options.limit,
    categorySlug: options.slug,
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getLectureItemById(
  idOrSlug: string,
  options?: { page?: number; limit?: number }
) {
  const cleaned = String(idOrSlug || "").trim();
  if (!cleaned) return null;

  let query = supabaseAdmin
    .from("lecture_items")
    .select(LECTURE_PUBLIC_LIST_SELECT)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable")
    .eq("is_verified", true)
    .eq("is_mature", false);

  query = UUID_RE.test(cleaned) ? query.eq("id", cleaned) : query.eq("slug", cleaned);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const lecture = toLecturePublicItem(data as Record<string, unknown>);
  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(
    LECTURE_MAX_PAGE_SIZE,
    Math.max(1, Number(options?.limit || LECTURE_DEFAULT_PAGE_SIZE))
  );
  const offset = (page - 1) * limit;

  const { data: files, error: fileError } = await supabaseAdmin
    .from("lecture_files")
    .select(LECTURE_FILE_PUBLIC_SELECT)
    .eq("item_id", lecture.id)
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable")
    .order("lesson_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit);

  if (fileError) throw fileError;

  const visibleFiles = ((files || []) as Record<string, unknown>[]).slice(0, limit);
  const hasMore = (files || []).length > limit;

  return {
    lecture,
    lessons: visibleFiles.map(toLecturePublicFile),
    pagination: buildLecturePagination(page, limit, null, hasMore),
  };
}

function buildLecturePlayableMedia(row: Record<string, unknown>) {
  const audioUrl = isPlayableLectureUrl(row.audio_url);
  const videoUrl = isPlayableLectureUrl(row.video_url);
  if (!audioUrl && !videoUrl) return null;

  return {
    id: String(row.id || ""),
    item_id: String(row.item_id || ""),
    title: cleanText(row.title, 300),
    lesson_number: parseOptionalNumber(row.lesson_number),
    media_type: cleanText(row.media_type, 40) || (audioUrl ? "audio" : "video"),
    audio_url: audioUrl,
    video_url: videoUrl,
    mime_type: cleanText(row.mime_type, 120),
    duration_seconds: parseOptionalNumber(row.duration_seconds),
  };
}

export async function getLecturePlayableItem(idOrSlug: string, lessonId?: string | null) {
  const cleanedLessonId = String(lessonId || "").trim();
  const detail = await getLectureItemById(idOrSlug, { page: 1, limit: 1 });
  if (!detail) return null;

  if (cleanedLessonId) {
    if (!UUID_RE.test(cleanedLessonId)) {
      return { ...detail, media: null };
    }

    const { data, error } = await supabaseAdmin
      .from("lecture_files")
      .select(LECTURE_PLAY_SELECT)
      .eq("id", cleanedLessonId)
      .eq("item_id", detail.lecture.id)
      .eq("is_active", true)
      .eq("is_verified", true)
      .eq("playback_status", "playable")
      .eq("playable_status", "playable")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { ...detail, media: null };

    const media = buildLecturePlayableMedia(data as Record<string, unknown>);
    return { ...detail, media };
  }

  const { data, error } = await supabaseAdmin
    .from("lecture_files")
    .select(LECTURE_PLAY_SELECT)
    .eq("item_id", detail.lecture.id)
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("playable_status", "playable")
    .order("is_primary", { ascending: false })
    .order("lesson_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...detail, media: null };

  const media = buildLecturePlayableMedia(data as Record<string, unknown>);
  return { ...detail, media };
}

export async function countLecturesForCategory(slug: string) {
  const query = await applyPublicLectureFilters(
    supabaseAdmin.from("lecture_items").select("id", { count: "exact", head: true }),
    { category: slug }
  );
  const { count, error } = await query;

  if (error) throw error;
  return count || 0;
}

export async function listLectureCategories() {
  return LECTURE_CATEGORIES.map((category) => ({
    ...category,
    title: category.name,
  }));
}
