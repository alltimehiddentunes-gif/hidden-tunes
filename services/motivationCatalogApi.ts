import { MOTIVATION_CATALOG_BASE_URL } from "@/constants/motivationCatalog";
import type {
  MotivationCategory,
  MotivationCategoryProgramSummary,
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
export const MOTIVATION_CATEGORY_PROGRAM_PAGE_LIMIT = 24;

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
  const tags = Array.isArray(cleaned.tags)
    ? cleaned.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 24)
    : [];
  return {
    id: String(cleaned.id || ""),
    slug: cleanText(cleaned.slug, 160),
    title: String(cleaned.title || "Untitled"),
    description: cleanText(cleaned.description, 4000),
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
      cleaned.season_number == null || Number.isNaN(Number(cleaned.season_number))
        ? null
        : Math.max(0, Number(cleaned.season_number)),
    episode_number:
      cleaned.episode_number == null || Number.isNaN(Number(cleaned.episode_number))
        ? null
        : Math.max(0, Number(cleaned.episode_number)),
    sort_order: Math.max(0, Number(cleaned.sort_order || 0)),
    is_featured: cleaned.is_featured === true,
    published_at: cleanText(cleaned.published_at, 40),
    tags,
    subcategory: cleanText(cleaned.subcategory, 120),
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
  const body = await fetchMotivationJson<
    MotivationHomeResponse & {
      success?: boolean;
      featured_items?: Record<string, unknown>[];
      recommended?: Record<string, unknown>[];
      popular?: Record<string, unknown>[];
      new_releases?: Record<string, unknown>[];
      featured_programs?: Record<string, unknown>[];
    }
  >(MOTIVATION_HOME_API_PATH, signal);

  const featuredItems = (body.featured_items || []).map(normalizeItem);
  const recommended = (body.recommended || []).map(normalizeItem);
  const popular = (body.popular || []).map(normalizeItem);
  const newReleases = (body.new_releases || []).map(normalizeItem);
  const featuredPrograms = (body.featured_programs || []).map(normalizeProgram);

  assertMetadataOnly([
    ...(body.featured_items || []),
    ...(body.recommended || []),
    ...(body.popular || []),
    ...(body.new_releases || []),
  ]);

  return {
    ...body,
    featured_items: featuredItems,
    recommended,
    popular,
    new_releases: newReleases,
    featured_programs: featuredPrograms,
    continue_listening: body.continue_listening || [],
    recently_played: body.recently_played || [],
    categories: body.categories || [],
  } satisfies MotivationHomeResponse;
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
  // Category grid only needs program identity fields — drop heavy descriptions early.
  const items = (body.items || []).map((row) => {
    const item = normalizeItem(row);
    return item.description ? { ...item, description: null } : item;
  });
  assertMetadataOnly(body.items || []);
  return { items, pagination: body.pagination };
}

function normalizeCategoryProgramSummary(
  raw: Record<string, unknown>
): MotivationCategoryProgramSummary {
  const cleaned = stripBrowsableFields(raw);
  return {
    program_id: cleanText(cleaned.program_id, 80),
    title: String(cleaned.title || cleaned.series_title || "Untitled"),
    speaker: cleanText(cleaned.speaker, 200) || cleanText(cleaned.speaker_name, 200),
    organization: cleanText(cleaned.organization, 200),
    artwork_url:
      cleanText(cleaned.artwork_url, 2000) ||
      cleanText(cleaned.artwork, 2000) ||
      cleanText(cleaned.thumbnail_url, 2000),
    episode_count: Math.max(0, Number(cleaned.episode_count || cleaned.session_count || 0)),
    category_slug: cleanText(cleaned.category_slug, 120),
    first_item_id: String(cleaned.first_item_id || cleaned.id || ""),
    media_type: cleanText(cleaned.media_type, 40) || "audio",
    source: cleanText(cleaned.source, 80) || cleanText(cleaned.source_type, 80),
    series_title: cleanText(cleaned.series_title, 240),
    volume_count: Math.max(1, Number(cleaned.volume_count || 1)),
  };
}

function looksLikeProgramSummaryRow(row: Record<string, unknown>) {
  if (!row || typeof row !== "object") return false;
  if ("description" in row && String(row.description || "").trim().length > 0) return false;
  if (Array.isArray(row.items)) return false;
  const episodeCount = Number(row.episode_count ?? row.session_count);
  const firstItemId = String(row.first_item_id || "").trim();
  const title = String(row.title || "").trim();
  return Number.isFinite(episodeCount) && episodeCount >= 0 && Boolean(title) && Boolean(firstItemId);
}

/**
 * Category browse as program summaries (`view=programs`).
 * Falls back to one bounded legacy episode page when the contract is unavailable.
 */
export async function fetchMotivationCategoryPrograms(
  slug: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal }
) {
  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(
    MOTIVATION_CATEGORY_PROGRAM_PAGE_LIMIT,
    Math.max(1, Number(options?.limit || MOTIVATION_CATEGORY_PROGRAM_PAGE_LIMIT))
  );
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    view: "programs",
  });
  const body = await fetchMotivationJson<{
    success?: boolean;
    view?: string;
    items?: Record<string, unknown>[];
    pagination?: MotivationOffsetPagination;
    meta?: { source?: string; rpc_available?: boolean };
  }>(`${MOTIVATION_CATEGORY_API_PATH}/${encodeURIComponent(slug)}?${params}`, options?.signal);

  const rows = body.items || [];
  const isProgramView =
    body.view === "programs" &&
    (rows.length === 0 || rows.every((row) => looksLikeProgramSummaryRow(row)));

  if (isProgramView) {
    assertMetadataOnly(rows);
    return {
      mode: "programs" as const,
      items: rows.map(normalizeCategoryProgramSummary),
      pagination: body.pagination,
      meta: body.meta || null,
    };
  }

  // Older backends ignore view=programs and still return episode rows — reuse them once.
  const looksLikeEpisodes =
    rows.length > 0 &&
    rows.every((row) => {
      const id = String(row.id || "").trim();
      const title = String(row.title || "").trim();
      return Boolean(id && title) && !looksLikeProgramSummaryRow(row);
    });

  if (looksLikeEpisodes) {
    if (__DEV__) {
      console.warn(
        "[motivation] category view=programs unavailable; using bounded legacy episode page from same response"
      );
    }
    assertMetadataOnly(rows);
    const items = rows.map((row) => {
      const item = normalizeItem(row);
      return item.description ? { ...item, description: null } : item;
    });
    return {
      mode: "legacy" as const,
      items,
      pagination: body.pagination,
      meta: null,
    };
  }

  if (__DEV__) {
    console.warn(
      "[motivation] category view=programs malformed; requesting bounded legacy episode page"
    );
  }

  const legacy = await fetchMotivationCategoryPage(slug, {
    page,
    limit: Math.min(MOTIVATION_MAX_PAGE_LIMIT, 40),
    signal: options?.signal,
  });
  return {
    mode: "legacy" as const,
    items: legacy.items,
    pagination: legacy.pagination,
    meta: null,
  };
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
  options?: {
    page?: number;
    limit?: number;
    signal?: AbortSignal;
    categorySlug?: string;
  }
) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return {
      items: [],
      pagination: { page: 1, limit: 40, total: 0, totalPages: 0, hasMore: false },
    };
  }
  const page = Math.max(1, Number(options?.page || 1));
  const limit = Math.min(
    MOTIVATION_MAX_PAGE_LIMIT,
    Math.max(1, Number(options?.limit || MOTIVATION_DEFAULT_PAGE_LIMIT))
  );
  const params = new URLSearchParams({ q, page: String(page), limit: String(limit) });
  const categorySlug = String(options?.categorySlug || "").trim();
  if (categorySlug) params.set("category", categorySlug);

  const body = await fetchMotivationJson<{
    items?: Record<string, unknown>[];
    pagination?: MotivationOffsetPagination | MotivationCursorPagination;
  }>(`${MOTIVATION_SEARCH_API_PATH}?${params}`, options?.signal);

  let items = (body.items || []).map(normalizeItem);
  // Hard gate: backend category filter is soft — keep only the active Motivationals category.
  if (categorySlug) {
    items = items.filter((item) => {
      const slug = String(item.category_slug || "").trim();
      const name = String(item.category || "").trim().toLowerCase().replace(/\s+/g, "-");
      return slug === categorySlug || name === categorySlug;
    });
    // Category UI only — drop description payload before grouping.
    items = items.map((item) => (item.description ? { ...item, description: null } : item));
  }
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
