export type DiscoverySong = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  mood?: string;
  streamUrl?: string;
  url?: string;
  audioUrl?: string;
  artwork?: string;
  cover?: string;
  thumbnail?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

export type DiscoveryPreferenceMaps = {
  songs?: Map<string, number>;
  artists?: Map<string, number>;
  albums?: Map<string, number>;
  genres?: Map<string, number>;
};

export type SmartDiscoverySection<T extends DiscoverySong = DiscoverySong> = {
  id: string;
  title: string;
  subtitle: string;
  songs: T[];
  artwork: string[];
  preview: string[];
  score: number;
};

const DEFAULT_SECTION_LIMIT = 10;

function cleanKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function displayValue(value: unknown) {
  return String(value || "").trim();
}

function songKey(song: DiscoverySong) {
  return String(song.id || song.streamUrl || song.url || song.audioUrl || "").trim();
}

function dedupeSongs<T extends DiscoverySong>(songs: T[]) {
  const seen = new Set<string>();

  return songs.filter((song) => {
    const key = songKey(song);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function artworkFor(song: DiscoverySong) {
  return String(song.artwork || song.cover || song.thumbnail || "").trim();
}

function uploadedAt(song: DiscoverySong) {
  const value = new Date(song.createdAt || song.updatedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function preferenceScore(
  song: DiscoverySong,
  maps?: DiscoveryPreferenceMaps,
  index = 0
) {
  const songScore = maps?.songs?.get(cleanKey(song.id || song.title)) || 0;
  const artistScore = maps?.artists?.get(cleanKey(song.artist)) || 0;
  const albumScore = maps?.albums?.get(cleanKey(song.album)) || 0;
  const genreScore =
    (maps?.genres?.get(cleanKey(song.genre)) || 0) +
    (maps?.genres?.get(cleanKey(song.mood)) || 0);

  return songScore + artistScore + albumScore + genreScore - index * 0.01;
}

function groupByExactField<T extends DiscoverySong>(
  songs: T[],
  field: "genre" | "mood",
  fallbackTitle: string
) {
  const groups = new Map<string, T[]>();

  songs.forEach((song) => {
    const value = displayValue(song[field]) || fallbackTitle;
    const current = groups.get(value) || [];
    current.push(song);
    groups.set(value, current);
  });

  return groups;
}

export function buildBecauseYouListened<T extends DiscoverySong>(
  songs: T[],
  recentlyPlayed: DiscoverySong[] = [],
  favorites: DiscoverySong[] = [],
  limit = DEFAULT_SECTION_LIMIT
) {
  const recentArtists = new Set(recentlyPlayed.map((song) => cleanKey(song.artist)));
  const recentAlbums = new Set(recentlyPlayed.map((song) => cleanKey(song.album)));
  const recentGenres = new Set(recentlyPlayed.map((song) => cleanKey(song.genre)));
  const recentMoods = new Set(recentlyPlayed.map((song) => cleanKey(song.mood)));
  const favoriteArtists = new Set(favorites.map((song) => cleanKey(song.artist)));
  const favoriteAlbums = new Set(favorites.map((song) => cleanKey(song.album)));
  const favoriteGenres = new Set(favorites.map((song) => cleanKey(song.genre)));
  const favoriteMoods = new Set(favorites.map((song) => cleanKey(song.mood)));

  return dedupeSongs(songs)
    .map((song, index) => {
      const artist = cleanKey(song.artist);
      const album = cleanKey(song.album);
      const genre = cleanKey(song.genre);
      const mood = cleanKey(song.mood);
      let score = uploadedAt(song) > 0 ? 2 : 0;

      if (artist && recentArtists.has(artist)) score += 10;
      if (artist && favoriteArtists.has(artist)) score += 12;
      if (album && recentAlbums.has(album)) score += 6;
      if (album && favoriteAlbums.has(album)) score += 8;
      if (genre && recentGenres.has(genre)) score += 7;
      if (genre && favoriteGenres.has(genre)) score += 9;
      if (mood && recentMoods.has(mood)) score += 7;
      if (mood && favoriteMoods.has(mood)) score += 9;

      return { song, score: score - index * 0.01 };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.song)
    .slice(0, limit);
}

export function buildMoreLikeThisMood<T extends DiscoverySong>(
  songs: T[],
  currentSong?: DiscoverySong | null,
  recentlyPlayed: DiscoverySong[] = [],
  limit = DEFAULT_SECTION_LIMIT
) {
  const seedMood =
    displayValue(currentSong?.mood) ||
    displayValue(recentlyPlayed.find((song) => displayValue(song.mood))?.mood);

  if (!seedMood) {
    return {
      mood: "",
      songs: [] as T[],
    };
  }

  const currentKey = currentSong ? songKey(currentSong) : "";
  const related = dedupeSongs(
    songs.filter((song) => displayValue(song.mood) === seedMood)
  ).filter((song) => songKey(song) !== currentKey);

  return {
    mood: seedMood,
    songs: related.slice(0, limit),
  };
}

export function buildRecentlyDiscovered<T extends DiscoverySong>(
  songs: T[],
  limit = DEFAULT_SECTION_LIMIT
) {
  return dedupeSongs([...songs])
    .sort((a, b) => uploadedAt(b) - uploadedAt(a))
    .slice(0, limit);
}

export function buildMoodRooms<T extends DiscoverySong>(
  songs: T[],
  maps?: DiscoveryPreferenceMaps,
  limit = 6
) {
  const groups = groupByExactField(dedupeSongs(songs), "mood", "Mood Unknown");

  return Array.from(groups.entries())
    .filter(([, groupSongs]) => groupSongs.length > 0)
    .map(([title, groupSongs]) => {
      const score =
        groupSongs.reduce((total, song, index) => {
          return total + preferenceScore(song, maps, index);
        }, 0) + groupSongs.length;

      return {
        id: `mood-${title}`,
        title,
        subtitle:
          title === "Mood Unknown"
            ? "Songs waiting for a mood label"
            : `Songs carrying the ${title} feeling`,
        songs: groupSongs.slice(0, DEFAULT_SECTION_LIMIT),
        artwork: groupSongs.map(artworkFor).filter(Boolean).slice(0, 3),
        preview: groupSongs
          .map((song) => displayValue(song.title) || "Hidden Tunes")
          .slice(0, 3),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildGenreSpotlights<T extends DiscoverySong>(
  songs: T[],
  maps?: DiscoveryPreferenceMaps,
  limit = 6
) {
  const songsWithGenre = dedupeSongs(songs).filter((song) => displayValue(song.genre));
  const groups = groupByExactField(songsWithGenre, "genre", "Genre Missing");

  return Array.from(groups.entries())
    .filter(([title, groupSongs]) => title !== "Genre Missing" && groupSongs.length > 0)
    .map(([title, groupSongs]) => {
      const score =
        groupSongs.reduce((total, song, index) => {
          return total + preferenceScore(song, maps, index);
        }, 0) +
        groupSongs.length * 2;

      return {
        id: `genre-${title}`,
        title,
        subtitle: `${groupSongs.length} ${
          groupSongs.length === 1 ? "song" : "songs"
        } under the original ${title} genre`,
        songs: groupSongs.slice(0, DEFAULT_SECTION_LIMIT),
        artwork: groupSongs.map(artworkFor).filter(Boolean).slice(0, 3),
        preview: groupSongs
          .map((song) => {
            const artist = displayValue(song.artist) || "Hidden Tunes";
            const titleValue = displayValue(song.title) || "Song";
            return `${artist} - ${titleValue}`;
          })
          .slice(0, 3),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
