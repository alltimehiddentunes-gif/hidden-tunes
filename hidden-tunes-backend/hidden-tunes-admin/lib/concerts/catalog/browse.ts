/**
 * Metadata-only Concerts browse helpers.
 * Pagination / cursors; no stream preload; playback resolved only after tap.
 */

export type ConcertBrowseItem = {
  id: string;
  title: string;
  primaryArtistName: string | null;
  artworkUrl: string | null;
  concertType: string | null;
  countryCode: string | null;
  languageCode: string | null;
  provider: string | null;
  visibilityStatus: string;
  isLive: boolean;
  isUpcoming: boolean;
  isReplay: boolean;
  startAt: string | null;
  durationSeconds: number | null;
  regionAvailability: string | null;
};

export type ConcertBrowsePage = {
  items: ConcertBrowseItem[];
  nextCursor: string | null;
  pageSize: number;
};

export function clampConcertBrowsePageSize(raw: number | string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 24;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

export function encodeConcertBrowseCursor(input: {
  publishedAt: string;
  id: string;
}): string {
  return Buffer.from(`${input.publishedAt}|${input.id}`, "utf8").toString("base64url");
}

export function decodeConcertBrowseCursor(
  cursor: string | null | undefined
): { publishedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(String(cursor), "base64url").toString("utf8");
    const [publishedAt, id] = raw.split("|");
    if (!publishedAt || !id) return null;
    return { publishedAt, id };
  } catch {
    return null;
  }
}

/** Map DB row → browse DTO without playback URLs. */
export function mapConcertRowToBrowseItem(row: Record<string, unknown>): ConcertBrowseItem {
  const stream = Array.isArray(row.concert_streams)
    ? (row.concert_streams[0] as Record<string, unknown> | undefined)
    : (row.concert_streams as Record<string, unknown> | undefined);

  const provider =
    (row.provider as string) ||
    (stream?.provider as string) ||
    null;
  const providerContentId =
    (row.provider_content_id as string) ||
    (stream?.provider_content_id as string) ||
    null;

  let artworkUrl = (row.artwork_url as string) || null;
  if (
    !artworkUrl &&
    provider === "youtube" &&
    providerContentId &&
    /^[\w-]{11}$/.test(providerContentId)
  ) {
    artworkUrl = `https://i.ytimg.com/vi/${providerContentId}/hqdefault.jpg`;
  }

  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    primaryArtistName: (row.primary_artist_name as string) || null,
    artworkUrl,
    concertType: (row.concert_type as string) || null,
    countryCode: (row.country_code as string) || null,
    languageCode: (row.language_code as string) || null,
    provider,
    visibilityStatus: String(row.visibility_status || ""),
    isLive: Boolean(row.is_live),
    isUpcoming: Boolean(row.is_upcoming),
    isReplay: Boolean(row.is_replay),
    startAt: (row.start_at as string) || null,
    durationSeconds:
      row.duration_seconds == null ? null : Number(row.duration_seconds),
    regionAvailability: (row.region_availability as string) || null,
  };
}
