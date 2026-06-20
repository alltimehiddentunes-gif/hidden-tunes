import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
  HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import type { OnboardingPreferences } from "./onboardingPreferences";
import {
  buildBecauseYouListened,
  buildMoreLikeThisMood,
  buildRecentlyDiscovered,
  type DiscoverySong,
} from "./smartDiscovery";
import {
  filterSongsByCatalogLabel,
  normalizeCatalogKey,
} from "../utils/catalogResolver";
import { songHasNormalizedGenre } from "../utils/genreNormalization";

export type SmartRadioEntry = {
  id: string;
  title: string;
  subtitle: string;
  kind: "artist" | "album" | "genre" | "mood";
  params: {
    title: string;
    query: string;
    artist?: string;
    genre?: string;
    mood?: string;
  };
};

export type SmartRecommendationsBundle = {
  becauseYouPlayed: HiddenTunesNormalizedSong[];
  moreLikeThis: HiddenTunesNormalizedSong[];
  recommendedForYou: HiddenTunesNormalizedSong[];
  continueListening: HiddenTunesNormalizedSong[];
  rediscoverFavorites: HiddenTunesNormalizedSong[];
  newUserRecommendations: HiddenTunesNormalizedSong[];
  smartRadioEntries: SmartRadioEntry[];
  hasPersonalHistory: boolean;
};

export type SmartRecommendationsInput = {
  songs: HiddenTunesNormalizedSong[];
  recentlyPlayed?: DiscoverySong[];
  favorites?: DiscoverySong[];
  rankedSongs?: HiddenTunesNormalizedSong[];
  rankedArtists?: HiddenTunesArtist[];
  rankedAlbums?: HiddenTunesAlbum[];
  currentSong?: DiscoverySong | null;
  onboarding?: OnboardingPreferences | null;
  launchWorlds?: Array<{ id: string; title: string; songs: HiddenTunesNormalizedSong[] }>;
  genreHubs?: Array<{ id: string; title: string; genreTitle: string; songs: HiddenTunesNormalizedSong[] }>;
  moodCollections?: Array<{ id: string; title: string; songs: HiddenTunesNormalizedSong[] }>;
};

const DEFAULT_LIMIT = 8;
const REDISCOVER_MIN_FAVORITES = 3;

function cleanKey(value: unknown) {
  return normalizeCatalogKey(value);
}

function songKey(song: DiscoverySong) {
  return String(song.id || song.streamUrl || song.url || song.audioUrl || "").trim();
}

function isPlayableSong(song: DiscoverySong) {
  return Boolean(String(song.streamUrl || song.url || song.audioUrl || "").trim());
}

function dedupeSongs<T extends DiscoverySong>(songs: T[]) {
  const seen = new Set<string>();

  return songs.filter((song) => {
    if (!isPlayableSong(song)) return false;
    const key = songKey(song);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRecentIdSet(recentlyPlayed: DiscoverySong[] = []) {
  return new Set(
    recentlyPlayed
      .map((song) => String(song.id || "").trim())
      .filter(Boolean)
  );
}

function onboardingGenreBoost(
  song: DiscoverySong,
  onboarding?: OnboardingPreferences | null
) {
  if (!onboarding?.preferredGenres?.length) return 0;

  return onboarding.preferredGenres.reduce((score, genre, index) => {
    if (songHasNormalizedGenre(song, genre)) {
      return score + 20 - index * 3;
    }
    return score;
  }, 0);
}

function onboardingMoodBoost(
  song: DiscoverySong,
  onboarding?: OnboardingPreferences | null
) {
  if (!onboarding?.preferredMoods?.length) return 0;

  return onboarding.preferredMoods.reduce((score, mood, index) => {
    if (filterSongsByCatalogLabel([song], mood, "mood").length > 0) {
      return score + 18 - index * 3;
    }
    return score;
  }, 0);
}

export function buildBecauseYouPlayed<T extends HiddenTunesNormalizedSong>(
  songs: T[],
  recentlyPlayed: DiscoverySong[] = [],
  favorites: DiscoverySong[] = [],
  limit = DEFAULT_LIMIT
) {
  if (!recentlyPlayed.length) return [] as T[];

  return buildBecauseYouListened(songs, recentlyPlayed, favorites, limit);
}

export function buildMoreLikeThis<T extends HiddenTunesNormalizedSong>(
  songs: T[],
  currentSong?: DiscoverySong | null,
  recentlyPlayed: DiscoverySong[] = [],
  limit = DEFAULT_LIMIT
) {
  const seed =
    currentSong ||
    recentlyPlayed.find((song) => isPlayableSong(song)) ||
    null;

  if (!seed) {
    return [] as T[];
  }

  const seedKey = songKey(seed);
  const seedArtist = cleanKey(seed.artist);
  const seedGenre = cleanKey(seed.genre);
  const pool = dedupeSongs(songs).filter((song) => songKey(song) !== seedKey);

  const byArtist = seedArtist
    ? pool.filter((song) => cleanKey(song.artist) === seedArtist)
    : [];

  const byGenre = seedGenre
    ? pool.filter(
        (song) =>
          cleanKey(song.genre) === seedGenre ||
          songHasNormalizedGenre(song, String(seed.genre || ""))
      )
    : [];

  const moodMatch = buildMoreLikeThisMood(songs, seed, recentlyPlayed, limit);

  const merged = dedupeSongs([
    ...byArtist,
    ...byGenre,
    ...moodMatch.songs,
  ]).slice(0, limit);

  return merged;
}

export function buildRecommendedForYou<T extends HiddenTunesNormalizedSong>(
  rankedSongs: T[],
  recentlyPlayed: DiscoverySong[] = [],
  favorites: DiscoverySong[] = [],
  limit = DEFAULT_LIMIT
) {
  const recentIds = buildRecentIdSet(recentlyPlayed);
  const favoriteIds = new Set(
    favorites.map((song) => String(song.id || "").trim()).filter(Boolean)
  );

  return dedupeSongs(rankedSongs)
    .filter((song) => !recentIds.has(String(song.id || "")))
    .filter((song) => !favoriteIds.has(String(song.id || "")))
    .slice(0, limit);
}

export function buildContinueListeningRail<T extends HiddenTunesNormalizedSong>(
  catalogSongs: T[],
  recentlyPlayed: DiscoverySong[] = [],
  currentSong?: DiscoverySong | null,
  limit = DEFAULT_LIMIT
) {
  if (!recentlyPlayed.length) return [] as T[];

  const catalogById = new Map(
    dedupeSongs(catalogSongs).map((song) => [String(song.id || ""), song])
  );
  const currentId = String(currentSong?.id || "");
  const picked: T[] = [];
  const seen = new Set<string>();

  recentlyPlayed.forEach((recent) => {
    const id = String(recent.id || "").trim();
    if (!id || id === currentId || seen.has(id)) return;

    const match = catalogById.get(id);
    if (!match || !isPlayableSong(match)) return;

    seen.add(id);
    picked.push(match);
  });

  if (picked.length >= limit) {
    return picked.slice(0, limit);
  }

  recentlyPlayed.forEach((recent) => {
    if (picked.length >= limit) return;

    const title = String(recent.title || "").trim();
    const artist = String(recent.artist || recent.channelTitle || "").trim();
    if (!title) return;

    const fuzzy = catalogSongs.find((song) => {
      const id = String(song.id || "");
      if (!id || seen.has(id)) return false;
      return (
        cleanKey(song.title) === cleanKey(title) &&
        (!artist || cleanKey(song.artist) === cleanKey(artist))
      );
    });

    if (fuzzy) {
      seen.add(String(fuzzy.id || ""));
      picked.push(fuzzy);
    }
  });

  return picked.slice(0, limit);
}

export function buildRediscoverFavorites<T extends HiddenTunesNormalizedSong>(
  favorites: DiscoverySong[] = [],
  catalogSongs: T[] = [],
  recentlyPlayed: DiscoverySong[] = [],
  limit = DEFAULT_LIMIT
) {
  const playableFavorites = dedupeSongs(favorites as T[]);
  if (playableFavorites.length < REDISCOVER_MIN_FAVORITES) {
    return [] as T[];
  }

  const recentIds = buildRecentIdSet(recentlyPlayed);
  const staleFavorites = playableFavorites.filter(
    (song) => !recentIds.has(String(song.id || ""))
  );

  const seedFavorites = staleFavorites.length
    ? staleFavorites
    : playableFavorites;

  const favoriteArtists = new Set(
    seedFavorites.map((song) => cleanKey(song.artist)).filter(Boolean)
  );
  const favoriteGenres = new Set(
    seedFavorites.map((song) => cleanKey(song.genre)).filter(Boolean)
  );

  const companionMatches = dedupeSongs(catalogSongs).filter((song) => {
    const id = String(song.id || "");
    if (recentIds.has(id)) return false;
    if (seedFavorites.some((fav) => String(fav.id || "") === id)) return false;

    const artist = cleanKey(song.artist);
    const genre = cleanKey(song.genre);
    return (
      (artist && favoriteArtists.has(artist)) ||
      (genre && favoriteGenres.has(genre))
    );
  });

  return dedupeSongs([...seedFavorites, ...companionMatches]).slice(0, limit);
}

export function buildNewUserRecommendations<T extends HiddenTunesNormalizedSong>(
  input: SmartRecommendationsInput,
  limit = DEFAULT_LIMIT
) {
  const songs = input.songs || [];
  const trending = buildRecentlyDiscovered(songs, limit);
  const editorialPools: HiddenTunesNormalizedSong[] = [];

  (input.launchWorlds || []).forEach((world) => {
    if (world.songs[0]) editorialPools.push(world.songs[0]);
  });

  (input.genreHubs || []).forEach((hub) => {
    if (hub.songs[0]) editorialPools.push(hub.songs[0]);
  });

  (input.moodCollections || []).forEach((collection) => {
    if (collection.songs[0]) editorialPools.push(collection.songs[0]);
  });

  (input.rankedArtists || []).slice(0, 4).forEach((artist) => {
    const track = artist.tracks?.find((item) => isPlayableSong(item));
    if (track) editorialPools.push(track);
  });

  const ranked = dedupeSongs([
    ...trending,
    ...editorialPools,
    ...songs.slice(0, limit * 2),
  ] as T[])
    .map((song, index) => ({
      song,
      score:
        onboardingGenreBoost(song, input.onboarding) +
        onboardingMoodBoost(song, input.onboarding) +
        (limit - index),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.song);

  return ranked.slice(0, limit);
}

export function buildSmartRadioEntries(
  input: SmartRecommendationsInput
): SmartRadioEntry[] {
  const entries: SmartRadioEntry[] = [];
  const seen = new Set<string>();

  const pushEntry = (entry: SmartRadioEntry) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    entries.push(entry);
  };

  const topArtist = input.rankedArtists?.[0];
  if (topArtist?.name) {
    pushEntry({
      id: `artist-${cleanKey(topArtist.name)}`,
      title: `${topArtist.name} Radio`,
      subtitle: "Artist mix",
      kind: "artist",
      params: {
        title: `${topArtist.name} Radio`,
        artist: topArtist.name,
        query: `${topArtist.name} songs`,
      },
    });
  }

  const topAlbum = input.rankedAlbums?.[0];
  if (topAlbum?.title) {
    pushEntry({
      id: `album-${cleanKey(topAlbum.title)}`,
      title: `${topAlbum.title} Radio`,
      subtitle: topAlbum.artist || "Album mix",
      kind: "album",
      params: {
        title: `${topAlbum.title} Radio`,
        artist: topAlbum.artist,
        query: `${topAlbum.title} ${topAlbum.artist || ""}`.trim(),
      },
    });
  }

  const genreHub = input.genreHubs?.[0];
  if (genreHub?.genreTitle || genreHub?.title) {
    const genre = genreHub.genreTitle || genreHub.title;
    pushEntry({
      id: `genre-${cleanKey(genre)}`,
      title: `${genre} Radio`,
      subtitle: "Genre mix",
      kind: "genre",
      params: {
        title: `${genre} Radio`,
        genre,
        query: `${genre} music`,
      },
    });
  }

  const moodCollection = input.moodCollections?.[0];
  if (moodCollection?.title) {
    pushEntry({
      id: `mood-${cleanKey(moodCollection.title)}`,
      title: `${moodCollection.title} Radio`,
      subtitle: "Mood mix",
      kind: "mood",
      params: {
        title: `${moodCollection.title} Radio`,
        mood: moodCollection.title,
        query: `${moodCollection.title} music`,
      },
    });
  }

  const recentSeed = input.recentlyPlayed?.[0];
  if (recentSeed?.artist) {
    pushEntry({
      id: `recent-artist-${cleanKey(recentSeed.artist)}`,
      title: `${recentSeed.artist} Radio`,
      subtitle: "Because you played",
      kind: "artist",
      params: {
        title: `${recentSeed.artist} Radio`,
        artist: String(recentSeed.artist),
        query: `${recentSeed.artist} songs`,
      },
    });
  }

  return entries.slice(0, 4);
}

export function buildSmartRecommendationsBundle(
  input: SmartRecommendationsInput
): SmartRecommendationsBundle {
  const recentlyPlayed = input.recentlyPlayed || [];
  const favorites = input.favorites || [];
  const rankedSongs = input.rankedSongs || input.songs || [];
  const hasPersonalHistory = recentlyPlayed.length > 0 || favorites.length > 0;

  const becauseYouPlayed = buildBecauseYouPlayed(
    input.songs,
    recentlyPlayed,
    favorites
  );

  const moreLikeThis = buildMoreLikeThis(
    input.songs,
    input.currentSong,
    recentlyPlayed
  );

  const recommendedForYou = hasPersonalHistory
    ? buildRecommendedForYou(rankedSongs, recentlyPlayed, favorites)
    : [];

  const continueListening = buildContinueListeningRail(
    input.songs,
    recentlyPlayed,
    input.currentSong
  );

  const rediscoverFavorites = buildRediscoverFavorites(
    favorites,
    input.songs,
    recentlyPlayed
  );

  const newUserRecommendations = hasPersonalHistory
    ? []
    : buildNewUserRecommendations(input);

  const smartRadioEntries = buildSmartRadioEntries(input);

  return {
    becauseYouPlayed,
    moreLikeThis,
    recommendedForYou: hasPersonalHistory
      ? recommendedForYou
      : newUserRecommendations,
    continueListening,
    rediscoverFavorites,
    newUserRecommendations,
    smartRadioEntries,
    hasPersonalHistory,
  };
}

export function buildOnboardingFallbackSeed(
  onboarding?: OnboardingPreferences | null
) {
  const genre = onboarding?.preferredGenres?.[0];
  const mood = onboarding?.preferredMoods?.[0];

  if (genre && mood) {
    return `${genre} ${mood} music`;
  }

  if (genre) {
    return `${genre} music`;
  }

  if (mood) {
    return `${mood} music`;
  }

  return "Hidden Tunes trending";
}
