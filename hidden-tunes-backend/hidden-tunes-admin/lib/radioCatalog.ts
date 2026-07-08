import { NextResponse } from "next/server";

export const RADIO_DEFAULT_PAGE_SIZE = 40;
export const RADIO_MAX_PAGE_SIZE = 40;
export const RADIO_PUBLIC_STATION_SELECT =
  "id, name, favicon_url, country, country_code, language, tags, bitrate, codec, votes, click_count, category_slug, categories, is_featured, is_verified, is_mature, mature_reason, content_rating, quality_score, created_at";
export const RADIO_PLAY_STATION_SELECT =
  "id, stream_url, status, playback_status, is_active";

export type RadioPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function jsonRadioError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error,
      details: details || null,
    },
    { status }
  );
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
  if (!value) return false;
  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

export function cleanRadioFilter(value: string | null, maxLength = 120) {
  const cleaned = String(value || "").trim().slice(0, maxLength);
  return cleaned || null;
}

export function cleanRadioToken(value: string | null, maxLength = 80) {
  const cleaned = cleanRadioFilter(value, maxLength);
  if (!cleaned) return null;
  return /^[a-z0-9][a-z0-9_-]*$/i.test(cleaned) ? cleaned : null;
}

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((entry) => cleanText(entry, 80))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 12);
}

function normalizeScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
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

export function toRadioPublicStation(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    name: String(row.name || "Hidden Tunes Radio"),
    title: String(row.name || "Hidden Tunes Radio"),
    favicon_url: cleanText(row.favicon_url, 2000),
    logo_url: cleanText(row.favicon_url, 2000),
    country: cleanText(row.country_code, 8) || cleanText(row.country, 120),
    country_code: cleanText(row.country_code, 8),
    language: cleanText(row.language, 120),
    tags: normalizeTags(row.tags),
    bitrate: Number.isFinite(Number(row.bitrate)) ? Number(row.bitrate) : null,
    codec: cleanText(row.codec, 80),
    votes: Number.isFinite(Number(row.votes)) ? Number(row.votes) : null,
    click_count: Number.isFinite(Number(row.click_count)) ? Number(row.click_count) : null,
    category_slug: cleanText(row.category_slug, 120),
    categories: normalizeTags(row.categories),
    is_featured: row.is_featured === true,
    is_verified: row.is_verified === true,
    is_mature: row.is_mature === true,
    mature_reason: cleanText(row.mature_reason, 200),
    content_rating: cleanText(row.content_rating, 40),
    quality_score: normalizeScore(row.quality_score),
    created_at: cleanText(row.created_at, 80),
  };
}
