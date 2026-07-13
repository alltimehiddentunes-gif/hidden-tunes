import { MOTIVATION_CATALOG_BASE_URL } from "@/constants/motivationCatalog";
import type {
  MotivationCategory,
  MotivationCursorPagination,
  MotivationHomeResponse,
  MotivationItem,
  MotivationOffsetPagination,
  MotivationPlaybackResolve,
  MotivationProgram,
} from "@/types/motivation";

export const MOTIVATION_HOME_API_PATH = "/api/motivation";
export const MOTIVATION_ITEMS_API_PATH = "/api/motivation/items";
export const MOTIVATION_CATEGORIES_API_PATH = "/api/motivation/categories";
export const MOTIVATION_CATEGORY_API_PATH = "/api/motivation/category";
export const MOTIVATION_PROGRAMS_API_PATH = "/api/motivation/programs";
export const MOTIVATION_SEARCH_API_PATH = "/api/motivation/search";
export const MOTIVATION_DEFAULT_PAGE_LIMIT = 40;
export const MOTIVATION_MAX_PAGE_LIMIT = 40;

const BLOCKED_BROWSE_KEYS = new Set([
  "audio_url",
  "video_url",
  "source_url",
  "stream_url",
  "playbackUrl",
  "playback",
  "embed_url",
  "storage_key",
]);

function cleanText(value: unknown, maxLength = 800) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function stripBrowsableFields(raw: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!BLOCKED_BROWSE_KEYS.has(key)) cleaned[key] = value;
  }
  return cleaned;
}

function assertMetadataOnly(rows: Record<string, unknown>[]) {
  for (const row of rows) {
    if (
      "audio_url" in row ||
      "video_url" in row ||
      "stream_url" in row ||
      "playback" in row
    ) {
      throw new Error("Motivation browse response leaked playable media.");
    }
  }
}

async function fetchMotivationJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${MOTIVATION_CATALOG_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Motivation catalog request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

function normalizeItem(raw: Record<string, unknown>): MotivationItem {
  const cleaned = stripBrowsableFields(raw);
  return {
    id: String(cleaned.id || ""),
    slug: cleanText(cleaned.slug, 160),
    title: String(cleaned.title || "Untitled"),
    description: cleanText(cleaned.description, 2000),
    artwork:
      cleanText(cleaned.artwork, 2000) ||
      cleanText(cleaned.artwork_url, 2000) ||
      cleanText(cleaned.thumbnail_url, 2000),
    channel_name: cleanText(cleaned.channel_name, 200),
    speaker_name: cleanText(cleaned.speaker_name, 200),
    category: cleanText(cleaned.category, 120),
    category_slug: cleanText(cleaned.category_slug, 120),
    language: cleanText(cleaned.language, 80),
    country: cleanText(cleaned.country, 80) || cleanText(cleaned.region, 80),
    duration_seconds:
      cleaned.duration_seconds == null ? null : Math.max(0, Number(cleaned.duration_seconds)),
    media_type: cleanText(cleaned.media_type, 40) || "audio",
    program_id: cleanText(cleaned.program_id, 80),
    season_number:
      cleaned.season_number == null ? null : Math.max(0, Number(cleaned.season_number)),
    episode_number:
      cleaned.episode_number == null ? null : Math.max(0, Number(cleaned.episode_number)),
    sort_order: Math.max(0, Number(cleaned.sort_order || 0)),
    is_featured: cleaned.is_featured === true,
    published_at: cleanText(cleaned.published_at, 40),
  };
}

function normalizeProgram(raw: Record<string, unknown>): MotivationProgram {
  const cleaned = stripBrowsableFields(raw);
  return {
    id: String(cleaned.id || ""),
    slug: String(cleaned.slug || cleaned.id || ""),
    title: String(cleaned.title || "Untitled Program"),
    subtitle: cleanText(cleaned.subtitle, 240),
    description: cleanText(cleaned.description, 4000),
    creator_id: cleanText(cleaned.creator_id, 80),
    category_slug: cleanText(cleaned.category_slug, 120),
    artwork_url: cleanText(cleaned.artwork_url, 2000),
    language_code: cleanText(cleaned.language_code, 16),
    country_code: cleanText(cleaned.country_code, 16),
    program_type: cleanText(cleaned.program_type, 80) || "standalone_collection",
    session_count: Math.max(0, Number(cleaned.session_count || 0)),
    total_duration_seconds: Math.max(0, Number(cleaned.total_duration_seconds || 0)),
    published_at: cleanText(cleaned.published_at, 40),
    is_featured: cleaned.is_featured === true,
  };
}

export function formatMotivationDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds || 0));
  if (!total) return "";
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export async function fetchMotivationHome(signal?: AbortSignal) {
  const body = await fetchMotivationJson<MotivationHomeResponse & { success?: boolean }>(
    MOTIVATION_HOME_API_PATH,
    signal
  );
  const rows = [
    ...(body.featured_items || []),
    ...(body.recommended || []),
    ...(body.popular || []),
  ] as Record<string, unknown>[];
  assertMetadataOnly(rows);
  return body;
}

export async function fetchMotivationCategories(signal?: AbortSignal) {
  const body = await fetchMotivationJson<{ categories?: Record<string, unknown>[] }>(
    MOTIVATION_CATEGORIES_API_PATH,
    signal
  );
  return (body.categories || []).map((row) => ({
    id: String(row.id || row.slug || ""),
    slug: String(row.slug || ""),
    name: String(row.name || row.title || row.slug || "Motivation"),
    title: String(row.title || row.name || row.slug || "Motivation"),
    subtitle: cleanText(row.subtitle, 200),
    description: cleanText(row.description, 500),
    sort_order: Number(row.sort_order || 0),
    item_count: Number(row.item_count || 0),
  })) satisfies MotivationCategory[];
}

export async function fetchMotivationCategoryPage(
  slug: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
) {
  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(
    MOTIVATION_MAX_PAGE_LIMIT,
    Math.max(1, Number(options?.limit || MOTIVATION_DEFAULT_PAGE_LIMIT))
  );
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const body = await fetchMotivationJson<{
    items?: Record<string, unknown>[];
    pagination?: MotivationOffsetPagination;
  }>(`${MOTIVATION_CATEGORY_API_PATH}/${encodeURIComponent(slug)}?${params}`, options?.signal);
  const items = (body.items || []).map(normalizeItem);
  assertMetadataOnly(body.items || []);
  return { items, pagination: body.pagination };
}

export async function fetchMotivationProgramDetail(
  programId: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
) {
  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(
    MOTIVATION_MAX_PAGE_LIMIT,
    Math.max(1, Number(options?.limit || MOTIVATION_DEFAULT_PAGE_LIMIT))
  );
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const body = await fetchMotivationJson<{
    program?: Record<string, unknown>;
    items?: Record<string, unknown>[];
    pagination?: MotivationOffsetPagination;
    standalone?: boolean;
  }>(
    `${MOTIVATION_PROGRAMS_API_PATH}/${encodeURIComponent(programId)}/items?${params}`,
    options?.signal
  );
  const items = (body.items || []).map(normalizeItem);
  assertMetadataOnly(body.items || []);
  return {
    program: normalizeProgram(body.program || {}),
    items,
    pagination: body.pagination,
    standalone: body.standalone === true,
  };
}

export async function searchMotivationItems(
  query: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
) {
  const q = String(query || "").trim();
  if (q.length < 2) return { items: [], pagination: { page: 1, limit: 40, total: 0, totalPages: 0, hasMore: false } };
  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(
    MOTIVATION_MAX_PAGE_LIMIT,
    Math.max(1, Number(options?.limit || MOTIVATION_DEFAULT_PAGE_LIMIT))
  );
  const params = new URLSearchParams({ q, page: String(page), limit: String(limit) });
  const body = await fetchMotivationJson<{
    items?: Record<string, unknown>[];
    pagination?: MotivationOffsetPagination | MotivationCursorPagination;
  }>(`${MOTIVATION_SEARCH_API_PATH}?${params}`, options?.signal);
  const items = (body.items || []).map(normalizeItem);
  assertMetadataOnly(body.items || []);
  return { items, pagination: body.pagination };
}

export async function fetchMotivationItemPlayback(
  itemId: string,
  signal?: AbortSignal
): Promise<MotivationPlaybackResolve> {
  const body = await fetchMotivationJson<{
    success?: boolean;
    item?: Record<string, unknown>;
    playback?: Record<string, unknown>;
  }>(`${MOTIVATION_ITEMS_API_PATH}/${encodeURIComponent(itemId)}/play`, signal);

  const playback = body.playback || {};
  const item = body.item || {};
  const url = String(playback.url || "").trim();
  if (!url) throw new Error("Motivation playback URL unavailable.");

  return {
    itemId: String(item.id || itemId),
    title: String(item.title || "Motivation"),
    mediaType: String(item.media_type || playback.media_type || "audio"),
    playableUrl: url,
    mimeType: cleanText(playback.mime_type, 120),
    durationSeconds:
      item.duration_seconds == null ? null : Math.max(0, Number(item.duration_seconds)),
    programId: cleanText(item.program_id, 80),
  };
}
