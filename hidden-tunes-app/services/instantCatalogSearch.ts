import type { HiddenTunesGenre } from "../utils/genres";
import {
  buildCatalogSearchIndex,
  searchCatalogIndex,
  type CatalogSearchIndex,
} from "../utils/catalogSearchIndex";
import { getCanonicalGenre } from "../utils/genreAliases";
import { logSlowInteraction } from "../utils/performanceLogs";
import {
  normalizeSearchText,
  scoreSearchDocument,
  buildSearchDocument,
} from "../utils/universalSearch";
import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
  HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import type { HiddenTunesTvVideo } from "./tvCatalogApi";
import type { UniversalSearchGroupedResults } from "./universalSearchService";

export type InstantSearchCatalog = {
  songs: HiddenTunesNormalizedSong[];
  albums: HiddenTunesAlbum[];
  artists: HiddenTunesArtist[];
  genres: HiddenTunesGenre[];
  tvVideos: HiddenTunesTvVideo[];
};

const EMPTY: UniversalSearchGroupedResults = {
  topResults: [],
  songs: [],
  lyrics: [],
  artists: [],
  albums: [],
  genreMoods: [],
  tv: [],
  hasAnyResults: false,
};

const INSTANT_LIMITS = {
  songs: 14,
  artists: 8,
  albums: 8,
  genres: 10,
  tv: 8,
  top: 8,
};

let cachedIndex: CatalogSearchIndex | null = null;
let cachedIndexSourceLength = 0;

function getOrBuildIndex(songs: HiddenTunesNormalizedSong[]) {
  if (
    cachedIndex &&
    cachedIndex.songCount === songs.length &&
    cachedIndexSourceLength === songs.length
  ) {
    return cachedIndex;
  }

  cachedIndex = buildCatalogSearchIndex(songs);
  cachedIndexSourceLength = songs.length;
  return cachedIndex;
}

function searchGenresFast(genres: HiddenTunesGenre[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return genres
    .filter((genre) => {
      const title = normalizeSearchText(genre.title);
      const id = normalizeSearchText(genre.id);
      const queryField = normalizeSearchText(genre.query);

      if (
        title.includes(normalizedQuery) ||
        id.includes(normalizedQuery) ||
        queryField.includes(normalizedQuery)
      ) {
        return true;
      }

      return (genre.aliases || []).some((alias) =>
        normalizeSearchText(alias).includes(normalizedQuery)
      );
    })
    .slice(0, INSTANT_LIMITS.genres)
    .map((genre) => ({
      id: `genre:${genre.id}`,
      score: getCanonicalGenre(query) === genre.title ? 120 : 96,
      reason: "Matched genre" as const,
      payload: genre,
      subtitle: genre.query,
    }));
}

function searchArtistsFast(artists: HiddenTunesArtist[], query: string) {
  const hits: UniversalSearchGroupedResults["artists"] = [];

  for (const artist of artists) {
    const score = scoreSearchDocument(
      buildSearchDocument([artist.name, artist.genre, artist.bio]),
      query,
      1
    );

    if (score <= 0) continue;

    hits.push({
      id: `artist:${artist.id}`,
      score,
      reason: "Matched artist",
      payload: artist,
      subtitle: artist.genre || "Artist",
    });

    if (hits.length >= INSTANT_LIMITS.artists) break;
  }

  return hits.sort((a, b) => b.score - a.score);
}

function searchAlbumsFast(albums: HiddenTunesAlbum[], query: string) {
  const hits: UniversalSearchGroupedResults["albums"] = [];

  for (const album of albums) {
    const score = scoreSearchDocument(
      buildSearchDocument([album.title, album.artist, album.genre]),
      query,
      1
    );

    if (score <= 0) continue;

    hits.push({
      id: `album:${album.id}`,
      score,
      reason: "Matched album",
      payload: album,
      subtitle: album.artist,
    });

    if (hits.length >= INSTANT_LIMITS.albums) break;
  }

  return hits.sort((a, b) => b.score - a.score);
}

function searchTvFast(videos: HiddenTunesTvVideo[], query: string) {
  const hits: UniversalSearchGroupedResults["tv"] = [];

  for (const video of videos) {
    const score = scoreSearchDocument(
      buildSearchDocument([
        video.title,
        video.channel_name,
        video.genre,
        video.mood,
        video.category,
      ]),
      query,
      1
    );

    if (score <= 0) continue;

    hits.push({
      id: `tv:${video.id}`,
      score,
      reason: "Matched TV",
      payload: video,
      subtitle: video.channel_name || video.genre || "Hidden Tunes TV",
    });

    if (hits.length >= INSTANT_LIMITS.tv) break;
  }

  return hits.sort((a, b) => b.score - a.score);
}

export function runInstantCatalogSearch(
  catalog: InstantSearchCatalog,
  query: string
): UniversalSearchGroupedResults {
  const startedAt = Date.now();
  const cleanQuery = String(query || "").trim();

  if (cleanQuery.length < 2) {
    return EMPTY;
  }

  const index = getOrBuildIndex(catalog.songs);
  const matchedSongs = searchCatalogIndex(index, cleanQuery, INSTANT_LIMITS.songs);

  const songs = matchedSongs.map((song) => ({
    id: `song:${song.id}`,
    kind: "song" as const,
    score: 100,
    reason: "Matched title" as const,
    payload: song,
    subtitle: `${song.artist}${song.album ? ` • ${song.album}` : ""}`,
  }));

  const artists = searchArtistsFast(catalog.artists, cleanQuery);
  const albums = searchAlbumsFast(catalog.albums, cleanQuery);
  const genreMoods = searchGenresFast(catalog.genres, cleanQuery);
  const tv = searchTvFast(catalog.tvVideos, cleanQuery);

  const topResults = [...songs, ...artists, ...albums, ...genreMoods, ...tv]
    .sort((left, right) => right.score - left.score)
    .slice(0, INSTANT_LIMITS.top);

  const result: UniversalSearchGroupedResults = {
    topResults,
    songs,
    lyrics: [],
    artists,
    albums,
    genreMoods,
    tv,
    hasAnyResults:
      topResults.length > 0 ||
      songs.length > 0 ||
      artists.length > 0 ||
      albums.length > 0 ||
      genreMoods.length > 0 ||
      tv.length > 0,
  };

  logSlowInteraction("search_instant", Date.now() - startedAt, {
    query: cleanQuery,
    songCount: catalog.songs.length,
    matchCount: songs.length,
  });

  return result;
}

export function invalidateCatalogSearchIndex() {
  cachedIndex = null;
  cachedIndexSourceLength = 0;
}
