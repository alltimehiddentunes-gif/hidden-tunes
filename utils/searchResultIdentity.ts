/**
 * Deterministic, content-type-namespaced React keys for Search results.
 * Duplicate same-type rows must be removed at the source, not masked with index/random.
 */

import { albumGroupKey, canonicalArtistId } from "./hiddenTunesAlbumIdentity";

export type SearchResultContentType =
  | "song"
  | "album"
  | "artist"
  | "genre"
  | "station"
  | "playlist"
  | "tv"
  | "radio"
  | "podcast"
  | "podcast_show"
  | "podcast_episode"
  | "audiobook"
  | "motivational"
  | "lecture"
  | "external";

export type SearchResultKeyDiagnostic = {
  contentType: SearchResultContentType;
  source: string;
  rawId: string;
  canonicalId: string;
  reactKey: string;
  title: string;
  secondary: string;
};

export function stableSearchId(value: unknown, fallback = "") {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildSearchReactKey(
  contentType: SearchResultContentType,
  stableId: string
) {
  const id = stableSearchId(stableId);
  if (!id) return `${contentType}:missing`;
  if (id.startsWith(`${contentType}:`)) return id;
  return `${contentType}:${id}`;
}

export function albumSearchCanonicalId(album: {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
}) {
  const group = albumGroupKey(album.artist, album.title);
  if (group && !group.startsWith("unknown-artist\0")) {
    return group.replace(/\0/g, "--");
  }
  return stableSearchId(album.id) || group.replace(/\0/g, "--");
}

export function artistSearchCanonicalId(artist: {
  id?: unknown;
  name?: unknown;
}) {
  const fromName = canonicalArtistId(artist.name);
  const fromId = stableSearchId(artist.id);
  if (fromId && !fromId.startsWith("artist:")) return fromId;
  return fromName || fromId;
}

export function dedupeSearchRowsByCanonicalId<T>(
  items: T[],
  getCanonicalId: (item: T) => string
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = stableSearchId(getCanonicalId(item));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

export function findDuplicateSearchReactKeys(
  diagnostics: SearchResultKeyDiagnostic[]
): SearchResultKeyDiagnostic[] {
  const counts = new Map<string, number>();
  for (const row of diagnostics) {
    counts.set(row.reactKey, (counts.get(row.reactKey) || 0) + 1);
  }
  return diagnostics.filter((row) => (counts.get(row.reactKey) || 0) > 1);
}

export function buildSearchKeyDiagnostics(options: {
  songs?: Array<{ id?: unknown; title?: unknown; artist?: unknown; source?: unknown }>;
  albums?: Array<{ id?: unknown; title?: unknown; artist?: unknown }>;
  artists?: Array<{ id?: unknown; name?: unknown }>;
  genres?: Array<{ id?: unknown; title?: unknown }>;
  stations?: Array<{ id?: unknown; title?: unknown }>;
  playlists?: Array<{ id?: unknown; title?: unknown }>;
  tv?: Array<{ id?: unknown; title?: unknown; channel?: unknown }>;
  radio?: Array<{ id?: unknown; name?: unknown; title?: unknown }>;
  podcasts?: Array<{
    kind?: string;
    show?: { id?: unknown; title?: unknown; author?: unknown };
    episode?: { id?: unknown; title?: unknown; author?: unknown };
  }>;
  external?: Array<{ id?: unknown; title?: unknown; artist?: unknown }>;
}): SearchResultKeyDiagnostic[] {
  const rows: SearchResultKeyDiagnostic[] = [];

  for (const song of options.songs || []) {
    const rawId = stableSearchId(song.id);
    rows.push({
      contentType: "song",
      source: stableSearchId(song.source, "catalog"),
      rawId,
      canonicalId: rawId,
      reactKey: buildSearchReactKey("song", rawId),
      title: stableSearchId(song.title),
      secondary: stableSearchId(song.artist),
    });
  }

  for (const album of options.albums || []) {
    const rawId = stableSearchId(album.id);
    const canonicalId = albumSearchCanonicalId(album);
    rows.push({
      contentType: "album",
      source: "search",
      rawId,
      canonicalId,
      reactKey: buildSearchReactKey("album", canonicalId || rawId),
      title: stableSearchId(album.title),
      secondary: stableSearchId(album.artist),
    });
  }

  for (const artist of options.artists || []) {
    const rawId = stableSearchId(artist.id);
    const canonicalId = artistSearchCanonicalId(artist);
    rows.push({
      contentType: "artist",
      source: "search",
      rawId,
      canonicalId,
      reactKey: buildSearchReactKey("artist", canonicalId || rawId),
      title: stableSearchId(artist.name),
      secondary: "",
    });
  }

  for (const genre of options.genres || []) {
    const rawId = stableSearchId(genre.id) || stableSearchId(genre.title);
    rows.push({
      contentType: "genre",
      source: "search",
      rawId,
      canonicalId: rawId,
      reactKey: buildSearchReactKey("genre", rawId),
      title: stableSearchId(genre.title),
      secondary: "",
    });
  }

  for (const station of options.stations || []) {
    const rawId = stableSearchId(station.id);
    rows.push({
      contentType: "station",
      source: "search",
      rawId,
      canonicalId: rawId,
      reactKey: buildSearchReactKey("station", rawId),
      title: stableSearchId(station.title),
      secondary: "",
    });
  }

  for (const playlist of options.playlists || []) {
    const rawId = stableSearchId(playlist.id);
    rows.push({
      contentType: "playlist",
      source: "search",
      rawId,
      canonicalId: rawId,
      reactKey: buildSearchReactKey("playlist", rawId),
      title: stableSearchId(playlist.title),
      secondary: "",
    });
  }

  for (const video of options.tv || []) {
    const rawId = stableSearchId(video.id);
    rows.push({
      contentType: "tv",
      source: "tv",
      rawId,
      canonicalId: rawId,
      reactKey: buildSearchReactKey("tv", rawId),
      title: stableSearchId(video.title),
      secondary: stableSearchId(video.channel),
    });
  }

  for (const station of options.radio || []) {
    const rawId = stableSearchId(station.id);
    rows.push({
      contentType: "radio",
      source: "radio",
      rawId,
      canonicalId: rawId,
      reactKey: buildSearchReactKey("radio", rawId),
      title: stableSearchId(station.name || station.title),
      secondary: "",
    });
  }

  for (const result of options.podcasts || []) {
    if (result.kind === "show" && result.show) {
      const rawId = stableSearchId(result.show.id);
      rows.push({
        contentType: "podcast_show",
        source: "podcast",
        rawId,
        canonicalId: rawId,
        reactKey: buildSearchReactKey("podcast", `show:${rawId}`),
        title: stableSearchId(result.show.title),
        secondary: stableSearchId(result.show.author),
      });
    } else if (result.episode) {
      const rawId = stableSearchId(result.episode.id);
      rows.push({
        contentType: "podcast_episode",
        source: "podcast",
        rawId,
        canonicalId: rawId,
        reactKey: buildSearchReactKey("podcast", `episode:${rawId}`),
        title: stableSearchId(result.episode.title),
        secondary: stableSearchId(result.episode.author),
      });
    }
  }

  for (const song of options.external || []) {
    const rawId = stableSearchId(song.id);
    rows.push({
      contentType: "external",
      source: "external",
      rawId,
      canonicalId: rawId,
      reactKey: buildSearchReactKey("external", rawId),
      title: stableSearchId(song.title),
      secondary: stableSearchId(song.artist),
    });
  }

  return rows;
}

/**
 * Generation gate for stale async search responses.
 * Newer queries bump the generation; older completions must not apply.
 */
export function createSearchRequestGate() {
  let generation = 0;

  return {
    next() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
      return generation;
    },
    isCurrent(token: number) {
      return token === generation;
    },
    get current() {
      return generation;
    },
  };
}
