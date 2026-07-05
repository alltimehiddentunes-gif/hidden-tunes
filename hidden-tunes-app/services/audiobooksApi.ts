import type {
  AudiobookCategory,
  AudiobookChapter,
  AudiobookDetail,
  AudiobookItem,
  AudiobookPage,
  AudiobookPagination,
  AudiobookPlayResponse,
} from "../types/audiobooks";

const AUDIOBOOK_API_BASE_URL = "https://admin.hiddentunes.com";
const AUDIOBOOK_PAGE_LIMIT = 40;

type QueryValue = string | number | boolean | undefined | null;

function cleanText(value: unknown, maxLength = 800) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((entry) => cleanText(entry, 80))
    .filter((entry): entry is string => Boolean(entry));
}

function buildAudiobookUrl(path: string, params?: Record<string, QueryValue>) {
  const url = new URL(`${AUDIOBOOK_API_BASE_URL}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchAudiobookJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn("[audiobooksApi] request failed", {
      url,
      status: response.status,
      contentType,
      bodySample: body.slice(0, 240),
    });
    throw new Error(`audiobooks_api_${response.status}`);
  }

  if (!isJson) {
    const body = await response.text().catch(() => "");
    console.warn("[audiobooksApi] expected JSON response", {
      url,
      status: response.status,
      contentType,
      bodySample: body.slice(0, 240),
    });
    throw new Error("audiobooks_api_non_json_response");
  }

  let payload: T & { success?: boolean; error?: string };
  try {
    payload = (await response.json()) as T & {
      success?: boolean;
      error?: string;
    };
  } catch (error) {
    console.warn("[audiobooksApi] invalid JSON response", {
      url,
      status: response.status,
      contentType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (payload.success === false) {
    console.warn("[audiobooksApi] API returned failure", {
      url,
      error: payload.error || "audiobooks_api_error",
    });
    throw new Error(payload.error || "audiobooks_api_error");
  }

  return payload;
}

function clampPage(value?: number) {
  return Math.max(1, Number(value || 1));
}

function clampLimit(value?: number) {
  return Math.min(AUDIOBOOK_PAGE_LIMIT, Math.max(1, Number(value || AUDIOBOOK_PAGE_LIMIT)));
}

function emptyPagination(page = 1, limit = AUDIOBOOK_PAGE_LIMIT): AudiobookPagination {
  return {
    page,
    limit,
    total: 0,
    totalPages: 0,
    hasMore: false,
  };
}

function normalizePagination(
  raw: unknown,
  fallback: { page: number; limit: number },
  count: number
): AudiobookPagination {
  const pagination = (raw || {}) as Record<string, unknown>;
  return {
    page: normalizeNumber(pagination.page, fallback.page),
    limit: normalizeNumber(pagination.limit, fallback.limit),
    total: normalizeNumber(pagination.total, count),
    totalPages: normalizeNumber(pagination.totalPages, 0),
    hasMore: pagination.hasMore === true,
  };
}

function normalizeCategory(raw: Record<string, unknown>, index: number): AudiobookCategory | null {
  const slug = cleanText(raw.slug, 120);
  const title = cleanText(raw.title || raw.name, 120);
  if (!slug || !title) return null;

  return {
    id: cleanText(raw.id, 120) || slug || `audiobook-category-${index}`,
    slug,
    name: cleanText(raw.name, 120) || title,
    title,
    icon: cleanText(raw.icon, 80),
    item_count: normalizeNumber(raw.item_count, 0),
    is_mature: raw.is_mature === true || slug === "mature",
  };
}

export function normalizeAudiobookItem(raw: Record<string, unknown>): AudiobookItem | null {
  const id = cleanText(raw.id, 120);
  const title = cleanText(raw.title, 300);
  const slug = cleanText(raw.slug, 180) || id;
  if (!id || !slug || !title) return null;

  return {
    id,
    slug,
    title,
    subtitle: cleanText(raw.subtitle, 300),
    description: cleanText(raw.description, 1600),
    cover_url: cleanText(raw.cover_url, 2000),
    author_name: cleanText(raw.author_name, 200),
    narrator_name: cleanText(raw.narrator_name, 200),
    series_title: cleanText(raw.series_title, 200),
    series_position: Number.isFinite(Number(raw.series_position))
      ? Number(raw.series_position)
      : null,
    category_slug: cleanText(raw.category_slug, 120),
    categories: normalizeStringArray(raw.categories),
    language: cleanText(raw.language, 40),
    publisher: cleanText(raw.publisher, 200),
    duration_seconds: Number.isFinite(Number(raw.duration_seconds))
      ? Number(raw.duration_seconds)
      : null,
    chapter_count: normalizeNumber(raw.chapter_count, 0),
    is_featured: raw.is_featured === true,
    is_verified: raw.is_verified === true,
    published_at: cleanText(raw.published_at, 40),
    created_at: cleanText(raw.created_at, 40),
    is_mature: raw.is_mature === true,
  };
}

function normalizeChapter(raw: Record<string, unknown>): AudiobookChapter | null {
  const id = cleanText(raw.id, 120);
  const audiobookId = cleanText(raw.audiobook_id, 120);
  const title = cleanText(raw.title, 300);
  if (!id || !audiobookId || !title) return null;

  return {
    id,
    audiobook_id: audiobookId,
    title,
    description: cleanText(raw.description, 1000),
    chapter_number: Number.isFinite(Number(raw.chapter_number))
      ? Number(raw.chapter_number)
      : null,
    duration_seconds: Number.isFinite(Number(raw.duration_seconds))
      ? Number(raw.duration_seconds)
      : null,
    published_at: cleanText(raw.published_at, 40),
    created_at: cleanText(raw.created_at, 40),
  };
}

export function dedupeAudiobooks(items: AudiobookItem[]) {
  const seen = new Set<string>();
  const deduped: AudiobookItem[] = [];

  for (const item of items) {
    if (item.is_mature) continue;
    const composite = `${item.slug}:${item.title.toLowerCase()}:${String(
      item.author_name || ""
    ).toLowerCase()}`;
    if (seen.has(item.id) || seen.has(composite)) continue;
    seen.add(item.id);
    seen.add(composite);
    deduped.push(item);
  }

  return deduped;
}

export function formatAudiobookDuration(seconds?: number | null) {
  if (!seconds || seconds < 1) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export async function fetchAudiobookTree(signal?: AbortSignal): Promise<AudiobookCategory[]> {
  const payload = await fetchAudiobookJson<{ categories?: Record<string, unknown>[] }>(
    buildAudiobookUrl("/api/audiobooks/tree"),
    signal
  );

  return (payload.categories || [])
    .map((category, index) => normalizeCategory(category, index))
    .filter((category): category is AudiobookCategory => Boolean(category))
    .filter((category) => !category.is_mature && category.slug !== "mature");
}

export async function fetchAudiobookCategory(
  slug: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
): Promise<AudiobookPage> {
  const page = clampPage(options?.page);
  const limit = clampLimit(options?.limit);
  const payload = await fetchAudiobookJson<{
    audiobooks?: Record<string, unknown>[];
    pagination?: Record<string, unknown>;
  }>(
    buildAudiobookUrl(`/api/audiobooks/category/${encodeURIComponent(slug)}`, {
      page,
      limit,
    }),
    options?.signal
  );

  const items = dedupeAudiobooks(
    (payload.audiobooks || [])
      .map((item) => normalizeAudiobookItem(item))
      .filter((item): item is AudiobookItem => Boolean(item))
  );

  return {
    items,
    pagination: normalizePagination(payload.pagination, { page, limit }, items.length),
  };
}

export async function searchAudiobooks(
  q: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
): Promise<AudiobookPage> {
  const page = clampPage(options?.page);
  const limit = clampLimit(options?.limit);
  const query = q.trim();
  if (!query) return { items: [], pagination: emptyPagination(page, limit) };

  const payload = await fetchAudiobookJson<{
    audiobooks?: Record<string, unknown>[];
    pagination?: Record<string, unknown>;
  }>(
    buildAudiobookUrl("/api/audiobooks/search", {
      q: query,
      page,
      limit,
    }),
    options?.signal
  );

  const items = dedupeAudiobooks(
    (payload.audiobooks || [])
      .map((item) => normalizeAudiobookItem(item))
      .filter((item): item is AudiobookItem => Boolean(item))
  );

  return {
    items,
    pagination: normalizePagination(payload.pagination, { page, limit }, items.length),
  };
}

export async function fetchAudiobookDetail(
  id: string,
  signal?: AbortSignal
): Promise<AudiobookDetail> {
  const payload = await fetchAudiobookJson<{
    audiobook?: Record<string, unknown>;
    chapters?: Record<string, unknown>[];
  }>(buildAudiobookUrl(`/api/audiobooks/${encodeURIComponent(id)}`), signal);

  const audiobook = payload.audiobook
    ? normalizeAudiobookItem(payload.audiobook)
    : null;
  if (!audiobook || audiobook.is_mature) {
    throw new Error("audiobook_not_found");
  }

  return {
    audiobook,
    chapters: (payload.chapters || [])
      .map((chapter) => normalizeChapter(chapter))
      .filter((chapter): chapter is AudiobookChapter => Boolean(chapter)),
  };
}

export async function fetchAudiobookPlay(
  id: string,
  signal?: AbortSignal
): Promise<AudiobookPlayResponse> {
  const payload = await fetchAudiobookJson<Record<string, unknown>>(
    buildAudiobookUrl(`/api/audiobooks/${encodeURIComponent(id)}/play`),
    signal
  );
  const audioUrl = cleanText(payload.audio_url, 2000);
  if (!audioUrl) throw new Error("audiobook_audio_unavailable");

  const file = (payload.file || {}) as Record<string, unknown>;
  return {
    audiobook_id: String(payload.audiobook_id || id),
    title: String(payload.title || "Audiobook"),
    audio_url: audioUrl,
    file: {
      id: String(file.id || ""),
      audiobook_id: String(file.audiobook_id || payload.audiobook_id || id),
      title: cleanText(file.title, 300),
      audio_url: cleanText(file.audio_url, 2000) || audioUrl,
      duration_seconds: Number.isFinite(Number(file.duration_seconds))
        ? Number(file.duration_seconds)
        : null,
      format: cleanText(file.format, 80),
      mime_type: cleanText(file.mime_type, 120),
      bitrate: Number.isFinite(Number(file.bitrate)) ? Number(file.bitrate) : null,
    },
  };
}
