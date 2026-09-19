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

const LECTURES_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
const LECTURES_PAGE_CACHE_LIMIT = 24;

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

export type HiddenTunesLecturePage = {
  programs: EducationalProgram[];
  items: HiddenTunesLectureItem[];
  pagination: EducationalOffsetPagination;
};

type LecturePageCacheEntry = {
  value: HiddenTunesLecturePage;
  cachedAt: number;
};

let categoriesMemoryCache: { value: EducationalCategory[]; cachedAt: number } | null = null;
let categoriesInFlight: Promise<EducationalCategory[]> | null = null;
const categoryPageMemoryCache = new Map<string, LecturePageCacheEntry>();
const categoryPageInFlight = new Map<string, Promise<HiddenTunesLecturePage>>();

function lectureAbortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function clampLecturePage(value?: number) {
  return Math.max(1, Number(value || 1));
}

function clampLectureLimit(value?: number) {
  return Math.min(
    LECTURES_MAX_PAGE_LIMIT,
    Math.max(1, Number(value || LECTURES_DEFAULT_PAGE_LIMIT))
  );
}

function lectureCategoryPageCacheKey(slug: string, page: number, limit: number) {
  return `${String(slug || "").trim()}:${page}:${limit}`;
}

function pruneLecturePageCache(now = Date.now()) {
  for (const [key, entry] of categoryPageMemoryCache) {
    if (now - entry.cachedAt > LECTURES_MEMORY_CACHE_TTL_MS) {
      categoryPageMemoryCache.delete(key);
    }
  }
  while (categoryPageMemoryCache.size > LECTURES_PAGE_CACHE_LIMIT) {
    const oldestKey = categoryPageMemoryCache.keys().next().value;
    if (!oldestKey) break;
    categoryPageMemoryCache.delete(oldestKey);
  }
}

function readCachedLecturePage(cacheKey: string): HiddenTunesLecturePage | null {
  pruneLecturePageCache();
  const entry = categoryPageMemoryCache.get(cacheKey);
  if (!entry) return null;

  // Refresh insertion order so the bounded map behaves as a small LRU cache.
  categoryPageMemoryCache.delete(cacheKey);
  categoryPageMemoryCache.set(cacheKey, entry);
  return entry.value;
}

function writeCachedLecturePage(cacheKey: string, value: HiddenTunesLecturePage) {
  categoryPageMemoryCache.delete(cacheKey);
  categoryPageMemoryCache.set(cacheKey, { value, cachedAt: Date.now() });
  pruneLecturePageCache();
}

function waitForLectureSubscriber<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(lectureAbortError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(lectureAbortError()));

    signal.addEventListener("abort", onAbort, { once: true });
    request.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
  });
}

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

/**
 * Keep the first occurrence of each canonical lecture id.
 * Duplicate ids corrupt React keys in LaneSection / FlatList and can mis-route taps.
 */
export function dedupeLectureItemsById(
  items: HiddenTunesLectureItem[],
  source = "lectures"
): HiddenTunesLectureItem[] {
  const seen = new Set<string>();
  const output: HiddenTunesLectureItem[] = [];
  const duplicateIds: string[] = [];

  for (const item of items) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    if (seen.has(id)) {
      duplicateIds.push(id);
      continue;
    }
    seen.add(id);
    output.push(item);
  }

  if (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    duplicateIds.length > 0
  ) {
    const uniqueDupes = Array.from(new Set(duplicateIds));
    console.warn("[Lectures] duplicate lecture IDs dropped before render", {
      source,
      dropped: duplicateIds.length,
      uniqueDuplicateIds: uniqueDupes.slice(0, 12),
    });
  }

  return output;
}

function dedupePrograms(items: HiddenTunesLectureItem[]) {
  return dedupeLectureItemsById(items, "lecturesCatalogApi");
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

export function peekCachedEducationalCategories(): EducationalCategory[] | null {
  if (
    !categoriesMemoryCache ||
    Date.now() - categoriesMemoryCache.cachedAt > LECTURES_MEMORY_CACHE_TTL_MS
  ) {
    categoriesMemoryCache = null;
    return null;
  }
  return categoriesMemoryCache.value;
}

export async function fetchEducationalCategories(options?: {
  signal?: AbortSignal;
  bypassCache?: boolean;
}) {
  if (options?.signal?.aborted) throw lectureAbortError();

  if (options?.bypassCache !== true) {
    const cached = peekCachedEducationalCategories();
    if (cached) return cached;
  }

  let request = categoriesInFlight;
  if (!request) {
    request = fetchLectureJson<{ categories: EducationalCategory[] }>(
      `${LECTURES_CATALOG_BASE_URL}${LECTURES_CATEGORIES_API_PATH}`
    )
      .then((body) => {
        const categories = body.categories || [];
        categoriesMemoryCache = { value: categories, cachedAt: Date.now() };
        return categories;
      })
      .finally(() => {
        if (categoriesInFlight === request) categoriesInFlight = null;
      });
    categoriesInFlight = request;
  }

  return waitForLectureSubscriber(request, options?.signal);
}

export function peekCachedEducationalCategoryPage(
  slug: string,
  options?: { page?: number; limit?: number }
): HiddenTunesLecturePage | null {
  const page = clampLecturePage(options?.page);
  const limit = clampLectureLimit(options?.limit);
  return readCachedLecturePage(lectureCategoryPageCacheKey(slug, page, limit));
}

export async function fetchEducationalCategoryPage(
  slug: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal; bypassCache?: boolean }
): Promise<HiddenTunesLecturePage> {
  const page = clampLecturePage(options?.page);
  const limit = clampLectureLimit(options?.limit);
  const cacheKey = lectureCategoryPageCacheKey(slug, page, limit);

  if (options?.signal?.aborted) throw lectureAbortError();
  if (options?.bypassCache !== true) {
    const cached = readCachedLecturePage(cacheKey);
    if (cached) return cached;
  }

  let request = categoryPageInFlight.get(cacheKey);
  if (!request) {
    // The shared transport owns only its bounded catalog timeout. A route blur
    // cancels that screen subscriber, never the request another focus may join.
    request = fetchLectureJson<{
      lectures: HiddenTunesLectureItem[];
      pagination: EducationalOffsetPagination;
    }>(
      `${LECTURES_CATALOG_BASE_URL}${LECTURES_CATEGORY_API_PATH}/${encodeURIComponent(slug)}?page=${page}&limit=${limit}`
    )
      .then((body) => {
        const lectures = dedupePrograms(
          (body.lectures || [])
            .map((entry) => normalizeLectureItem(entry as unknown as Record<string, unknown>))
            .filter((entry): entry is HiddenTunesLectureItem => Boolean(entry))
        );
        assertMetadataOnly(lectures as unknown as Record<string, unknown>[]);

        const value: HiddenTunesLecturePage = {
          programs: lectures.map(lectureToEducationalProgram),
          items: lectures,
          pagination: body.pagination,
        };
        writeCachedLecturePage(cacheKey, value);
        return value;
      })
      .finally(() => {
        if (categoryPageInFlight.get(cacheKey) === request) {
          categoryPageInFlight.delete(cacheKey);
        }
      });
    categoryPageInFlight.set(cacheKey, request);
  }

  return waitForLectureSubscriber(request, options?.signal);
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

  const body = await fetchLectureJson<Record<string, unknown> & {
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

  const readString = (...candidates: unknown[]) => {
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };

  const media = (body.media && typeof body.media === "object" ? body.media : {}) as Record<
    string,
    unknown
  >;
  const directPlayableUrl = readString(
    body.playableUrl,
    body.playback_url,
    body.playbackUrl,
    body.playable_url,
    body.stream_url,
    body.streamUrl
  );
  const directMediaType = readString(body.mediaType, body.media_type).toLowerCase();
  const mediaAudioUrl = readString(media.audio_url, body.audio_url);
  const mediaVideoUrl = readString(media.video_url, body.video_url);

  const audioUrl =
    directMediaType === "audio"
      ? directPlayableUrl || mediaAudioUrl
      : mediaAudioUrl || (directMediaType !== "video" ? directPlayableUrl : "");
  const videoUrl =
    directMediaType === "video"
      ? directPlayableUrl || mediaVideoUrl
      : mediaVideoUrl || (/\.mp4(?:\?|$)/i.test(directPlayableUrl) ? directPlayableUrl : "");

  const resolvedSessionId = readString(
    body.sessionId,
    body.session_id,
    body.item_id,
    media.id,
    sessionId
  );

  if (sessionId && resolvedSessionId && resolvedSessionId !== sessionId) {
    throw new Error("This lesson is not yet available for playback.");
  }

  const durationRaw = body.durationSeconds ?? body.duration_seconds ?? media.duration_seconds;
  const durationSeconds = Number.isFinite(Number(durationRaw))
    ? Math.max(0, Number(durationRaw))
    : null;
  const mimeType =
    readString(body.mimeType, body.mime_type, media.mime_type) || null;

  if (audioUrl) {
    return {
      programId: cleanProgramId,
      sessionId: resolvedSessionId || sessionId || cleanProgramId,
      mediaType: "audio",
      playableUrl: audioUrl,
      mimeType: mimeType || "audio/mpeg",
      durationSeconds,
    };
  }

  if (videoUrl) {
    return {
      programId: cleanProgramId,
      sessionId: resolvedSessionId || sessionId || cleanProgramId,
      mediaType: "video",
      playableUrl: videoUrl,
      mimeType: mimeType || "video/mp4",
      durationSeconds,
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
