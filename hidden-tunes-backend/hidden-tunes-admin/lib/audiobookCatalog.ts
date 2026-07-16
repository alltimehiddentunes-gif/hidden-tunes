import { cleanText, parsePositiveInt } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanAudiobookDescription } from "@/lib/audiobookDescriptionSanitizer";

export const AUDIOBOOK_DEFAULT_PAGE_SIZE = 40;
export const AUDIOBOOK_MAX_PAGE_SIZE = 40;

export const AUDIOBOOK_CATEGORIES = [
  { id: "fiction", slug: "fiction", name: "Fiction", sort_order: 10 },
  { id: "classics", slug: "classics", name: "Classics", sort_order: 20 },
  { id: "biography", slug: "biography", name: "Biography", sort_order: 30 },
  { id: "children", slug: "children", name: "Children", sort_order: 40 },
  { id: "history", slug: "history", name: "History", sort_order: 50 },
  { id: "poetry", slug: "poetry", name: "Poetry", sort_order: 60 },
  { id: "philosophy", slug: "philosophy", name: "Philosophy", sort_order: 70 },
  { id: "science", slug: "science", name: "Science", sort_order: 80 },
  { id: "religion", slug: "religion", name: "Religion", sort_order: 90 },
  { id: "drama", slug: "drama", name: "Drama", sort_order: 100 },
  { id: "mystery", slug: "mystery", name: "Mystery", sort_order: 110 },
  { id: "adventure", slug: "adventure", name: "Adventure", sort_order: 120 },
  { id: "education", slug: "education", name: "Education", sort_order: 130 },
  { id: "language", slug: "language", name: "Language", sort_order: 140 },
  { id: "short-stories", slug: "short-stories", name: "Short Stories", sort_order: 150 },
  { id: "non-fiction", slug: "non-fiction", name: "Non-fiction", sort_order: 160 },
  { id: "mature", slug: "mature", name: "Mature", sort_order: 900 },
] as const;

export const AUDIOBOOK_PUBLIC_LIST_SELECT =
  "id, slug, title, subtitle, description, cover_url, author_name, narrator_name, series_title, series_position, category_slug, categories, language, publisher, duration_seconds, chapter_count, is_featured, is_verified, published_at, created_at";

export const AUDIOBOOK_CHAPTER_PUBLIC_SELECT =
  "id, audiobook_id, title, description, chapter_number, duration_seconds, published_at, created_at";

export const AUDIOBOOK_PLAY_SELECT =
  "id, audiobook_id, title, audio_url, duration_seconds, format, mime_type, bitrate, is_primary, playback_status";

export type AudiobookPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  nextCursor?: string | null;
};

type AudiobookCursorPayload = {
  published_at: string | null;
  created_at: string | null;
  id: string;
};

export type AudiobookPublicItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_url: string | null;
  author_name: string | null;
  narrator_name: string | null;
  series_title: string | null;
  series_position: number | null;
  category_slug: string | null;
  categories: string[];
  language: string | null;
  publisher: string | null;
  duration_seconds: number | null;
  chapter_count: number;
  is_featured: boolean;
  is_verified: boolean;
  published_at: string | null;
  created_at: string | null;
};

export type AudiobookPublicChapter = {
  id: string;
  audiobook_id: string;
  title: string;
  description: string | null;
  chapter_number: number | null;
  duration_seconds: number | null;
  published_at: string | null;
  created_at: string | null;
};

export type AudiobookChapterPlayItem = AudiobookPublicChapter & {
  audio_url: string;
  file?: {
    id: string;
    audiobook_id: string;
    chapter_id: string | null;
    title: string | null;
    audio_url: string;
    duration_seconds: number | null;
    format: string | null;
    mime_type: string | null;
    bitrate: number | null;
  };
};

export function parseAudiobookPage(value: string | null) {
  return parsePositiveInt(value, 1, 10_000);
}

export function parseAudiobookLimit(value: string | null) {
  return parsePositiveInt(
    value,
    AUDIOBOOK_DEFAULT_PAGE_SIZE,
    AUDIOBOOK_MAX_PAGE_SIZE
  );
}

export function buildAudiobookPagination(
  page: number,
  limit: number,
  total: number,
  nextCursor?: string | null
): AudiobookPagination {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: nextCursor ? true : page < totalPages,
    nextCursor: nextCursor ?? null,
  };
}

export function encodeAudiobookCursor(payload: AudiobookCursorPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeAudiobookCursor(cursor: string | null | undefined) {
  const cleaned = cleanText(cursor, 500);
  if (!cleaned) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cleaned, "base64url").toString("utf8")
    ) as AudiobookCursorPayload;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildAudiobookNextCursor(items: AudiobookPublicItem[]) {
  const last = items[items.length - 1];
  if (!last) return null;
  return encodeAudiobookCursor({
    published_at: last.published_at,
    created_at: last.created_at,
    id: last.id,
  });
}

export function cleanAudiobookFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

export function serializeAudiobookError(error: unknown) {
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
      schema_mode: record.schema_mode || null,
    };
  }

  return String(error);
}

export function logAudiobookError(context: string, error: unknown) {
  console.error(`[audiobooks] ${context}`, serializeAudiobookError(error));
}

export function jsonAudiobookError(error: string, status: number, details?: unknown) {
  return Response.json(
    {
      success: false,
      error,
      details: serializeAudiobookError(details),
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

export function toAudiobookPublicItem(
  row: Record<string, unknown>
): AudiobookPublicItem {
  return {
    id: String(row.id || ""),
    slug: String(row.slug || "").trim(),
    title: String(row.title || "Untitled"),
    subtitle: cleanText(row.subtitle, 300),
    description: cleanAudiobookDescription(row.description),
    cover_url: cleanText(row.cover_url, 2000),
    author_name: cleanText(row.author_name, 200),
    narrator_name: cleanText(row.narrator_name, 200),
    series_title: cleanText(row.series_title, 200),
    series_position: parseOptionalNumber(row.series_position),
    category_slug: cleanText(row.category_slug, 120),
    categories: normalizeStringArray(row.categories),
    language: cleanText(row.language, 40),
    publisher: cleanText(row.publisher, 200),
    duration_seconds: parseOptionalNumber(row.duration_seconds),
    chapter_count: Math.max(0, Number(row.chapter_count || 0)),
    is_featured: Boolean(row.is_featured),
    is_verified: Boolean(row.is_verified),
    published_at: cleanText(row.published_at, 40),
    created_at: cleanText(row.created_at, 40),
  };
}

export function toAudiobookPublicChapter(
  row: Record<string, unknown>
): AudiobookPublicChapter {
  return {
    id: String(row.id || ""),
    audiobook_id: String(row.audiobook_id || ""),
    title: String(row.title || "Untitled"),
    description: cleanAudiobookDescription(row.description),
    chapter_number: parseOptionalNumber(row.chapter_number),
    duration_seconds: parseOptionalNumber(row.duration_seconds),
    published_at: cleanText(row.published_at, 40),
    created_at: cleanText(row.created_at, 40),
  };
}

function dedupeKey(item: AudiobookPublicItem) {
  return `${item.slug || item.id}:${item.title.toLowerCase()}:${String(
    item.author_name || ""
  ).toLowerCase()}`;
}

export function dedupeAudiobooks(items: AudiobookPublicItem[]) {
  const seen = new Set<string>();
  const deduped: AudiobookPublicItem[] = [];

  for (const item of items) {
    const key = dedupeKey(item);
    if (seen.has(item.id) || seen.has(key)) continue;
    seen.add(item.id);
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function isPlayableAudiobookAudioUrl(value: unknown) {
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
export function applyPublicAudiobookFilters(query: any, options: {
  category?: string | null;
  searchQuery?: string | null;
  language?: string | null;
  author?: string | null;
  narrator?: string | null;
  completeOnly?: boolean;
  mature: boolean;
}) {
  let next = query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("is_mature", options.mature);

  if (options.category) {
    const category = options.category;
    next = next.or(`category_slug.eq.${category},categories.cs.{${category}}`);
  }

  if (options.searchQuery) {
    const escaped = escapeIlikePattern(options.searchQuery);
    next = next.or(
      `title.ilike.%${escaped}%,subtitle.ilike.%${escaped}%,description.ilike.%${escaped}%,author_name.ilike.%${escaped}%,narrator_name.ilike.%${escaped}%`
    );
  }

  if (options.language) {
    next = next.ilike("language", `%${escapeIlikePattern(options.language)}%`);
  }

  if (options.author) {
    next = next.ilike("author_name", `%${escapeIlikePattern(options.author)}%`);
  }

  if (options.narrator) {
    next = next.ilike("narrator_name", `%${escapeIlikePattern(options.narrator)}%`);
  }

  if (options.completeOnly) {
    next = next.eq("is_complete", true);
  }

  return next;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAudiobookCursorFilter(query: any, cursor: AudiobookCursorPayload | null) {
  if (!cursor) return query;
  const publishedAt = cursor.published_at || "1970-01-01T00:00:00.000Z";
  const createdAt = cursor.created_at || publishedAt;
  return query.or(
    `published_at.lt.${publishedAt},and(published_at.eq.${publishedAt},created_at.lt.${createdAt}),and(published_at.eq.${publishedAt},created_at.eq.${createdAt},id.lt.${cursor.id})`
  );
}

export async function listAudiobooks(options: {
  page: number;
  limit: number;
  cursor?: string | null;
  category?: string | null;
  searchQuery?: string | null;
  language?: string | null;
  author?: string | null;
  narrator?: string | null;
  completeOnly?: boolean;
  includeTotal?: boolean;
  mature: boolean;
}) {
  const cursorPayload = decodeAudiobookCursor(options.cursor);
  const useCursor = Boolean(cursorPayload);
  const fetchLimit = options.limit + 1;

  let query = supabaseAdmin
    .from("audiobooks")
    .select(
      AUDIOBOOK_PUBLIC_LIST_SELECT,
      options.includeTotal === true ? { count: "exact" } : undefined
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  query = applyPublicAudiobookFilters(query, options);
  query = applyAudiobookCursorFilter(query, cursorPayload);

  if (useCursor) {
    query = query.limit(fetchLimit);
  } else {
    const from = (options.page - 1) * options.limit;
    const to = from + fetchLimit - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const mapped = dedupeAudiobooks(
    ((data || []) as Record<string, unknown>[]).map(toAudiobookPublicItem)
  );
  const hasMore = mapped.length > options.limit;
  const items = hasMore ? mapped.slice(0, options.limit) : mapped;
  const nextCursor = hasMore ? buildAudiobookNextCursor(items) : null;

  return {
    items,
    pagination: {
      ...buildAudiobookPagination(
        options.page,
        options.limit,
        count || 0,
        nextCursor
      ),
      hasMore: Boolean(nextCursor),
    },
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadAudiobookDetail(
  idParam: string,
  mature: boolean,
  options?: { chapterLimit?: number; chapterCursor?: string | null }
) {
  const cleaned = String(idParam || "").trim();
  if (!cleaned) return null;

  let query = supabaseAdmin
    .from("audiobooks")
    .select(AUDIOBOOK_PUBLIC_LIST_SELECT)
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .eq("is_mature", mature);

  query = UUID_RE.test(cleaned) ? query.eq("id", cleaned) : query.eq("slug", cleaned);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const audiobook = toAudiobookPublicItem(data as Record<string, unknown>);
  const chapterLimit = Math.max(
    1,
    Math.min(AUDIOBOOK_MAX_PAGE_SIZE, Number(options?.chapterLimit || AUDIOBOOK_DEFAULT_PAGE_SIZE))
  );
  const chapterOffset = Math.max(0, Number(options?.chapterCursor || 0));
  const fetchChapterLimit = chapterLimit + 1;

  const chapterQuery = supabaseAdmin
    .from("audiobook_chapters")
    .select(AUDIOBOOK_CHAPTER_PUBLIC_SELECT)
    .eq("audiobook_id", audiobook.id)
    .eq("is_active", true)
    .order("chapter_number", { ascending: true })
    .order("created_at", { ascending: true })
    .range(chapterOffset, chapterOffset + fetchChapterLimit - 1);

  const { data: chapters, error: chapterError } = await chapterQuery;
  if (chapterError) throw chapterError;

  const chapterItems = ((chapters || []) as Record<string, unknown>[]).map(
    toAudiobookPublicChapter
  );
  const hasMoreChapters = chapterItems.length > chapterLimit;
  const trimmedChapters = hasMoreChapters
    ? chapterItems.slice(0, chapterLimit)
    : chapterItems;
  const nextChapterCursor = hasMoreChapters
    ? String(chapterOffset + chapterLimit)
    : null;

  return {
    audiobook,
    chapters: trimmedChapters,
    chapterPagination: {
      limit: chapterLimit,
      offset: chapterOffset,
      hasMore: hasMoreChapters,
      nextCursor: nextChapterCursor,
    },
  };
}

function toAudiobookPlayFile(row: Record<string, unknown>) {
  const audioUrl = isPlayableAudiobookAudioUrl(row.audio_url);
  if (!audioUrl) return null;

  return {
    id: String(row.id || ""),
    audiobook_id: String(row.audiobook_id || ""),
    chapter_id: cleanText(row.chapter_id, 120),
    title: cleanText(row.title, 300),
    audio_url: audioUrl,
    duration_seconds: parseOptionalNumber(row.duration_seconds),
    format: cleanText(row.format, 80),
    mime_type: cleanText(row.mime_type, 120),
    bitrate: parseOptionalNumber(row.bitrate),
  };
}

export async function loadAudiobookChapterQueuePlayback(
  idParam: string,
  fromChapterId: string,
  mature: boolean
) {
  const detail = await loadAudiobookDetail(idParam, mature);
  if (!detail) return null;

  const fromId = cleanText(fromChapterId, 120);
  if (!fromId) return null;

  const fromIndex = detail.chapters.findIndex((chapter) => chapter.id === fromId);
  if (fromIndex < 0) return null;

  const remaining = detail.chapters.slice(fromIndex);
  const chapterIds = remaining.map((chapter) => chapter.id);
  if (!chapterIds.length) {
    return {
      audiobook: detail.audiobook,
      from_chapter_id: fromId,
      start_index: fromIndex,
      chapters: [] as AudiobookChapterPlayItem[],
    };
  }

  const { data, error } = await supabaseAdmin
    .from("audiobook_files")
    .select(`${AUDIOBOOK_PLAY_SELECT}, chapter_id`)
    .eq("audiobook_id", detail.audiobook.id)
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .in("chapter_id", chapterIds)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const filesByChapter = new Map<string, ReturnType<typeof toAudiobookPlayFile>>();
  for (const row of (data || []) as Record<string, unknown>[]) {
    const chapterId = cleanText(row.chapter_id, 120);
    if (!chapterId || filesByChapter.has(chapterId)) continue;
    const file = toAudiobookPlayFile(row);
    if (file) filesByChapter.set(chapterId, file);
  }

  const chapters: AudiobookChapterPlayItem[] = [];
  for (const chapter of remaining) {
    const file = filesByChapter.get(chapter.id);
    if (!file) continue;
    chapters.push({
      ...chapter,
      duration_seconds: chapter.duration_seconds ?? file.duration_seconds,
      audio_url: file.audio_url,
      file,
    });
  }

  return {
    audiobook: detail.audiobook,
    from_chapter_id: fromId,
    start_index: fromIndex,
    chapters,
  };
}

export async function loadAudiobookPlayback(idParam: string, mature: boolean) {
  const detail = await loadAudiobookDetail(idParam, mature);
  if (!detail) return null;

  const { data, error } = await supabaseAdmin
    .from("audiobook_files")
    .select(AUDIOBOOK_PLAY_SELECT)
    .eq("audiobook_id", detail.audiobook.id)
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...detail, file: null };

  const row = data as Record<string, unknown>;
  const audioUrl = isPlayableAudiobookAudioUrl(row.audio_url);

  return {
    ...detail,
    file: audioUrl
      ? {
          id: String(row.id || ""),
          audiobook_id: String(row.audiobook_id || ""),
          title: cleanText(row.title, 300),
          audio_url: audioUrl,
          duration_seconds: parseOptionalNumber(row.duration_seconds),
          format: cleanText(row.format, 80),
          mime_type: cleanText(row.mime_type, 120),
          bitrate: parseOptionalNumber(row.bitrate),
        }
      : null,
  };
}

export async function countAudiobooksForCategory(slug: string, mature: boolean) {
  const query = await applyPublicAudiobookFilters(
    supabaseAdmin.from("audiobooks").select("id", { count: "exact", head: true }),
    { category: slug, mature }
  );
  const { count, error } = await query;

  if (error) throw error;
  return count || 0;
}

export async function listAudiobookCategories(mature: boolean) {
  const categories = mature
    ? AUDIOBOOK_CATEGORIES
    : AUDIOBOOK_CATEGORIES.filter((category) => category.slug !== "mature");

  // Avoid sequential exact COUNT(*) queries per category on browse/tree.
  // Those saturates PostgREST on large catalogs. Category pages still apply
  // the real filters when opened; item_count remains informational.
  return categories.map((category) => ({
    ...category,
    title: category.name,
    item_count: 0,
  }));
}
