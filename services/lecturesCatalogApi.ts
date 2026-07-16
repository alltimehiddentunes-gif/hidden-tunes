import { LECTURES_CATALOG_BASE_URL } from "@/constants/lecturesCatalog";
import type {
  EducationalCategory,
  EducationalContentFormat,
  EducationalOffsetPagination,
  EducationalProgram,
  EducationalProgramDetail,
  EducationalSession,
  EducationalPlaybackResolve,
} from "@/types/education";
import {
  orderEducationalSessions,
} from "@/utils/educationalOrdering";
import {
  catalogJsonFetch,
  isCatalogAbortError,
  isCatalogTimeoutError,
} from "./catalogJsonFetch";

export const LECTURES_CATEGORIES_API_PATH = "/api/lectures/categories";
export const LECTURES_CATEGORY_API_PATH = "/api/lectures/category";
export const LECTURES_ITEMS_API_PATH = "/api/lectures/items";
export const LECTURES_SEARCH_API_PATH = "/api/lectures/search";
export const LECTURES_DEFAULT_PAGE_LIMIT = 40;
export const LECTURES_MAX_PAGE_LIMIT = 40;

const BLOCKED_BROWSE_KEYS = new Set([
  "audioUrl",
  "audio_url",
  "videoUrl",
  "video_url",
  "source_url",
  "sourceUrl",
  "stream_url",
  "streamUrl",
  "playbackUrl",
  "playableUrl",
  "mimeType",
  "mime_type",
]);

export type HiddenTunesLectureItem = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  instructor_name?: string | null;
  speaker_name?: string | null;
  creator_name?: string | null;
  category_slug?: string | null;
  categories?: string[];
  topic_tags?: string[];
  difficulty?: string | null;
  lesson_count?: number;
  duration_seconds?: number | null;
  artwork_url?: string | null;
  cover_url?: string | null;
  language?: string | null;
  rights?: string | null;
  is_featured?: boolean;
  is_verified?: boolean;
  is_mature?: boolean;
  published_at?: string | null;
  content_format?: EducationalContentFormat;
};

export type HiddenTunesLectureLesson = {
  id: string;
  item_id: string;
  title?: string | null;
  lesson_number?: number | null;
  media_type?: string | null;
  mime_type?: string | null;
  duration_seconds?: number | null;
  is_primary?: boolean;
  created_at?: string | null;
};

function cleanText(value: unknown, maxLength = 800) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function stripBrowsableFields(raw: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};
  for (const [entryKey, value] of Object.entries(raw)) {
    if (!BLOCKED_BROWSE_KEYS.has(entryKey)) {
      cleaned[entryKey] = value;
    }
  }
  return cleaned;
}

function inferContentFormat(
  mediaType?: string | null,
  fallback: EducationalContentFormat = "unknown"
): EducationalContentFormat {
  const normalized = String(mediaType || "").trim().toLowerCase();
  if (normalized === "audio") return "audio";
  if (normalized === "video") return "video";
  return fallback;
}

function dedupePrograms(items: HiddenTunesLectureItem[]) {
  const seen = new Set<string>();
  const output: HiddenTunesLectureItem[] = [];
  for (const item of items) {
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(item);
  }
  return output;
}

function assertMetadataOnly(rows: Record<string, unknown>[]) {
  for (const row of rows) {
    if (
      "audio_url" in row ||
      "video_url" in row ||
      "stream_url" in row ||
      "playableUrl" in row
    ) {
      throw new Error("Lecture browse response included playback URLs.");
    }
  }
}

export function normalizeLectureItem(raw: Record<string, unknown>): HiddenTunesLectureItem | null {
  const safe = stripBrowsableFields(raw);
  const id = String(safe.id || "").trim();
  const title = String(safe.title || "").trim();
  const slug = String(safe.slug || "").trim();
  if (!id || !title) return null;

  return {
    id,
    slug: slug || id,
    title,
    subtitle: cleanText(safe.subtitle, 300),
    description: cleanText(safe.description, 2000),
    instructor_name: cleanText(safe.instructor_name, 200),
    speaker_name: cleanText(safe.speaker_name, 200),
    creator_name: cleanText(safe.creator_name, 200),
    category_slug: cleanText(safe.category_slug, 120),
    categories: Array.isArray(safe.categories)
      ? (safe.categories as unknown[])
          .map((entry) => cleanText(entry, 80))
          .filter(Boolean) as string[]
      : [],
    topic_tags: Array.isArray(safe.topic_tags)
      ? (safe.topic_tags as unknown[])
          .map((entry) => cleanText(entry, 80))
          .filter(Boolean) as string[]
      : [],
    difficulty: cleanText(safe.difficulty, 80),
    lesson_count: Math.max(0, Number(safe.lesson_count || 0)),
    duration_seconds: Number.isFinite(Number(safe.duration_seconds))
      ? Math.max(0, Number(safe.duration_seconds))
      : null,
    artwork_url: cleanText(safe.artwork_url, 2000) || cleanText(safe.cover_url, 2000),
    cover_url: cleanText(safe.cover_url, 2000),
    language: cleanText(safe.language, 40),
    rights: cleanText(safe.rights, 200),
    is_featured: safe.is_featured === true,
    is_verified: safe.is_verified === true,
    is_mature: safe.is_mature === true,
    published_at: cleanText(safe.published_at, 40),
    content_format: inferContentFormat(cleanText(safe.media_type, 40)),
  };
}

export function lectureToEducationalProgram(item: HiddenTunesLectureItem): EducationalProgram {
  const educator =
    item.instructor_name || item.speaker_name || item.creator_name || null;
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    subtitle: item.subtitle || null,
    description: item.description || null,
    shortDescription: item.subtitle || item.description?.slice(0, 180) || null,
    educatorName: educator,
    institutionName: item.creator_name || null,
    primarySubjectSlug: item.category_slug || null,
    topicTags: item.topic_tags || [],
    artworkUrl: item.artwork_url || item.cover_url || null,
    language: item.language || null,
    educationLevel: item.difficulty || null,
    difficultyLevel: item.difficulty || null,
    contentFormat: item.content_format || "unknown",
    sessionCount: Math.max(1, Number(item.lesson_count || 1)),
    totalDurationSeconds: item.duration_seconds ?? null,
    mature: item.is_mature === true,
    featured: item.is_featured === true,
    verified: item.is_verified === true,
    rightsType: item.rights || null,
    attribution: item.creator_name || educator,
    publishedAt: item.published_at || null,
  };
}

export function lessonToEducationalSession(
  lesson: HiddenTunesLectureLesson,
  program: EducationalProgram,
  sequenceNumber: number
): EducationalSession {
  return {
    id: lesson.id,
    programId: program.id,
    title: cleanText(lesson.title, 300) || `Lesson ${lesson.lesson_number || sequenceNumber}`,
    sequenceNumber,
    moduleNumber: null,
    lessonNumber: lesson.lesson_number ?? sequenceNumber,
    educatorName: program.educatorName || null,
    artworkUrl: program.artworkUrl || null,
    contentFormat: inferContentFormat(lesson.media_type, program.contentFormat),
    durationSeconds: lesson.duration_seconds ?? null,
    language: program.language || null,
    mature: program.mature === true,
    public: true,
    verified: program.verified === true,
    playable: true,
    publishedAt: program.publishedAt || null,
  };
}

async function fetchLectureJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  try {
    const { response, json } = await catalogJsonFetch(url, { signal });
    const body = (json && typeof json === "object" ? json : {}) as T & {
      success?: boolean;
      error?: string;
    };
    if (!response.ok || body.success === false) {
      throw new Error(body.error || "Lecture request failed.");
    }
    return body;
  } catch (error) {
    if (isCatalogAbortError(error)) throw error;
    if (isCatalogTimeoutError(error)) {
      throw new Error("Lecture catalog request timed out.");
    }
    throw error;
  }
}

export async function fetchEducationalCategories(options?: { signal?: AbortSignal }) {
  const body = await fetchLectureJson<{ categories: EducationalCategory[] }>(
    `${LECTURES_CATALOG_BASE_URL}${LECTURES_CATEGORIES_API_PATH}`,
    options?.signal
  );
  return body.categories || [];
}

export async function fetchEducationalCategoryPage(
  slug: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
) {
  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(LECTURES_MAX_PAGE_LIMIT, Number(options?.limit || LECTURES_DEFAULT_PAGE_LIMIT));
  const body = await fetchLectureJson<{
    lectures: HiddenTunesLectureItem[];
    pagination: EducationalOffsetPagination;
  }>(
    `${LECTURES_CATALOG_BASE_URL}${LECTURES_CATEGORY_API_PATH}/${encodeURIComponent(slug)}?page=${page}&limit=${limit}`,
    options?.signal
  );

  const lectures = dedupePrograms(
    (body.lectures || [])
      .map((entry) => normalizeLectureItem(entry as unknown as Record<string, unknown>))
      .filter((entry): entry is HiddenTunesLectureItem => Boolean(entry))
  );
  assertMetadataOnly(lectures as unknown as Record<string, unknown>[]);

  return { programs: lectures.map(lectureToEducationalProgram), items: lectures, pagination: body.pagination };
}

export async function searchEducationalPrograms(
  query: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) {
    return {
      programs: [] as EducationalProgram[],
      items: [] as HiddenTunesLectureItem[],
      pagination: {
        page: 1,
        limit: LECTURES_DEFAULT_PAGE_LIMIT,
        total: 0,
        totalPages: 0,
        hasMore: false,
      } satisfies EducationalOffsetPagination,
    };
  }

  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(LECTURES_MAX_PAGE_LIMIT, Number(options?.limit || LECTURES_DEFAULT_PAGE_LIMIT));
  const body = await fetchLectureJson<{
    lectures: HiddenTunesLectureItem[];
    pagination: EducationalOffsetPagination;
  }>(
    `${LECTURES_CATALOG_BASE_URL}${LECTURES_SEARCH_API_PATH}?q=${encodeURIComponent(cleanQuery)}&page=${page}&limit=${limit}`,
    options?.signal
  );

  const lectures = dedupePrograms(
    (body.lectures || [])
      .map((entry) => normalizeLectureItem(entry as unknown as Record<string, unknown>))
      .filter((entry): entry is HiddenTunesLectureItem => Boolean(entry))
  );
  assertMetadataOnly(lectures as unknown as Record<string, unknown>[]);

  return {
    programs: lectures.map(lectureToEducationalProgram),
    items: lectures,
    pagination: body.pagination,
  };
}

export async function fetchEducationalProgramDetail(
  programId: string,
  options?: { sessionPage?: number; sessionLimit?: number; signal?: AbortSignal }
): Promise<EducationalProgramDetail> {
  const cleanId = String(programId || "").trim();
  if (!cleanId) throw new Error("Educational program id is required.");

  const sessionPage = Math.max(1, Number(options?.sessionPage || 1));
  const sessionLimit = Math.min(
    LECTURES_MAX_PAGE_LIMIT,
    Math.max(1, Number(options?.sessionLimit || LECTURES_DEFAULT_PAGE_LIMIT))
  );

  const body = await fetchLectureJson<{
    lecture: HiddenTunesLectureItem;
    lessons: HiddenTunesLectureLesson[];
    pagination?: EducationalOffsetPagination;
  }>(
    `${LECTURES_CATALOG_BASE_URL}${LECTURES_ITEMS_API_PATH}/${encodeURIComponent(cleanId)}?page=${sessionPage}&limit=${sessionLimit}`,
    options?.signal
  );

  const lecture = normalizeLectureItem((body.lecture || {}) as unknown as Record<string, unknown>);
  if (!lecture) throw new Error("Educational program not found.");
  assertMetadataOnly([lecture as unknown as Record<string, unknown>]);
  assertMetadataOnly((body.lessons || []) as unknown as Record<string, unknown>[]);

  const program = lectureToEducationalProgram(lecture);
  const pageOffset = (sessionPage - 1) * sessionLimit;
  const sessions = orderEducationalSessions(
    (body.lessons || []).map((lesson, index) =>
      lessonToEducationalSession(lesson, program, pageOffset + index + 1)
    )
  );

  const pagination = body.pagination || {
    page: sessionPage,
    limit: sessionLimit,
    total: sessions.length,
    totalPages: sessions.length > 0 ? 1 : 0,
    hasMore: false,
  };

  return {
    program,
    sessions,
    pagination,
  };
}

export async function fetchEducationalSessionPlayback(
  programId: string,
  sessionId?: string,
  signal?: AbortSignal
): Promise<EducationalPlaybackResolve> {
  const cleanProgramId = String(programId || "").trim();
  if (!cleanProgramId) throw new Error("Educational program id is required.");

  const params = new URLSearchParams();
  if (sessionId) params.set("lessonId", sessionId);

  const body = await fetchLectureJson<{
    programId?: string;
    sessionId?: string;
    title?: string;
    mediaType?: "audio" | "video";
    playableUrl?: string;
    durationSeconds?: number | null;
    mimeType?: string | null;
    media?: {
      id?: string;
      item_id?: string;
      title?: string;
      lesson_number?: number;
      media_type?: string;
      audio_url?: string;
      video_url?: string;
      mime_type?: string;
      duration_seconds?: number;
    };
    audio_url?: string;
    video_url?: string;
  }>(
    `${LECTURES_CATALOG_BASE_URL}${LECTURES_ITEMS_API_PATH}/${encodeURIComponent(cleanProgramId)}/play${
      params.toString() ? `?${params.toString()}` : ""
    }`,
    signal
  );

  const media = body.media || {};
  const directPlayableUrl = String(body.playableUrl || "").trim();
  const directMediaType = String(body.mediaType || "").trim().toLowerCase();
  const audioUrl = String(
    directMediaType === "audio" ? directPlayableUrl : media.audio_url || body.audio_url || ""
  ).trim();
  const videoUrl = String(
    directMediaType === "video" ? directPlayableUrl : media.video_url || body.video_url || ""
  ).trim();
  const resolvedSessionId = String(body.sessionId || media.id || sessionId || "").trim();

  if (sessionId && resolvedSessionId && resolvedSessionId !== sessionId) {
    throw new Error("This lesson is not yet available for playback.");
  }

  if (audioUrl) {
    return {
      programId: cleanProgramId,
      sessionId: resolvedSessionId || sessionId || cleanProgramId,
      mediaType: "audio",
      playableUrl: audioUrl,
      mimeType: body.mimeType || media.mime_type || "audio/mpeg",
      durationSeconds: body.durationSeconds ?? media.duration_seconds ?? null,
    };
  }

  if (videoUrl) {
    return {
      programId: cleanProgramId,
      sessionId: resolvedSessionId || sessionId || cleanProgramId,
      mediaType: "video",
      playableUrl: videoUrl,
      mimeType: body.mimeType || media.mime_type || "video/mp4",
      durationSeconds: body.durationSeconds ?? media.duration_seconds ?? null,
    };
  }

  throw new Error("Educational playback is unavailable.");
}

export function formatEducationalDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds || 0));
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

export function filterEducationalBrowseItems(
  items: HiddenTunesLectureItem[],
  options?: { allowMature?: boolean }
) {
  const allowMature = options?.allowMature === true;
  return items.filter((item) => allowMature || item.is_mature !== true);
}
