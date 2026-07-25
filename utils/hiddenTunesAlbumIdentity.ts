/**
 * Pure album-identity helpers for Hidden Tunes catalog derive.
 * No React Native imports — safe for Node unit tests.
 */

export function slugifyCatalogToken(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanCatalogString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const clean = value.trim();
  return clean || fallback;
}

export function normalizeAlbumLabel(value: unknown) {
  return cleanCatalogString(value).replace(/\s+/g, " ").toLowerCase();
}

/** Same artist-identity strategy as buildArtists — punctuation/case variants merge. */
export function canonicalArtistId(artist: unknown) {
  return (
    slugifyCatalogToken(cleanCatalogString(artist, "Unknown Artist")) ||
    "unknown-artist"
  );
}

export function canonicalAlbumSlug(album: unknown) {
  return (
    slugifyCatalogToken(normalizeAlbumLabel(album) || "singles") || "singles"
  );
}

/** Group key: already-canonical artist + album so name variants share one group. */
export function albumGroupKey(artist: unknown, album: unknown) {
  return `${canonicalArtistId(artist)}\0${canonicalAlbumSlug(album)}`;
}

/**
 * Prefer legacy-compatible slug ids (artist:album → artist-album) when unique;
 * otherwise use an unambiguous artist--album form (and numeric suffix if needed).
 */
export function assignUniqueAlbumCatalogId(
  artistId: string,
  albumSlug: string,
  claimedIds: Set<string>
) {
  const legacyCompatible =
    slugifyCatalogToken(`${artistId}:${albumSlug}`) ||
    `${artistId}-${albumSlug}`;
  const unambiguous = `${artistId}--${albumSlug}`;

  let id = claimedIds.has(legacyCompatible) ? unambiguous : legacyCompatible;
  if (claimedIds.has(id)) {
    let suffix = 2;
    let candidate = `${unambiguous}--${suffix}`;
    while (claimedIds.has(candidate)) {
      suffix += 1;
      candidate = `${unambiguous}--${suffix}`;
    }
    id = candidate;
  }
  claimedIds.add(id);
  return id;
}

export function preferredCatalogDisplayName(values: string[], fallback: string) {
  const nameCounts = new Map<string, number>();
  values.forEach((name) => {
    const clean = cleanCatalogString(name, fallback);
    nameCounts.set(clean, (nameCounts.get(clean) || 0) + 1);
  });

  let preferred = fallback;
  let preferredCount = -1;
  nameCounts.forEach((count, name) => {
    if (count > preferredCount) {
      preferred = name;
      preferredCount = count;
    }
  });
  return preferred;
}

export type AlbumIdentitySong = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  artwork?: string;
};

export type AlbumIdentityRow = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  songs: AlbumIdentitySong[];
};

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const key = getKey(item);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  });
  return grouped;
}

/**
 * Build unique album rows from songs using canonical artist/album identity.
 */
export function buildAlbumsFromSongs(
  songs: AlbumIdentitySong[],
  fallbackArtwork: string
): AlbumIdentityRow[] {
  const claimedIds = new Set<string>();

  return Array.from(
    groupBy(songs, (song) => albumGroupKey(song.artist, song.album)).entries()
  ).map(([groupKey, albumSongs]) => {
    const separator = groupKey.indexOf("\0");
    const artistId =
      separator >= 0 ? groupKey.slice(0, separator) : "unknown-artist";
    const albumSlug =
      separator >= 0 ? groupKey.slice(separator + 1) : "singles";

    const title = preferredCatalogDisplayName(
      albumSongs.map((song) => cleanCatalogString(song.album, "Singles")),
      "Singles"
    );
    const artist = preferredCatalogDisplayName(
      albumSongs.map((song) =>
        cleanCatalogString(song.artist, "Unknown Artist")
      ),
      "Unknown Artist"
    );
    const artwork =
      albumSongs.find((song) => song.cover || song.artwork)?.cover ||
      albumSongs.find((song) => song.artwork)?.artwork ||
      fallbackArtwork;

    return {
      id: assignUniqueAlbumCatalogId(artistId, albumSlug, claimedIds),
      title,
      artist,
      artwork,
      songs: albumSongs,
    };
  });
}
