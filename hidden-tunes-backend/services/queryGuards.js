import { sanitizeFilterToken } from "./apiDiagnostics.js";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_PAGE = 500;
const MAX_OFFSET = 50_000;

export function normalizePagination(query = {}) {
  const limit = Math.min(
    Math.max(Number.parseInt(String(query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const page = Math.min(
    Math.max(Number.parseInt(String(query.page || 1), 10) || 1, 1),
    MAX_PAGE
  );

  const offsetFromQuery = query.offset !== undefined ? Number(query.offset) : null;
  const offset =
    offsetFromQuery !== null && Number.isFinite(offsetFromQuery)
      ? Math.min(Math.max(Math.floor(offsetFromQuery), 0), MAX_OFFSET)
      : (page - 1) * limit;

  return {
    limit,
    page,
    offset,
  };
}

export function normalizeSongFilters(query = {}) {
  const search = sanitizeFilterToken(query.q || query.search || "", 80);
  const artistId = sanitizeFilterToken(query.artistId || query.artist_id || "", 120);
  const albumId = sanitizeFilterToken(query.albumId || query.album_id || "", 120);
  const genre = sanitizeFilterToken(query.genre || "", 80);

  return {
    search,
    artistId,
    albumId,
    genre,
  };
}

export function normalizeArtistFilters(query = {}) {
  const search = sanitizeFilterToken(query.q || query.search || "", 80);

  const limit = Math.min(
    Math.max(Number.parseInt(String(query.limit || 100), 10) || 100, 1),
    500
  );

  const page = Math.min(
    Math.max(Number.parseInt(String(query.page || 1), 10) || 1, 1),
    MAX_PAGE
  );

  return {
    search,
    limit,
    page,
    offset: (page - 1) * limit,
  };
}

export function escapeIlikePattern(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
