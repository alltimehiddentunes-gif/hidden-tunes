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

type PreferenceMaps = {
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
  const recency = Math.max(1, 20 - index);
  return playCount * 10 + recency;
}

export function buildListenerPreferenceMaps(
  recentlyPlayed: ListenerTrack[] = [],
  favorites: ListenerTrack[] = []
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

  return maps;
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
  index = 0
) {
  const uploadedAt = new Date(song.createdAt || song.updatedAt || 0).getTime();
  const recencyBoost = Number.isFinite(uploadedAt) && uploadedAt > 0 ? 8 : 0;

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
  return [...songs].sort((a, b) => scoreSong(b, maps) - scoreSong(a, maps));
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
