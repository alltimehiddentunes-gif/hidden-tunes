export const RADIO_PUBLIC_STATION_SELECT =
  "id, name, favicon_url, country, country_code, state, language, tags, bitrate, codec, votes, click_count, category_slug, categories, quality_score, reliability_score, is_featured, is_mature, content_rating";

export const RADIO_PUBLIC_STATION_SELECT_WITH_STREAM =
  "id, name, favicon_url, country, country_code, state, language, tags, bitrate, codec, votes, click_count, category_slug, categories, quality_score, reliability_score, is_featured, is_mature, content_rating, stream_url";

export const RADIO_PLAY_STATION_SELECT =
  "id, name, stream_url, source_type, source_station_uuid, status, playback_status, is_active, is_verified, is_mature, quality_score, reliability_score, quarantined_at, disabled_at";

export const RADIO_DEFAULT_PAGE_SIZE = 40;
export const RADIO_MAX_PAGE_SIZE = 40;
export const RADIO_PUBLIC_RELIABILITY_THRESHOLD = 60;

export type RadioPublicStation = {
  id: string;
  name: string;
  artwork_url: string | null;
  country: string | null;
  country_code: string | null;
  state: string | null;
  language: string | null;
  tags: string[];
  categories: string[];
  bitrate: number | null;
  codec: string | null;
  popularity: {
    votes: number;
    click_count: number;
  };
  quality_score: number;
  reliability_score: number;
  is_featured: boolean;
  is_mature: boolean;
  content_rating: string | null;
  /** Present only when the caller requests include_stream=1. */
  stream_url?: string | null;
};

export type RadioPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function cleanRadioText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanRadioFilterToken(value: unknown, maxLength = 120) {
  return cleanRadioText(value, maxLength)
    .replace(/[(),{}]/g, " ")
    .replace(/[%_]/g, "\\$&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRadioPage(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(10_000, Math.floor(parsed));
}

export function parseRadioLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return RADIO_DEFAULT_PAGE_SIZE;
  return Math.min(RADIO_MAX_PAGE_SIZE, Math.floor(parsed));
}

export function parseRadioBoolean(value: string | null) {
  const normalized = cleanRadioText(value, 20).toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return null;
}

export function buildRadioPagination(
  page: number,
  limit: number,
  total: number
): RadioPagination {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanRadioText(item, 80).toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getRadioReliabilityScore(row: Record<string, unknown>) {
  return normalizeScore(row.reliability_score ?? row.quality_score);
}

type RadioFilterBuilder<T> = {
  eq(column: string, value: unknown): T;
  is(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  or(filters: string): T;
  ilike(column: string, pattern: string): T;
};

export function isPublicRadioRow(row: Record<string, unknown>) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.is_verified === true &&
    row.playback_status === "playable" &&
    row.is_mature !== true &&
    !row.quarantined_at &&
    !row.disabled_at &&
    getRadioReliabilityScore(row) >= RADIO_PUBLIC_RELIABILITY_THRESHOLD
  );
}

export function buildRadioTextSearchOrFilter(searchQuery: string | null | undefined) {
  const cleaned = cleanRadioFilterToken(searchQuery, 120);
  if (!cleaned) return null;

  const escaped = cleaned.replace(/[%_]/g, "\\$&");
  const tagToken = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const parts = [
    `name.ilike.%${escaped}%`,
    `normalized_name.ilike.%${escaped}%`,
    `country.ilike.%${escaped}%`,
    `country_code.ilike.%${escaped}%`,
    `state.ilike.%${escaped}%`,
    `language.ilike.%${escaped}%`,
    `category_slug.ilike.%${escaped}%`,
  ];

  if (tagToken) {
    parts.push(`tags.cs.{${tagToken}}`);
    parts.push(`categories.cs.{${tagToken}}`);
  }

  return parts.join(",");
}

export function toRadioPublicStation(
  row: Record<string, unknown>,
  options?: { includeStream?: boolean }
): RadioPublicStation {
  const tags = normalizeStringArray(row.tags);
  const categories = Array.from(
    new Set([
      ...normalizeStringArray(row.categories),
      cleanRadioText(row.category_slug, 80).toLowerCase(),
      ...tags.slice(0, 4),
    ].filter(Boolean))
  ).slice(0, 12);

  const station: RadioPublicStation = {
    id: cleanRadioText(row.id, 120),
    name: cleanRadioText(row.name, 300) || "Radio Station",
    artwork_url: cleanRadioText(row.favicon_url, 2000) || null,
    country: cleanRadioText(row.country, 120) || null,
    country_code: cleanRadioText(row.country_code, 8).toUpperCase() || null,
    state: cleanRadioText(row.state, 120) || null,
    language: cleanRadioText(row.language, 120) || null,
    tags,
    categories,
    bitrate: Number.isFinite(Number(row.bitrate)) ? Number(row.bitrate) : null,
    codec: cleanRadioText(row.codec, 80) || null,
    popularity: {
      votes: Math.max(0, Math.floor(Number(row.votes) || 0)),
      click_count: Math.max(0, Math.floor(Number(row.click_count) || 0)),
    },
    quality_score: normalizeScore(row.quality_score),
    reliability_score: getRadioReliabilityScore(row),
    is_featured: row.is_featured === true,
    is_mature: row.is_mature === true,
    content_rating: cleanRadioText(row.content_rating, 40) || null,
  };

  if (options?.includeStream) {
    const url = cleanRadioText(row.stream_url, 2000) || null;
    // Never expose cleartext upstream URLs in list payloads; /play returns HTTPS (direct or relay).
    station.stream_url = url && url.startsWith("https://") ? url : null;
  }

  return station;
}

export function applyPublicRadioFilters<T extends RadioFilterBuilder<T>>(
  query: T,
  filters: {
    category?: string | null;
    country?: string | null;
    language?: string | null;
    featured?: boolean | null;
    includeMature?: boolean | null;
    searchQuery?: string | null;
    httpsOnly?: boolean | null;
  }
) {
  let next = query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD);

  if (filters.includeMature) {
    next = next
      .eq("is_mature", true)
      .eq("mature_source_approved", true)
      .eq("mature_review_status", "confirmed")
      .eq("rights_status", "approved")
      .eq("is_free", true);
  } else {
    next = next.eq("is_mature", false);
  }

  if (filters.httpsOnly) {
    // Client-ATS playable: direct HTTPS, or HTTP that /play can wrap in the HTTPS relay.
    next = next.or("stream_url.ilike.https://%,stream_url.ilike.http://%");
  }

  if (filters.featured !== null && filters.featured !== undefined) {
    next = next.eq("is_featured", filters.featured);
  }

  const category = cleanRadioFilterToken(filters.category, 80).toLowerCase();
  if (category) {
    next = next.or(`category_slug.eq.${category},categories.cs.{${category}},tags.cs.{${category}}`);
  }

  const country = cleanRadioFilterToken(filters.country, 80);
  if (country) {
    next = next.or(`country.ilike.%${country}%,country_code.ilike.${country}`);
  }

  const language = cleanRadioFilterToken(filters.language, 80);
  if (language) {
    next = next.ilike("language", `%${language}%`);
  }

  const searchOr = buildRadioTextSearchOrFilter(filters.searchQuery);
  if (searchOr) {
    next = next.or(searchOr);
  }

  return next;
}

export function jsonRadioError(error: string, status: number, details?: unknown) {
  return Response.json(
    {
      success: false,
      error,
      details: details || null,
    },
    { status }
  );
}
