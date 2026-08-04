import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
  HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import {
  getCanonicalGenre,
  getCanonicalGenres,
  normalizeGenreKey,
} from "../utils/genreAliases";

type ListenerTrack = Partial<HiddenTunesNormalizedSong> & {
  playCount?: number;
  playedAt?: number;
  lastPlayedAt?: number;
};

export type PreferenceMaps = {
  songs: Map<string, number>;
  artists: Map<string, number>;
  albums: Map<string, number>;
  genres: Map<string, number>;
};

function clean(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function addScore(map: Map<string, number>, key: unknown, score: number) {
  const normalized = clean(key);
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + score);
}

function addGenrePreferenceScore(
  map: Map<string, number>,
  rawGenre: unknown,
  score: number
) {
  const raw = String(rawGenre || "").trim();
  if (!raw) return;

  addScore(map, normalizeGenreKey(raw), score);

  getCanonicalGenres(raw).forEach((coreTitle) => {
    addScore(map, normalizeGenreKey(coreTitle), score);
    addScore(map, clean(coreTitle), score);
  });
}

function recencyScore(item: ListenerTrack, index: number) {
  const playCount = Number(item.playCount || 1);
  const recency = Math.max(1, 8 - index);
  // One accidental play is deliberately weaker than an onboarding choice.
  return Math.min(60, playCount * 6 + recency);
}

export function buildListenerPreferenceMaps(
  recentlyPlayed: ListenerTrack[] = [],
  favorites: ListenerTrack[] = [],
  onboarding: { genres?: string[]; moods?: string[] } = {}
): PreferenceMaps {
  const maps: PreferenceMaps = {
    songs: new Map(),
    artists: new Map(),
    albums: new Map(),
    genres: new Map(),
  };

  recentlyPlayed.forEach((item, index) => {
    const score = recencyScore(item, index);
    addScore(maps.songs, item.id || item.title, score);
    addScore(maps.artists, item.artist || item.artistId, score);
    addScore(maps.albums, item.album || item.albumId, score);
    addGenrePreferenceScore(maps.genres, item.genre, score);
    addGenrePreferenceScore(maps.genres, item.mood, score);
  });

  favorites.forEach((item) => {
    addScore(maps.songs, item.id || item.title, 35);
    addScore(maps.artists, item.artist || item.artistId, 35);
    addScore(maps.albums, item.album || item.albumId, 35);
    addGenrePreferenceScore(maps.genres, item.genre, 35);
    addGenrePreferenceScore(maps.genres, item.mood, 35);
  });

  onboarding.genres?.forEach((genre) => addGenrePreferenceScore(maps.genres, genre, 22));
  onboarding.moods?.forEach((mood) => addGenrePreferenceScore(maps.genres, mood, 18));

  return maps;
}

export function hasListenerPreferences(maps: PreferenceMaps) {
  return (
    maps.songs.size > 0 ||
    maps.artists.size > 0 ||
    maps.albums.size > 0 ||
    maps.genres.size > 0
  );
}

function getGenrePreferenceBoost(
  song: Partial<HiddenTunesNormalizedSong>,
  maps: PreferenceMaps
) {
  const candidates = [song.genre, song.mood]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  let boost = 0;

  candidates.forEach((value) => {
    boost = Math.max(boost, maps.genres.get(normalizeGenreKey(value)) || 0);
    boost = Math.max(boost, maps.genres.get(clean(value)) || 0);

    getCanonicalGenres(value).forEach((coreTitle) => {
      boost = Math.max(boost, maps.genres.get(normalizeGenreKey(coreTitle)) || 0);
      boost = Math.max(boost, maps.genres.get(clean(coreTitle)) || 0);
    });
  });

  return boost;
}

export function scoreSong(
  song: Partial<HiddenTunesNormalizedSong>,
  maps: PreferenceMaps,
  index = 0,
  referenceTime?: number
) {
  const uploadedAt = new Date(song.createdAt || song.updatedAt || 0).getTime();
  const ageDays = Number.isFinite(uploadedAt) && uploadedAt > 0
    ? Math.max(0, ((referenceTime || uploadedAt) - uploadedAt) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const recencyBoost = ageDays <= 7 ? 8 : ageDays <= 30 ? 4 : ageDays <= 90 ? 1 : 0;

  return (
    (maps.songs.get(clean(song.id || song.title)) || 0) +
    (maps.artists.get(clean(song.artist || song.artistId)) || 0) +
    (maps.albums.get(clean(song.album || song.albumId)) || 0) +
    getGenrePreferenceBoost(song, maps) +
    recencyBoost -
    index * 0.01
  );
}

export function rankSongsForListener(
  songs: HiddenTunesNormalizedSong[],
  maps: PreferenceMaps
) {
  const referenceTime = songs.reduce((latest, song) => {
    const timestamp = new Date(song.createdAt || song.updatedAt || 0).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  return songs
    .map((song, index) => ({
      song,
      index,
      score: scoreSong(song, maps, index, referenceTime),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ song }) => song);
}

function rawFlag(song: HiddenTunesNormalizedSong, key: string) {
  return (song.raw as Record<string, unknown> | undefined)?.[key];
}

/** Defensive final gate for normal Home, independent of upstream API filtering. */
export function filterEligibleHomeSongs(songs: HiddenTunesNormalizedSong[]) {
  const ids = new Set<string>();
  const streams = new Set<string>();
  return songs.filter((song) => {
    const id = clean(song.id);
    const stream = clean(song.streamUrl || song.url);
    const status = clean(rawFlag(song, "status"));
    const rating = clean(rawFlag(song, "content_rating"));
    const mature =
      rawFlag(song, "is_mature") === true ||
      rawFlag(song, "explicit") === true ||
      rating === "explicit" ||
      rating === "adult";
    const quarantined =
      rawFlag(song, "quarantined") === true ||
      rawFlag(song, "is_quarantined") === true ||
      status === "quarantined" ||
      status === "invalid";
    const publicFlag = rawFlag(song, "is_public");
    if (
      !id ||
      !stream ||
      !/^https?:\/\//i.test(stream) ||
      mature ||
      quarantined ||
      song.isPublic === false ||
      publicFlag === false
    ) {
      return false;
    }
    if (ids.has(id) || streams.has(stream)) return false;
    ids.add(id);
    streams.add(stream);
    return true;
  });
}

export function selectPersonalizedHomeOrdering<T>(
  enabled: boolean,
  existingOrdering: T[],
  personalizedOrdering: T[]
) {
  return enabled && personalizedOrdering.length ? personalizedOrdering : existingOrdering;
}

function songFacet(song: Partial<HiddenTunesNormalizedSong>, facet: "artist" | "genre") {
  return clean(song[facet]);
}

/** Stable caps prevent a single artist or genre from consuming the personalized Home. */
export function diversifyRankedSongs(
  songs: HiddenTunesNormalizedSong[],
  limit = songs.length,
  artistCap = 4,
  genreCap = 10
) {
  const artists = new Map<string, number>();
  const genres = new Map<string, number>();
  const selected: HiddenTunesNormalizedSong[] = [];

  for (const song of songs) {
    const artist = songFacet(song, "artist");
    const genre = songFacet(song, "genre");
    const artistCount = artist ? artists.get(artist) || 0 : 0;
    const genreCount = genre ? genres.get(genre) || 0 : 0;
    if ((artist && artistCount >= artistCap) || (genre && genreCount >= genreCap)) {
      continue;
    }
    selected.push(song);
    if (artist) artists.set(artist, artistCount + 1);
    if (genre) genres.set(genre, genreCount + 1);
    if (selected.length >= limit) return selected;
  }

  return selected;
}

export function rankRelevantNewReleases(
  songs: HiddenTunesNormalizedSong[],
  maps: PreferenceMaps,
  limit = 12,
  discoveryRatio = 0.1
) {
  const safeSongs = filterEligibleHomeSongs(songs);
  const newest = safeSongs.map((song, index) => ({ song, index })).sort((a, b) => {
    const aSong = a.song;
    const bSong = b.song;
    const aTime = new Date(aSong.createdAt || aSong.updatedAt || 0).getTime() || 0;
    const bTime = new Date(bSong.createdAt || bSong.updatedAt || 0).getTime() || 0;
    return bTime - aTime || a.index - b.index;
  }).map(({ song }) => song);
  if (!hasListenerPreferences(maps)) return diversifyRankedSongs(newest, limit, 2, 4);

  const referenceTime = newest.reduce((latest, song) => {
    const timestamp = new Date(song.createdAt || song.updatedAt || 0).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  const relevant = newest.filter(
    (song, index) => scoreSong(song, maps, index, referenceTime) >= 18
  );
  const relevantIds = new Set(relevant.map((song) => clean(song.id || song.title)));
  const boundedDiscoveryRatio = Math.min(0.15, Math.max(0.05, discoveryRatio));
  const discoveryCount = Math.max(1, Math.floor(limit * boundedDiscoveryRatio));
  const discovery = newest
    .filter((song) => !relevantIds.has(clean(song.id || song.title)))
    .slice(0, discoveryCount);
  return diversifyRankedSongs([...relevant, ...discovery], limit, 2, 5);
}

export function rankArtistsForListener(
  artists: HiddenTunesArtist[],
  maps: PreferenceMaps
) {
  return [...artists].sort((a, b) => {
    const aScore =
      (maps.artists.get(clean(a.name || a.id)) || 0) +
      (a.tracks?.length || 0) * 2;
    const bScore =
      (maps.artists.get(clean(b.name || b.id)) || 0) +
      (b.tracks?.length || 0) * 2;

    return bScore - aScore;
  });
}

export function rankAlbumsForListener(
  albums: HiddenTunesAlbum[],
  maps: PreferenceMaps
) {
  return [...albums].sort((a, b) => {
    const aScore =
      (maps.albums.get(clean(a.title || a.id)) || 0) +
      (maps.artists.get(clean(a.artist || a.artistId)) || 0) +
      (a.tracks?.length || 0);
    const bScore =
      (maps.albums.get(clean(b.title || b.id)) || 0) +
      (maps.artists.get(clean(b.artist || b.artistId)) || 0) +
      (b.tracks?.length || 0);

    return bScore - aScore;
  });
}

export function scoreGenre(title: string, maps: PreferenceMaps, catalogCount = 0) {
  const canonical = getCanonicalGenre(title) || title;

  return (
    Math.max(
      maps.genres.get(clean(title)) || 0,
      maps.genres.get(normalizeGenreKey(title)) || 0,
      maps.genres.get(clean(canonical)) || 0,
      maps.genres.get(normalizeGenreKey(canonical)) || 0
    ) +
    catalogCount * 2
  );
}
