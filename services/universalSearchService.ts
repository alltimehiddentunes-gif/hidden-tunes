import type { HiddenTunesCatalogPlaylist } from "./hiddenTunes";
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
  extractLyricSnippet,
  fuzzyFieldMatches,
  mergeSearchHits,
  normalizeSearchText,
  rankSearchHits,
  scoreSearchDocument,
  stripLrcTimestamps,
  tokenizeSearchText,
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

export type UniversalSearchArtistHit = UniversalSearchHit<HiddenTunesArtist>;
export type UniversalSearchAlbumHit = UniversalSearchHit<HiddenTunesAlbum>;
export type UniversalSearchGenreHit = UniversalSearchHit<HiddenTunesGenre>;
export type UniversalSearchTvHit = UniversalSearchHit<HiddenTunesTvVideo>;
export type UniversalSearchPlaylistHit = UniversalSearchHit<HiddenTunesCatalogPlaylist>;
export type UniversalSearchRoomHit = UniversalSearchHit<HiddenTunesGenre>;

export type UniversalSearchTopHit =
  | UniversalSearchSongHit
  | UniversalSearchArtistHit
  | UniversalSearchAlbumHit
  | UniversalSearchGenreHit
  | UniversalSearchPlaylistHit
  | UniversalSearchRoomHit
  | UniversalSearchTvHit;

export type UniversalSearchGroupedResults = {
  topResults: UniversalSearchTopHit[];
  songs: UniversalSearchSongHit[];
  lyrics: UniversalSearchSongHit[];
  artists: UniversalSearchArtistHit[];
  albums: UniversalSearchAlbumHit[];
  genreMoods: UniversalSearchGenreHit[];
  moodRooms: UniversalSearchRoomHit[];
  playlists: UniversalSearchPlaylistHit[];
  internetAudio: UniversalSearchSongHit[];
  tv: UniversalSearchTvHit[];
  hasAnyResults: boolean;
};

export type UniversalSearchCatalog = {
  songs: HiddenTunesNormalizedSong[];
  albums: HiddenTunesAlbum[];
  artists: HiddenTunesArtist[];
  genres: HiddenTunesGenre[];
  playlists?: HiddenTunesCatalogPlaylist[];
  tvVideos: HiddenTunesTvVideo[];
};

const LIMITS = {
  top: 8,
  songs: 24,
  lyrics: 16,
  artists: 12,
  albums: 12,
  genres: 10,
  moodRooms: 8,
  playlists: 8,
  internetAudio: 12,
  tv: 8,
  lyricScan: 6000,
};

const BACKEND_TRUSTED_SCORE = 4500;
const EXTERNAL_TRUSTED_SCORE = 100;

const MOOD_ROOM_DEFINITIONS: Array<{ id: string; title: string; terms: string[] }> = [
  { id: "healing", title: "Healing Room", terms: ["healing", "heal", "restore", "peace"] },
  { id: "late-night", title: "Late Night", terms: ["late", "night", "midnight", "drive"] },
  { id: "calm", title: "Calm", terms: ["calm", "soft", "ambient", "quiet"] },
  { id: "energy", title: "Energy", terms: ["energy", "dance", "party", "afro", "beat"] },
  { id: "worship", title: "Worship Focus", terms: ["worship", "gospel", "prayer", "praise"] },
  { id: "country", title: "Country Mood", terms: ["country", "folk", "americana"] },
];

export const EMPTY_UNIVERSAL_SEARCH_RESULTS: UniversalSearchGroupedResults = {
  topResults: [],
  songs: [],
  lyrics: [],
  artists: [],
  albums: [],
  genreMoods: [],
  moodRooms: [],
  playlists: [],
  internetAudio: [],
  tv: [],
  hasAnyResults: false,
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
    case "creator_match":
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

function getSongLyricsText(song: HiddenTunesNormalizedSong) {
  const raw = song.raw || {};
  const plain =
    song.lyrics ||
    raw.plain_lyrics ||
    raw.plainLyrics ||
    raw.lyricText ||
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

function lyricsMightMatch(song: HiddenTunesNormalizedSong, query: string) {
  const lyricsText = normalizeSearchText(getSongLyricsText(song));
  if (!lyricsText) return false;

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  if (lyricsText.includes(normalizedQuery)) return true;

  const tokens = tokenizeSearchText(normalizedQuery);
  return tokens.length > 0 && tokens.every((token) => lyricsText.includes(token));
}

function buildSongMetadataDocument(song: HiddenTunesNormalizedSong) {
  const raw = song.raw || {};

  return buildSearchDocument([
    song.title,
    song.artist,
    song.album,
    song.genre,
    song.mood,
    song.sourceName,
    raw.creator,
    raw.uploader,
    raw.tags,
    raw.description,
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
  const score = scoreSearchDocument(document, query, 0.92);
  if (score <= 0) return null;

  const metadata = scoreCatalogSongMatch(song, query);
  const lyricOnlyBoost = metadata?.matchReason === "lyric_match" ? 0 : 200;

  return {
    score: Math.min(4200, Math.round(score + lyricOnlyBoost)),
    reason: "Matched lyric" as const,
    lyricSnippet: extractLyricSnippet(lyricsText, query),
  };
}

function mapSongHit(
  song: HiddenTunesNormalizedSong,
  score: number,
  reason: UniversalMatchReason,
  catalogMatchReason: CatalogSongMatchReason,
  kind: "song" | "lyric" = "song",
  lyricSnippet?: string
): UniversalSearchSongHit {
  return {
    id: `${kind}:${song.id}`,
    kind,
    score,
    reason,
    catalogMatchReason,
    payload: song,
    subtitle: `${song.artist}${song.album ? ` • ${song.album}` : ""}`,
    lyricSnippet,
  };
}

function searchSongs(
  songs: HiddenTunesNormalizedSong[],
  query: string
): {
  songs: UniversalSearchSongHit[];
  lyrics: UniversalSearchSongHit[];
} {
  const ranked = rankCatalogSongs(songs, query, 80);
  const songHits: UniversalSearchSongHit[] = [];

  for (const hit of ranked) {
    if (hit.matchReason === "lyric_match") continue;
    if (songHits.length >= LIMITS.songs) break;

    songHits.push(
      mapSongHit(
        hit.song,
        hit.score,
        catalogReasonToUniversal(hit.matchReason),
        hit.matchReason,
        "song"
      )
    );
  }

  const lyricHits: UniversalSearchSongHit[] = [];
  const songIds = new Set(songHits.map((hit) => String(hit.payload.id || "")));
  let scanned = 0;

  for (const hit of ranked) {
    if (lyricHits.length >= LIMITS.lyrics) break;
    if (!lyricsMightMatch(hit.song, query)) continue;

    const lyricMatch = scoreSongLyrics(hit.song, query);
    if (!lyricMatch) continue;

    const songId = String(hit.song.id || "");
    if (songIds.has(songId)) {
      const metadata = scoreCatalogSongMatch(hit.song, query);
      if (metadata && metadata.matchReason !== "lyric_match") {
        continue;
      }
    }

    lyricHits.push(
      mapSongHit(
        hit.song,
        lyricMatch.score,
        lyricMatch.reason,
        "lyric_match",
        "lyric",
        lyricMatch.lyricSnippet
      )
    );
  }

  if (lyricHits.length < LIMITS.lyrics) {
    for (const song of songs) {
      if (lyricHits.length >= LIMITS.lyrics) break;
      if (scanned++ > LIMITS.lyricScan) break;

      const songId = String(song.id || "");
      if (!songId || songIds.has(songId)) continue;
      if (!lyricsMightMatch(song, query)) continue;

      const lyricMatch = scoreSongLyrics(song, query);
      if (!lyricMatch) continue;

      lyricHits.push(
        mapSongHit(
          song,
          lyricMatch.score,
          lyricMatch.reason,
          "lyric_match",
          "lyric",
          lyricMatch.lyricSnippet
        )
      );
    }
  }

  return {
    songs: songHits,
    lyrics: rankSearchHits(lyricHits, LIMITS.lyrics) as UniversalSearchSongHit[],
  };
}

function searchArtists(artists: HiddenTunesArtist[], query: string) {
  const hits: UniversalSearchArtistHit[] = [];

  for (const artist of artists) {
    const document = buildSearchDocument([artist.name, artist.genre, artist.bio]);
    const score = scoreSearchDocument(document, query, 1.05);
    const fuzzyBoost = fuzzyFieldMatches(artist.name, query) ? 120 : 0;

    if (score + fuzzyBoost <= 0) continue;

    hits.push({
      id: `artist:${artist.id}`,
      score: score + fuzzyBoost,
      reason: "Matched artist",
      payload: artist,
      subtitle: artist.genre || "Artist",
    });
  }

  return rankSearchHits(hits, LIMITS.artists);
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

  return rankSearchHits(hits, LIMITS.albums);
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

  return rankSearchHits(hits, LIMITS.genres);
}

function searchMoodRooms(query: string) {
  const hits: UniversalSearchRoomHit[] = [];

  for (const room of MOOD_ROOM_DEFINITIONS) {
    const document = buildSearchDocument([room.title, ...room.terms]);
    const score = scoreSearchDocument(document, query, 0.94);
    if (score <= 0) continue;

    hits.push({
      id: `room:${room.id}`,
      score,
      reason: "Matched mood",
      payload: {
        id: room.id,
        title: room.title,
        query: room.title,
        emoji: "✨",
      },
      subtitle: "Mood room",
    });
  }

  return rankSearchHits(hits, LIMITS.moodRooms);
}

function searchPlaylists(playlists: HiddenTunesCatalogPlaylist[], query: string) {
  const hits: UniversalSearchPlaylistHit[] = [];

  for (const playlist of playlists) {
    const score = scoreSearchDocument(
      buildSearchDocument([playlist.title, playlist.description, playlist.kind]),
      query,
      0.95
    );

    if (score <= 0) continue;

    hits.push({
      id: `playlist:${playlist.id}`,
      score,
      reason: "Matched tag",
      payload: playlist,
      subtitle: playlist.description || "Collection",
    });
  }

  return rankSearchHits(hits, LIMITS.playlists);
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

  return rankSearchHits(hits, LIMITS.tv);
}

function buildTopResults(
  query: string,
  songResults: { songs: UniversalSearchSongHit[]; lyrics: UniversalSearchSongHit[] },
  artists: UniversalSearchArtistHit[],
  albums: UniversalSearchAlbumHit[],
  genreMoods: UniversalSearchGenreHit[],
  moodRooms: UniversalSearchRoomHit[],
  playlists: UniversalSearchPlaylistHit[]
): UniversalSearchTopHit[] {
  const picks: UniversalSearchTopHit[] = [];
  const seen = new Set<string>();

  const push = (hit: UniversalSearchTopHit | undefined) => {
    if (!hit || seen.has(hit.id) || picks.length >= LIMITS.top) return;
    seen.add(hit.id);
    picks.push(hit);
  };

  push(artists[0]);
  push(genreMoods[0]);
  push(moodRooms[0]);
  push(albums[0]);
  push(playlists[0]);
  push(songResults.songs[0]);

  for (const hit of [
    ...artists.slice(1, 3),
    ...genreMoods.slice(1, 3),
    ...songResults.songs.slice(1, 4),
    ...albums.slice(1, 2),
    ...songResults.lyrics.slice(0, 1),
  ]) {
    push(hit);
  }

  return picks;
}

function hasGroupedResults(results: UniversalSearchGroupedResults) {
  return (
    results.topResults.length > 0 ||
    results.songs.length > 0 ||
    results.lyrics.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.genreMoods.length > 0 ||
    results.moodRooms.length > 0 ||
    results.playlists.length > 0 ||
    results.internetAudio.length > 0 ||
    results.tv.length > 0
  );
}

export function runUniversalCatalogSearch(
  catalog: UniversalSearchCatalog,
  query: string
): UniversalSearchGroupedResults {
  const startedAt = Date.now();
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) return EMPTY_UNIVERSAL_SEARCH_RESULTS;

  const songResults = searchSongs(catalog.songs, cleanQuery);
  const artists = searchArtists(catalog.artists, cleanQuery);
  const albums = searchAlbums(catalog.albums, cleanQuery);
  const genreMoods = searchGenres(catalog.genres, cleanQuery);
  const moodRooms = searchMoodRooms(cleanQuery);
  const playlists = searchPlaylists(catalog.playlists || [], cleanQuery);
  const tv =
    catalog.tvVideos.length > 0 ? searchTv(catalog.tvVideos, cleanQuery) : [];

  const topResults = buildTopResults(
    cleanQuery,
    songResults,
    artists,
    albums,
    genreMoods,
    moodRooms,
    playlists
  );

  const result: UniversalSearchGroupedResults = {
    topResults,
    songs: songResults.songs,
    lyrics: songResults.lyrics,
    artists,
    albums,
    genreMoods,
    moodRooms,
    playlists,
    internetAudio: [],
    tv,
    hasAnyResults: false,
  };

  result.hasAnyResults = hasGroupedResults(result);

  logSlowInteraction("search_universal", Date.now() - startedAt, {
    query: cleanQuery,
    songCount: catalog.songs.length,
    matchCount:
      result.songs.length +
      result.lyrics.length +
      result.artists.length +
      result.albums.length,
  });

  return result;
}

export function buildTrustedBackendSongHits(
  songs: HiddenTunesNormalizedSong[],
  query: string
): Pick<UniversalSearchGroupedResults, "songs" | "artists"> {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery || !songs.length) {
    return { songs: [], artists: [] };
  }

  const songHits: UniversalSearchSongHit[] = [];
  const artistHits: UniversalSearchArtistHit[] = [];
  const seenSongs = new Set<string>();
  const seenArtists = new Set<string>();

  for (const song of songs) {
    const songId = String(song.id || "").trim();
    if (!songId || seenSongs.has(songId)) continue;
    seenSongs.add(songId);

    const metadata = scoreCatalogSongMatch(song, cleanQuery);
    if (!metadata) continue;
    const score = metadata.score;

    songHits.push(
      mapSongHit(
        song,
        score,
        catalogReasonToUniversal(metadata.matchReason),
        metadata.matchReason,
        "song"
      )
    );

    const artistName = String(song.artist || "").trim();
    const artistKey = normalizeSearchText(artistName);
    if (
      artistName &&
      artistKey &&
      !seenArtists.has(artistKey) &&
      fuzzyFieldMatches(artistName, cleanQuery)
    ) {
      seenArtists.add(artistKey);
      artistHits.push({
        id: `artist:trusted:${artistKey}`,
        score: score + 200,
        reason: "Matched artist",
        payload: {
          id: artistKey,
          name: artistName,
          slug: artistKey,
          artwork: song.cover || song.artwork || song.thumbnail || "",
          cover: song.cover || song.artwork || "",
          thumbnail: song.thumbnail || song.cover || "",
          tracks: [],
          albums: [],
        } as HiddenTunesArtist,
        subtitle: "From catalog search",
      });
    }

    if (songHits.length >= LIMITS.songs) break;
  }

  return {
    songs: rankSearchHits(songHits, LIMITS.songs) as UniversalSearchSongHit[],
    artists: rankSearchHits(artistHits, LIMITS.artists) as UniversalSearchArtistHit[],
  };
}

export function buildTrustedInternetAudioHits(
  songs: HiddenTunesNormalizedSong[],
  query: string
): UniversalSearchSongHit[] {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery || !songs.length) return [];

  const hits: UniversalSearchSongHit[] = [];

  for (const song of songs) {
    const metadata = scoreCatalogSongMatch(song, cleanQuery);
    const score = metadata?.score
      ? Math.min(metadata.score, EXTERNAL_TRUSTED_SCORE)
      : EXTERNAL_TRUSTED_SCORE;

    hits.push(
      mapSongHit(
        song,
        score,
        metadata ? catalogReasonToUniversal(metadata.matchReason) : "Matched title",
        metadata?.matchReason || "title_contains",
        "song"
      )
    );
  }

  return rankSearchHits(hits, LIMITS.internetAudio) as UniversalSearchSongHit[];
}

function mergeHitGroups<T extends { id: string }>(primary: T[], fallback: T[], limit?: number) {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const hit of [...primary, ...fallback]) {
    if (!hit?.id || seen.has(hit.id)) continue;
    seen.add(hit.id);
    merged.push(hit);
    if (limit && merged.length >= limit) break;
  }

  return merged;
}

export function mergeGroupedSearchResults(
  ...groups: UniversalSearchGroupedResults[]
): UniversalSearchGroupedResults {
  if (!groups.length) return EMPTY_UNIVERSAL_SEARCH_RESULTS;

  const merged: UniversalSearchGroupedResults = {
    topResults: [],
    songs: [],
    lyrics: [],
    artists: [],
    albums: [],
    genreMoods: [],
    moodRooms: [],
    playlists: [],
    internetAudio: [],
    tv: [],
    hasAnyResults: false,
  };

  for (const group of groups) {
    merged.topResults = mergeHitGroups(merged.topResults, group.topResults, LIMITS.top);
    merged.songs = mergeHitGroups(merged.songs, group.songs, LIMITS.songs);
    merged.lyrics = mergeHitGroups(merged.lyrics, group.lyrics, LIMITS.lyrics);
    merged.artists = mergeHitGroups(merged.artists, group.artists, LIMITS.artists);
    merged.albums = mergeHitGroups(merged.albums, group.albums, LIMITS.albums);
    merged.genreMoods = mergeHitGroups(merged.genreMoods, group.genreMoods, LIMITS.genres);
    merged.moodRooms = mergeHitGroups(merged.moodRooms, group.moodRooms, LIMITS.moodRooms);
    merged.playlists = mergeHitGroups(merged.playlists, group.playlists, LIMITS.playlists);
    merged.internetAudio = mergeHitGroups(
      merged.internetAudio,
      group.internetAudio,
      LIMITS.internetAudio
    );
    merged.tv = mergeHitGroups(merged.tv, group.tv, LIMITS.tv);
  }

  merged.topResults = [...merged.topResults]
    .sort((left, right) => right.score - left.score)
    .slice(0, LIMITS.top);

  merged.hasAnyResults = hasGroupedResults(merged);
  return merged;
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
