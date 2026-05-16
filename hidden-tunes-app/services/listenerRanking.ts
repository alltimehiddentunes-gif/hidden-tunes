import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
  HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";

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
    addScore(maps.genres, item.genre || item.mood, score);
  });

  favorites.forEach((item) => {
    addScore(maps.songs, item.id || item.title, 35);
    addScore(maps.artists, item.artist || item.artistId, 35);
    addScore(maps.albums, item.album || item.albumId, 35);
    addScore(maps.genres, item.genre || item.mood, 35);
  });

  return maps;
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
    (maps.genres.get(clean(song.genre || song.mood)) || 0) +
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
  return (maps.genres.get(clean(title)) || 0) + catalogCount * 2;
}
