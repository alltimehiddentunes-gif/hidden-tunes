import { isArtistUuid } from "./artistIdentity";

export const EXPLORE_ARTIST_PAGE_SIZE = 6;

export type CanonicalArtistRecord = {
  id: string;
};

export function appendCanonicalArtistPage<T extends CanonicalArtistRecord>(
  existing: readonly T[],
  incoming: readonly T[]
) {
  const seen = new Set(
    existing
      .map((artist) => String(artist.id || "").trim().toLowerCase())
      .filter(isArtistUuid)
  );
  const appended: T[] = [];
  let rejectedCount = 0;

  incoming.forEach((artist) => {
    const id = String(artist.id || "").trim().toLowerCase();
    if (!isArtistUuid(id) || seen.has(id)) {
      rejectedCount += 1;
      return;
    }
    seen.add(id);
    appended.push({ ...artist, id });
  });

  return {
    artists: [...existing, ...appended],
    appendedCount: appended.length,
    rejectedCount,
  };
}

export function canRequestArtistPage(options: {
  page: number;
  hasMore: boolean;
  inFlightPages: ReadonlySet<number>;
}) {
  return (
    Number.isInteger(options.page) &&
    options.page > 0 &&
    options.hasMore &&
    !options.inFlightPages.has(options.page)
  );
}
