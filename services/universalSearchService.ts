import type { HiddenTunesGenre } from "../utils/genres";
import {
  CATALOG_SEARCH_TV_MAX_SCORE,
  rankCatalogSongs,
  scoreCatalogSongMatch,
  type CatalogSongMatchReason,
} from "../utils/catalogSongRanking";
import { logSlowInteraction } from "../utils/performanceLogs";
import {
  buildSearchDocument,
  collectSearchTags,
  extractLyricSnippet,
  mergeSearchHits,
  normalizeSearchText,
  rankSearchHits,
  scoreSearchDocument,
  stripLrcTimestamps,
  type UniversalMatchReason,
  type UniversalSearchHit,
} from "../utils/universalSearch";
import type {
  HiddenTunesAlbum,
  HiddenTunesArtist,
  HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import type { HiddenTunesTvVideo } from "./tvCatalogApi";
export type UniversalSearchSongHit = UniversalSearchHit<HiddenTunesNormalizedSong> & {
  kind: "song" | "lyric";
  catalogMatchReason?: CatalogSongMatchReason;
};

function catalogReasonToUniversal(
  reason: CatalogSongMatchReason
): UniversalMatchReason {
  switch (reason) {
    case "exact_title":
    case "title_starts":
    case "title_contains":
      return "Matched title";
    case "artist_exact":
    case "artist_starts":
    case "artist_contains":
      return "Matched artist";
    case "album_exact":
    case "album_starts":
    case "album_contains":
      return "Matched album";
    case "genre_exact":
    case "genre_starts":
    case "genre_contains":
      return "Matched genre";
    case "mood_match":
      return "Matched mood";
    case "lyric_match":
      return "Matched lyric";
    default:
      return "Matched title";
  }
}

export type UniversalSearchArtistHit = UniversalSearchHit<HiddenTunesArtist>;
export type UniversalSearchAlbumHit = UniversalSearchHit<HiddenTunesAlbum>;
export type UniversalSearchGenreHit = UniversalSearchHit<HiddenTunesGenre>;
export type UniversalSearchTvHit = UniversalSearchHit<HiddenTunesTvVideo>;

export type UniversalSearchTopHit =
  | UniversalSearchSongHit
  | UniversalSearchArtistHit
  | UniversalSearchAlbumHit
  | UniversalSearchGenreHit
  | UniversalSearchTvHit;

export type UniversalSearchGroupedResults = {
  topResults: UniversalSearchTopHit[];
  songs: UniversalSearchSongHit[];
  lyrics: UniversalSearchSongHit[];
  artists: UniversalSearchArtistHit[];
  albums: UniversalSearchAlbumHit[];
  genreMoods: UniversalSearchGenreHit[];
  tv: UniversalSearchTvHit[];
  hasAnyResults: boolean;
};

export type UniversalSearchCatalog = {
  songs: HiddenTunesNormalizedSong[];
  albums: HiddenTunesAlbum[];
  artists: HiddenTunesArtist[];
  genres: HiddenTunesGenre[];
  tvVideos: HiddenTunesTvVideo[];
};

const FUZZY_LYRIC_CANDIDATE_LIMIT = 24;

const EMPTY_RESULTS: UniversalSearchGroupedResults = {
  topResults: [],
  songs: [],
  lyrics: [],
  artists: [],
  albums: [],
  genreMoods: [],
  tv: [],
  hasAnyResults: false,
};

function getSongLyricsText(song: HiddenTunesNormalizedSong) {
  const raw = song.raw || {};
  const plain =
    song.lyrics ||
    raw.plain_lyrics ||
    raw.plainLyrics ||
    raw.lyrics ||
    "";
  const synced =
    song.syncedLyrics ||
    raw.synced_lrc ||
    raw.syncedLrc ||
    raw.lrc ||
    "";

  return [stripLrcTimestamps(plain), stripLrcTimestamps(synced)]
    .filter(Boolean)
    .join(" ");
}

function buildSongMetadataDocument(song: HiddenTunesNormalizedSong) {
  const raw = song.raw || {};

  return buildSearchDocument([
    song.title,
    song.artist,
    song.album,
    song.genre,
    song.mood,
    raw.tags,
    raw.description,
    song.sourceName,
  ]);
}

function scoreSongMetadata(
  song: HiddenTunesNormalizedSong,
  query: string
): {
  score: number;
  reason: UniversalMatchReason;
  catalogMatchReason: CatalogSongMatchReason;
} | null {
  const ranked = scoreCatalogSongMatch(song, query);
  if (!ranked) return null;

  return {
    score: ranked.score,
    reason: catalogReasonToUniversal(ranked.matchReason),
    catalogMatchReason: ranked.matchReason,
  };
}

function scoreSongLyrics(song: HiddenTunesNormalizedSong, query: string) {
  const lyricsText = getSongLyricsText(song);
  if (!lyricsText) return null;

  const document = buildSearchDocument([lyricsText]);
  const score = scoreSearchDocument(document, query, 1.08);
  if (score <= 0) return null;

  return {
    score,
    reason: "Matched lyric" as const,
    lyricSnippet: extractLyricSnippet(lyricsText, query),
  };
}

function searchSongs(
  songs: HiddenTunesNormalizedSong[],
  query: string
): {
  songs: UniversalSearchSongHit[];
  lyrics: UniversalSearchSongHit[];
} {
  const pool = songs;

  if (pool.length >= 48) {
    const ranked = rankCatalogSongs(pool, query, 40);
    const songHits: UniversalSearchSongHit[] = ranked.map((hit) => ({
      id: `song:${hit.song.id}`,
      kind: "song",
      score: hit.score,
      reason: catalogReasonToUniversal(hit.matchReason),
      catalogMatchReason: hit.matchReason,
      payload: hit.song,
      subtitle: `${hit.song.artist}${hit.song.album ? ` • ${hit.song.album}` : ""}`,
    }));

    const lyricHits: UniversalSearchSongHit[] = [];
    for (const hit of ranked.slice(0, FUZZY_LYRIC_CANDIDATE_LIMIT)) {
      const lyricMatch = scoreSongLyrics(hit.song, query);
      if (!lyricMatch) continue;

      lyricHits.push({
        id: `lyric:${hit.song.id}`,
        kind: "lyric",
        score: Math.max(lyricMatch.score, hit.score),
        reason: lyricMatch.reason,
        catalogMatchReason: hit.matchReason,
        payload: hit.song,
        subtitle: hit.song.title,
        lyricSnippet: lyricMatch.lyricSnippet,
      });
    }

    return {
      songs: songHits,
      lyrics: rankSearchHits(lyricHits, 24) as UniversalSearchSongHit[],
    };
  }

  const songHits: UniversalSearchSongHit[] = [];
  const lyricHits: UniversalSearchSongHit[] = [];

  for (const song of pool) {
    const metadataMatch = scoreSongMetadata(song, query);
    if (metadataMatch) {
      songHits.push({
        id: `song:${song.id}`,
        kind: "song",
        score: metadataMatch.score,
        reason: metadataMatch.reason,
        catalogMatchReason: metadataMatch.catalogMatchReason,
        payload: song,
        subtitle: `${song.artist}${song.album ? ` • ${song.album}` : ""}`,
      });
    }

    const lyricMatch = scoreSongLyrics(song, query);
    if (lyricMatch) {
      const catalogMatch = scoreCatalogSongMatch(song, query);
      lyricHits.push({
        id: `lyric:${song.id}`,
        kind: "lyric",
        score: Math.max(lyricMatch.score, catalogMatch?.score || 0),
        reason: lyricMatch.reason,
        catalogMatchReason: catalogMatch?.matchReason || "lyric_match",
        payload: song,
        subtitle: song.title,
        lyricSnippet: lyricMatch.lyricSnippet,
      });
    }
  }

  return {
    songs: rankSearchHits(songHits, 40) as UniversalSearchSongHit[],
    lyrics: rankSearchHits(lyricHits, 24) as UniversalSearchSongHit[],
  };
}

function searchArtists(artists: HiddenTunesArtist[], query: string) {
  const hits: UniversalSearchArtistHit[] = [];

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
  }

  return rankSearchHits(hits, 20);
}

function searchAlbums(albums: HiddenTunesAlbum[], query: string) {
  const hits: UniversalSearchAlbumHit[] = [];

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
  }

  return rankSearchHits(hits, 20);
}

function searchGenres(genres: HiddenTunesGenre[], query: string) {
  const hits: UniversalSearchGenreHit[] = [];

  for (const genre of genres) {
    const score = scoreSearchDocument(
      buildSearchDocument([genre.title, genre.query, genre.id, genre.aliases]),
      query,
      0.96
    );

    if (score <= 0) continue;

    const normalizedQuery = normalizeSearchText(query);
    const moodLike =
      normalizeSearchText(genre.title).includes(normalizedQuery) &&
      /mood|feel|vibe|room/i.test(genre.title);

    hits.push({
      id: `genre:${genre.id}`,
      score,
      reason: moodLike ? "Matched mood" : "Matched genre",
      payload: genre,
      subtitle: genre.query,
    });
  }

  return rankSearchHits(hits, 16);
}

function searchTv(videos: HiddenTunesTvVideo[], query: string) {
  const hits: UniversalSearchTvHit[] = [];

  for (const video of videos) {
    const score = scoreSearchDocument(
      buildSearchDocument([
        video.title,
        video.channel_name,
        video.genre,
        video.mood,
        video.category,
        video.format,
        video.tags,
      ]),
      query,
      1.02
    );

    if (score <= 0) continue;

    hits.push({
      id: `tv:${video.id}`,
      score: Math.min(score, CATALOG_SEARCH_TV_MAX_SCORE),
      reason: "Matched TV",
      payload: video,
      subtitle: video.channel_name || video.genre || "Hidden Tunes TV",
    });
  }

  return rankSearchHits(hits, 20);
}

export function runUniversalCatalogSearch(
  catalog: UniversalSearchCatalog,
  query: string
): UniversalSearchGroupedResults {
  const startedAt = Date.now();
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) return EMPTY_RESULTS;

  const songResults = searchSongs(catalog.songs, cleanQuery);
  const artists = searchArtists(catalog.artists, cleanQuery);
  const albums = searchAlbums(catalog.albums, cleanQuery);
  const genreMoods = searchGenres(catalog.genres, cleanQuery);
  const tv =
    catalog.tvVideos.length > 0 ? searchTv(catalog.tvVideos, cleanQuery) : [];

  const catalogTopHits: UniversalSearchTopHit[] = [];
  const seenTop = new Set<string>();

  for (const hit of [
    ...songResults.songs,
    ...songResults.lyrics,
    ...artists,
    ...albums,
    ...genreMoods,
  ]) {
    if (seenTop.has(hit.id)) continue;
    seenTop.add(hit.id);
    catalogTopHits.push(hit);
  }

  catalogTopHits.sort((left, right) => right.score - left.score);

  const tvTopHits = [...tv].sort((left, right) => right.score - left.score);
  const topResults = [...catalogTopHits, ...tvTopHits].slice(0, 10);

  const hasAnyResults =
    topResults.length > 0 ||
    songResults.songs.length > 0 ||
    songResults.lyrics.length > 0 ||
    artists.length > 0 ||
    albums.length > 0 ||
    genreMoods.length > 0 ||
    tv.length > 0;

  const result = {
    topResults,
    songs: songResults.songs,
    lyrics: songResults.lyrics,
    artists,
    albums,
    genreMoods,
    tv,
    hasAnyResults,
  };

  logSlowInteraction("search_fuzzy", Date.now() - startedAt, {
    query: cleanQuery,
    songCount: catalog.songs.length,
    matchCount: songResults.songs.length + songResults.lyrics.length,
  });

  return result;
}

export function rankCachedSongsForQuery(
  songs: HiddenTunesNormalizedSong[],
  query: string,
  limit = 80
) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return songs;

  return rankCatalogSongs(songs, cleanQuery, limit).map((hit) => hit.song);
}

export function flattenTvHomeCache(
  lanes: Array<{ videos?: HiddenTunesTvVideo[] }> | null | undefined
) {
  if (!lanes?.length) return [];

  const seen = new Set<string>();
  const videos: HiddenTunesTvVideo[] = [];

  for (const lane of lanes) {
    for (const video of lane.videos || []) {
      if (!video?.id || seen.has(video.id)) continue;
      seen.add(video.id);
      videos.push(video);
    }
  }

  return videos;
}
