/**
 * Stable artist identity helpers for catalog navigation.
 * Prefer UUID, then slug, then unambiguous exact name. Never pick the first of many.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ArtistIdentityLike = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
};

export function isArtistUuid(value: unknown): boolean {
  return UUID_RE.test(String(value || "").trim());
}

export function normalizeArtistLookupKey(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve an artist from a list using stable identity rules.
 * Returns null when the reference is missing or a name matches multiple artists.
 */
export function resolveArtistFromList<T extends ArtistIdentityLike>(
  artists: T[],
  ref: unknown,
): T | null {
  const key = String(ref || "").trim();
  if (!key || !Array.isArray(artists) || artists.length === 0) return null;

  const exactId = artists.find((artist) => String(artist.id || "") === key);
  if (exactId) return exactId;

  if (isArtistUuid(key)) {
    return null;
  }

  const normalized = normalizeArtistLookupKey(key);
  if (!normalized) return null;

  const bySlug = artists.filter(
    (artist) => normalizeArtistLookupKey(artist.slug) === normalized,
  );
  if (bySlug.length === 1) return bySlug[0];
  if (bySlug.length > 1) return null;

  const byName = artists.filter(
    (artist) => normalizeArtistLookupKey(artist.name) === normalized,
  );
  if (byName.length === 1) return byName[0];
  return null;
}

export function getStableArtistRouteId(artist: ArtistIdentityLike | null | undefined): string | null {
  const id = String(artist?.id || "").trim();
  if (id) return id;
  return null;
}

export function canOpenArtistProfileById(ref: unknown): boolean {
  const key = String(ref || "").trim();
  return Boolean(key) && key !== "undefined" && key !== "null" && !/^\d+$/.test(key);
}
