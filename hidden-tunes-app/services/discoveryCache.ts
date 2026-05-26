import {
  extractHiddenTunesAlbums,
  extractHiddenTunesArtists,
  type HiddenTunesAlbum,
  type HiddenTunesArtist,
  type HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import {
  buildListenerPreferenceMaps,
  rankAlbumsForListener,
  rankArtistsForListener,
  rankSongsForListener,
} from "./listenerRanking";
import {
  buildBecauseYouListened,
  buildCuratedDiscoverySections,
  buildGenreSpotlights,
  buildMoodRooms,
  buildRecentlyDiscovered,
  type DiscoverySong,
  type SmartDiscoverySection,
} from "./smartDiscovery";

const MAX_MOOD_ROOMS = 8;
const MAX_BECAUSE_YOU_LISTENED = 10;
const MAX_RECENTLY_DISCOVERED = 12;
const MAX_GENRE_SPOTLIGHTS = 6;
/** Caps discovery ranking cost on Home/Explore without changing visible sections much. */
export const MAX_DISCOVERY_INPUT_SONGS = 220;

export type SharedDiscoverySnapshot = {
  preferenceMaps: ReturnType<typeof buildListenerPreferenceMaps>;
  rankedSongs: HiddenTunesNormalizedSong[];
  rankedAlbums: HiddenTunesAlbum[];
  rankedArtists: HiddenTunesArtist[];
  recentlyDiscovered: HiddenTunesNormalizedSong[];
  becauseYouListenedRaw: HiddenTunesNormalizedSong[];
  becauseYouListenedRanked: HiddenTunesNormalizedSong[];
  curatedSections: SmartDiscoverySection<HiddenTunesNormalizedSong>[];
  moodRooms: ReturnType<typeof buildMoodRooms<HiddenTunesNormalizedSong>>;
  genreSpotlights: ReturnType<typeof buildGenreSpotlights<HiddenTunesNormalizedSong>>;
};

export type SharedDiscoveryInput = {
  songs: HiddenTunesNormalizedSong[];
  recentlyPlayed?: DiscoverySong[];
  favorites?: DiscoverySong[];
  albums?: HiddenTunesAlbum[];
  artists?: HiddenTunesArtist[];
};

let cachedKey: string | null = null;
let cachedSnapshot: SharedDiscoverySnapshot | null = null;

function songIdentity(song: DiscoverySong) {
  return String(song.id || song.streamUrl || song.url || song.audioUrl || "").trim();
}

function buildCatalogFingerprint(songs: DiscoverySong[]) {
  if (!songs.length) return "catalog:empty";

  const first = songIdentity(songs[0]);
  const last = songIdentity(songs[songs.length - 1]);
  let updatedAtMax = 0;

  const stride = Math.max(1, Math.floor(songs.length / 8));
  for (let index = 0; index < songs.length; index += stride) {
    const song = songs[index];
    const stamp = new Date(song.updatedAt || song.createdAt || 0).getTime();
    if (Number.isFinite(stamp) && stamp > updatedAtMax) {
      updatedAtMax = stamp;
    }
  }

  return `catalog:${songs.length}:${first}:${last}:${updatedAtMax}`;
}

function buildListenerFingerprint(
  recentlyPlayed: DiscoverySong[] = [],
  favorites: DiscoverySong[] = []
) {
  const recentSample = recentlyPlayed
    .slice(0, 12)
    .map((song) => songIdentity(song))
    .join("|");
  const favoriteSample = favorites
    .slice(0, 12)
    .map((song) => songIdentity(song))
    .join("|");

  return `listener:${recentlyPlayed.length}:${recentSample}:${favorites.length}:${favoriteSample}`;
}

function buildCollectionsFingerprint(
  songs: HiddenTunesNormalizedSong[],
  albums: HiddenTunesAlbum[] = [],
  artists: HiddenTunesArtist[] = []
) {
  if (albums.length || artists.length) {
    const albumHead = String(albums[0]?.id || albums[0]?.title || "");
    const artistHead = String(artists[0]?.id || artists[0]?.name || "");
    return `collections:api:${albums.length}:${albumHead}:${artists.length}:${artistHead}`;
  }

  const extractedAlbums = extractHiddenTunesAlbums(songs);
  const extractedArtists = extractHiddenTunesArtists(songs);
  const albumHead = String(extractedAlbums[0]?.id || extractedAlbums[0]?.title || "");
  const artistHead = String(extractedArtists[0]?.id || extractedArtists[0]?.name || "");

  return `collections:derived:${extractedAlbums.length}:${albumHead}:${extractedArtists.length}:${artistHead}`;
}

export function buildDiscoveryCacheKey(input: SharedDiscoveryInput) {
  return [
    buildCatalogFingerprint(input.songs),
    buildListenerFingerprint(input.recentlyPlayed, input.favorites),
    buildCollectionsFingerprint(input.songs, input.albums, input.artists),
  ].join("::");
}

function buildSharedDiscoverySnapshot(input: SharedDiscoveryInput): SharedDiscoverySnapshot {
  const songs = (input.songs || []).slice(0, MAX_DISCOVERY_INPUT_SONGS);
  const recentlyPlayed = input.recentlyPlayed || [];
  const favorites = input.favorites || [];

  const preferenceMaps = buildListenerPreferenceMaps(
    recentlyPlayed as HiddenTunesNormalizedSong[],
    favorites as HiddenTunesNormalizedSong[]
  );

  const rankedSongs = rankSongsForListener(songs, preferenceMaps);

  const albumSource = input.albums?.length ? input.albums : extractHiddenTunesAlbums(songs);
  const artistSource = input.artists?.length ? input.artists : extractHiddenTunesArtists(songs);

  const rankedAlbums = rankAlbumsForListener(albumSource, preferenceMaps);
  const rankedArtists = rankArtistsForListener(artistSource, preferenceMaps);

  const recentlyDiscovered = buildRecentlyDiscovered(songs, MAX_RECENTLY_DISCOVERED);
  const becauseYouListenedRaw = buildBecauseYouListened(
    songs,
    recentlyPlayed,
    favorites,
    MAX_BECAUSE_YOU_LISTENED
  );
  const becauseYouListenedRanked = buildBecauseYouListened(
    rankedSongs,
    recentlyPlayed,
    favorites,
    MAX_BECAUSE_YOU_LISTENED
  );

  const curatedSections = buildCuratedDiscoverySections(songs, undefined, preferenceMaps);
  const moodRooms = buildMoodRooms(songs, preferenceMaps, MAX_MOOD_ROOMS);
  const genreSpotlights = buildGenreSpotlights(songs, preferenceMaps, MAX_GENRE_SPOTLIGHTS);

  return {
    preferenceMaps,
    rankedSongs,
    rankedAlbums,
    rankedArtists,
    recentlyDiscovered,
    becauseYouListenedRaw,
    becauseYouListenedRanked,
    curatedSections,
    moodRooms,
    genreSpotlights,
  };
}

export function getSharedDiscoverySnapshot(
  input: SharedDiscoveryInput
): SharedDiscoverySnapshot {
  const key = buildDiscoveryCacheKey(input);

  if (cachedKey === key && cachedSnapshot) {
    return cachedSnapshot;
  }

  const snapshot = buildSharedDiscoverySnapshot(input);
  cachedKey = key;
  cachedSnapshot = snapshot;

  return snapshot;
}

export function resetSharedDiscoveryCache() {
  cachedKey = null;
  cachedSnapshot = null;
}
