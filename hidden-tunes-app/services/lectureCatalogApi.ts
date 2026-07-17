import {
  LECTURE_CATALOG_BASE_URL,
  LECTURE_DEFAULT_PAGE_LIMIT,
  LECTURE_MAX_PAGE_LIMIT,
} from "../constants/lectureCatalog";

export {
  LECTURE_CATALOG_BASE_URL,
  LECTURE_DEFAULT_PAGE_LIMIT,
  LECTURE_MAX_PAGE_LIMIT,
};

export const LECTURE_CATEGORIES_API_PATH = "/api/lectures/categories";
export const LECTURE_CATEGORY_API_PATH = "/api/lectures/category";
export const LECTURE_ITEMS_API_PATH = "/api/lectures/items";

export type HiddenTunesLectureSeries = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  artwork_url?: string | null;
  speaker_name?: string | null;
  instructor_name?: string | null;
  category_slug?: string | null;
  lesson_count?: number | null;
  duration_seconds?: number | null;
  language?: string | null;
  is_featured?: boolean;
};

export type HiddenTunesLectureLesson = {
  id: string;
  item_id: string;
  title: string;
  lesson_number?: number | null;
  media_type?: string | null;
  mime_type?: string | null;
  duration_seconds?: number | null;
  is_primary?: boolean;
};

export type HiddenTunesLecturePlayback = {
  lectureId: string;
  itemId: string;
  title: string;
  mediaType: "audio" | "video";
  playbackUrl: string;
  mimeType?: string | null;
  durationSeconds?: number | null;
  artworkUrl?: string | null;
  speakerName?: string | null;
};

export type LectureCatalogPage = {
  success: boolean;
  series: HiddenTunesLectureSeries[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
  error?: string;
};

function clampLimit(limit?: number) {
  return Math.min(
    LECTURE_MAX_PAGE_LIMIT,
    Math.max(1, limit || LECTURE_DEFAULT_PAGE_LIMIT)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...candidates: unknown[]) {
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readNumber(...candidates: unknown[]) {
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeMediaType(value: unknown): "audio" | "video" {
  return String(value || "")
    .trim()
    .toLowerCase() === "video"
    ? "video"
    : "audio";
}

function normalizeSeries(row: unknown): HiddenTunesLectureSeries | null {
  const record = asRecord(row);
  if (!record) return null;
  const id = readString(record.id);
  const title = readString(record.title);
  if (!id || !title) return null;

  return {
    id,
    slug: readString(record.slug) || id,
    title,
    subtitle: readString(record.subtitle),
    description: readString(record.description),
    artwork_url: readString(record.artwork_url, record.cover_url, record.artworkUrl),
    speaker_name: readString(
      record.speaker_name,
      record.instructor_name,
      record.speakerName,
      record.instructorName
    ),
    instructor_name: readString(record.instructor_name, record.instructorName),
    category_slug: readString(record.category_slug, record.categorySlug),
    lesson_count: readNumber(record.lesson_count, record.lessonCount),
    duration_seconds: readNumber(record.duration_seconds, record.durationSeconds),
    language: readString(record.language),
    is_featured: record.is_featured === true || record.isFeatured === true,
  };
}

function normalizeLesson(row: unknown): HiddenTunesLectureLesson | null {
  const record = asRecord(row);
  if (!record) return null;
  const id = readString(record.id);
  const title = readString(record.title);
  const itemId = readString(record.item_id, record.itemId, record.lecture_id);
  if (!id || !title) return null;

  return {
    id,
    item_id: itemId || "",
    title,
    lesson_number: readNumber(record.lesson_number, record.lessonNumber),
    media_type: readString(record.media_type, record.mediaType),
    mime_type: readString(record.mime_type, record.mimeType),
    duration_seconds: readNumber(record.duration_seconds, record.durationSeconds),
    is_primary: record.is_primary === true || record.isPrimary === true,
  };
}

function assertMetadataOnly(rows: unknown[]) {
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    if (
      "playableUrl" in record ||
      "playable_url" in record ||
      "playback_url" in record ||
      "playbackUrl" in record ||
      "audio_url" in record ||
      "video_url" in record ||
      "stream_url" in record
    ) {
      throw new Error("Lecture list response included playback URLs.");
    }
  }
}

export function formatLectureDuration(seconds?: number | null) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!total) return null;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export async function fetchLectureCategories(signal?: AbortSignal): Promise<
  { id: string; slug: string; name: string }[]
> {
  const response = await fetch(
    `${LECTURE_CATALOG_BASE_URL}${LECTURE_CATEGORIES_API_PATH}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    }
  );
  const body = (await response.json()) as {
    categories?: unknown[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body?.error || "Lecture categories request failed.");
  }

  return (Array.isArray(body.categories) ? body.categories : [])
    .map((row) => {
      const record = asRecord(row);
      if (!record) return null;
      const slug = readString(record.slug);
      const name = readString(record.name, record.title) || slug;
      if (!slug || !name) return null;
      return {
        id: readString(record.id) || slug,
        slug,
        name,
      };
    })
    .filter((row): row is { id: string; slug: string; name: string } => Boolean(row));
}

export async function fetchLectureCatalogPage(options?: {
  page?: number;
  limit?: number;
  category?: string | null;
  signal?: AbortSignal;
}): Promise<LectureCatalogPage> {
  const page = Math.max(1, options?.page || 1);
  const limit = clampLimit(options?.limit);
  let category = String(options?.category || "").trim();

  if (!category) {
    const categories = await fetchLectureCategories(options?.signal);
    category = categories[0]?.slug || "";
  }
  if (!category) {
    throw new Error("No lecture categories are available.");
  }

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const response = await fetch(
    `${LECTURE_CATALOG_BASE_URL}${LECTURE_CATEGORY_API_PATH}/${encodeURIComponent(
      category
    )}?${params.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: options?.signal,
    }
  );

  const body = (await response.json()) as {
    success?: boolean;
    lectures?: unknown[];
    pagination?: {
      page?: number;
      limit?: number;
      hasMore?: boolean;
      totalPages?: number | null;
    };
    error?: string;
  };

  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || "Lecture catalog request failed.");
  }

  const rawRows = Array.isArray(body.lectures) ? body.lectures : [];
  assertMetadataOnly(rawRows);
  const series = rawRows
    .map(normalizeSeries)
    .filter((row): row is HiddenTunesLectureSeries => Boolean(row));

  const paginationPage = Number(body.pagination?.page) || page;
  const paginationLimit = Number(body.pagination?.limit) || limit;
  const hasMore =
    typeof body.pagination?.hasMore === "boolean"
      ? body.pagination.hasMore
      : typeof body.pagination?.totalPages === "number"
        ? paginationPage < body.pagination.totalPages
        : series.length >= paginationLimit;

  return {
    success: true,
    series,
    pagination: {
      page: paginationPage,
      limit: paginationLimit,
      hasMore,
    },
  };
}

export async function fetchLectureLessons(
  lectureId: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
): Promise<{
  series: HiddenTunesLectureSeries | null;
  lessons: HiddenTunesLectureLesson[];
}> {
  const cleanId = String(lectureId || "").trim();
  if (!cleanId) {
    throw new Error("Lecture id is required.");
  }

  const page = Math.max(1, options?.page || 1);
  const limit = clampLimit(options?.limit);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(
    `${LECTURE_CATALOG_BASE_URL}${LECTURE_ITEMS_API_PATH}/${encodeURIComponent(
      cleanId
    )}?${params.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: options?.signal,
    }
  );

  const body = (await response.json()) as {
    success?: boolean;
    lecture?: unknown;
    lessons?: unknown[];
    error?: string;
  };

  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || "Lecture detail request failed.");
  }

  const rawLessons = Array.isArray(body.lessons) ? body.lessons : [];
  assertMetadataOnly(rawLessons);

  return {
    series: normalizeSeries(body.lecture),
    lessons: rawLessons
      .map(normalizeLesson)
      .filter((row): row is HiddenTunesLectureLesson => Boolean(row))
      .sort((a, b) => {
        const aNum = a.lesson_number ?? Number.MAX_SAFE_INTEGER;
        const bNum = b.lesson_number ?? Number.MAX_SAFE_INTEGER;
        if (aNum !== bNum) return aNum - bNum;
        return a.id.localeCompare(b.id);
      }),
  };
}

/**
 * Maps production camelCase and snake_case play payloads into one shape.
 */
export function mapLecturePlayResponse(
  body: Record<string, unknown>,
  fallbackLectureId: string,
  fallbackLessonId: string
): HiddenTunesLecturePlayback | null {
  const playbackUrl = readString(
    body.playableUrl,
    body.playback_url,
    body.playbackUrl,
    body.playable_url,
    body.stream_url,
    body.audio_url,
    body.video_url
  );
  if (!playbackUrl?.startsWith("http")) return null;

  return {
    lectureId:
      readString(body.programId, body.program_id, body.lecture_id, body.lectureId) ||
      fallbackLectureId,
    itemId:
      readString(body.sessionId, body.session_id, body.item_id, body.itemId) ||
      fallbackLessonId,
    title: readString(body.title) || "Lecture session",
    mediaType: normalizeMediaType(body.mediaType ?? body.media_type),
    playbackUrl,
    mimeType: readString(body.mimeType, body.mime_type),
    durationSeconds: readNumber(body.durationSeconds, body.duration_seconds),
    artworkUrl: readString(body.artwork_url, body.artworkUrl),
    speakerName: readString(body.speaker, body.speaker_name, body.speakerName),
  };
}

export async function fetchLecturePlayback(
  lectureId: string,
  lessonId: string,
  signal?: AbortSignal
): Promise<HiddenTunesLecturePlayback> {
  const cleanLectureId = String(lectureId || "").trim();
  const cleanLessonId = String(lessonId || "").trim();
  if (!cleanLectureId || !cleanLessonId) {
    throw new Error("Lecture and lesson ids are required.");
  }

  const params = new URLSearchParams({ lessonId: cleanLessonId });
  const response = await fetch(
    `${LECTURE_CATALOG_BASE_URL}${LECTURE_ITEMS_API_PATH}/${encodeURIComponent(
      cleanLectureId
    )}/play?${params.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    }
  );

  const body = (await response.json()) as Record<string, unknown> & {
    success?: boolean;
    error?: string;
  };

  if (!response.ok || body?.success === false) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Lecture playback is unavailable."
    );
  }

  const mapped = mapLecturePlayResponse(body, cleanLectureId, cleanLessonId);
  if (!mapped) {
    throw new Error("Lecture playback URL is missing.");
  }
  return mapped;
}

export function selectPrimaryLectureLesson(
  lessons: HiddenTunesLectureLesson[]
): HiddenTunesLectureLesson | null {
  if (!lessons.length) return null;
  return (
    lessons.find((lesson) => lesson.is_primary) ||
    lessons.find((lesson) => (lesson.lesson_number ?? 0) === 1) ||
    lessons[0]
  );
}
