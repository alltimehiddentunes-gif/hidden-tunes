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
import { pickBestArtworkFromSongs } from "../utils/artwork";

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

function collectMatchedSongBackbone(
  songResults: {
    songs: UniversalSearchSongHit[];
    lyrics: UniversalSearchSongHit[];
  }
): UniversalSearchSongHit[] {
  const bySongId = new Map<string, UniversalSearchSongHit>();

  for (const hit of [...songResults.songs, ...songResults.lyrics]) {
    const songId = String(hit.payload.id || "").trim();
    if (!songId) continue;

    const existing = bySongId.get(songId);
    if (!existing || hit.score > existing.score) {
      bySongId.set(songId, hit);
    }
  }

  return [...bySongId.values()].sort((left, right) => right.score - left.score);
}

function withInheritedSongArtwork<T extends Record<string, unknown>>(
  entity: T,
  songs: HiddenTunesNormalizedSong[]
): T {
  const artwork = pickBestArtworkFromSongs(songs);
  return {
    ...entity,
    artwork: (entity as { artwork?: string }).artwork || artwork,
    cover: (entity as { cover?: string }).cover || artwork,
    thumbnail: (entity as { thumbnail?: string }).thumbnail || artwork,
  };
}

function deriveArtistsFromMatchedSongs(
  backbone: UniversalSearchSongHit[],
  catalogArtists: HiddenTunesArtist[],
  query: string
): UniversalSearchArtistHit[] {
  const groups = new Map<string, { name: string; hits: UniversalSearchSongHit[] }>();

  for (const hit of backbone) {
    const name = String(hit.payload.artist || "").trim();
    const key = normalizeSearchText(name);
    if (!name || !key) continue;

    const group = groups.get(key) || { name, hits: [] };
    group.hits.push(hit);
    groups.set(key, group);
  }

  const hits: UniversalSearchArtistHit[] = [];

  for (const group of groups.values()) {
    const relatedSongs = group.hits.map((hit) => hit.payload);
    const catalogArtist = catalogArtists.find(
      (artist) => normalizeSearchText(artist.name) === normalizeSearchText(group.name)
    );

    const maxSongScore = Math.max(...group.hits.map((hit) => hit.score));
    const nameBoost = fuzzyFieldMatches(group.name, query) ? 220 : 0;
    const artistReasonBoost = group.hits.some((hit) =>
      String(hit.catalogMatchReason || "").startsWith("artist_")
    )
      ? 140
      : 0;

    const payload = withInheritedSongArtwork(
      catalogArtist || {
        id: `artist:${normalizeSearchText(group.name)}`,
        name: group.name,
        slug: normalizeSearchText(group.name),
        artwork: "",
        tracks: relatedSongs,
        albums: [],
      } as HiddenTunesArtist,
      relatedSongs
    );

    hits.push({
      id: `artist:${payload.id}`,
      score: maxSongScore + nameBoost + artistReasonBoost,
      reason: "Matched artist",
      payload,
      subtitle: payload.genre || `${relatedSongs.length} matched track${relatedSongs.length === 1 ? "" : "s"}`,
    });
  }

  return rankSearchHits(hits, LIMITS.artists);
}

function deriveAlbumsFromMatchedSongs(
  backbone: UniversalSearchSongHit[],
  catalogAlbums: HiddenTunesAlbum[],
  query: string
): UniversalSearchAlbumHit[] {
  const groups = new Map<
    string,
    { title: string; artist: string; hits: UniversalSearchSongHit[] }
  >();

  for (const hit of backbone) {
    const title = String(hit.payload.album || "").trim();
    const artist = String(hit.payload.artist || "").trim();
    if (!title) continue;

    const key = `${normalizeSearchText(artist)}::${normalizeSearchText(title)}`;
    const group = groups.get(key) || { title, artist, hits: [] };
    group.hits.push(hit);
    groups.set(key, group);
  }

  const hits: UniversalSearchAlbumHit[] = [];

  for (const group of groups.values()) {
    const relatedSongs = group.hits.map((hit) => hit.payload);
    const catalogAlbum = catalogAlbums.find(
      (album) =>
        normalizeSearchText(album.title) === normalizeSearchText(group.title) &&
        normalizeSearchText(album.artist) === normalizeSearchText(group.artist)
    );

    const maxSongScore = Math.max(...group.hits.map((hit) => hit.score));
    const titleBoost = fuzzyFieldMatches(group.title, query) ? 200 : 0;
    const albumReasonBoost = group.hits.some((hit) =>
      String(hit.catalogMatchReason || "").startsWith("album_")
    )
      ? 130
      : 0;

    const payload = withInheritedSongArtwork(
      catalogAlbum || {
        id: `album:${normalizeSearchText(group.artist)}-${normalizeSearchText(group.title)}`,
        title: group.title,
        slug: normalizeSearchText(group.title),
        artist: group.artist,
        artwork: "",
        tracks: relatedSongs,
      } as HiddenTunesAlbum,
      relatedSongs
    );

    hits.push({
      id: `album:${payload.id}`,
      score: maxSongScore + titleBoost + albumReasonBoost,
      reason: "Matched album",
      payload,
      subtitle: group.artist,
    });
  }

  return rankSearchHits(hits, LIMITS.albums);
}

function deriveGenresFromMatchedSongs(
  backbone: UniversalSearchSongHit[],
  catalogGenres: HiddenTunesGenre[],
  query: string
): UniversalSearchGenreHit[] {
  const groups = new Map<string, { label: string; hits: UniversalSearchSongHit[] }>();

  for (const hit of backbone) {
    for (const rawLabel of [hit.payload.genre, hit.payload.mood]) {
      const label = String(rawLabel || "").trim();
      const key = normalizeSearchText(label);
      if (!label || !key) continue;

      const group = groups.get(key) || { label, hits: [] };
      group.hits.push(hit);
      groups.set(key, group);
    }
  }

  const hits: UniversalSearchGenreHit[] = [];

  for (const group of groups.values()) {
    const relatedSongs = group.hits.map((hit) => hit.payload);
    const catalogGenre = catalogGenres.find(
      (genre) => normalizeSearchText(genre.title) === normalizeSearchText(group.label)
    );

    const maxSongScore = Math.max(...group.hits.map((hit) => hit.score));
    const titleBoost = fuzzyFieldMatches(group.label, query) ? 180 : 0;
    const genreReasonBoost = group.hits.some((hit) =>
      ["genre_exact", "genre_starts", "genre_contains", "mood_match"].includes(
        String(hit.catalogMatchReason || "")
      )
    )
      ? 120
      : 0;

    const payload =
      catalogGenre ||
      ({
        id: `genre:${normalizeSearchText(group.label)}`,
        title: group.label,
        query: group.label,
        emoji: "🎵",
      } as HiddenTunesGenre);

    hits.push({
      id: `genre:${payload.id}`,
      score: maxSongScore + titleBoost + genreReasonBoost,
      reason: /mood|feel|vibe|room/i.test(group.label) ? "Matched mood" : "Matched genre",
      payload,
      subtitle: `${relatedSongs.length} matched track${relatedSongs.length === 1 ? "" : "s"}`,
    });
  }

  return rankSearchHits(hits, LIMITS.genres);
}

function deriveMoodRoomsFromMatchedSongs(
  backbone: UniversalSearchSongHit[],
  query: string
): UniversalSearchRoomHit[] {
  const hits: UniversalSearchRoomHit[] = [];

  for (const room of MOOD_ROOM_DEFINITIONS) {
    const queryScore = scoreSearchDocument(
      buildSearchDocument([room.title, ...room.terms]),
      query,
      0.94
    );
    if (queryScore <= 0) continue;

    const roomTerms = room.terms.map((term) => normalizeSearchText(term));
    const matchedHits = backbone.filter((hit) => {
      const songText = normalizeSearchText(
        [hit.payload.title, hit.payload.genre, hit.payload.mood, hit.payload.artist].join(" ")
      );
      return roomTerms.some((term) => term && songText.includes(term));
    });

    if (!matchedHits.length) continue;

    const maxSongScore = Math.max(...matchedHits.map((hit) => hit.score));

    hits.push({
      id: `room:${room.id}`,
      score: Math.round(queryScore + maxSongScore * 0.35),
      reason: "Matched mood",
      payload: {
        id: room.id,
        title: room.title,
        query: room.title,
        emoji: "✨",
      },
      subtitle: `${matchedHits.length} matched track${matchedHits.length === 1 ? "" : "s"}`,
    });
  }

  return rankSearchHits(hits, LIMITS.moodRooms);
}

function derivePlaylistsFromMatchedSongs(
  backbone: UniversalSearchSongHit[],
  playlists: HiddenTunesCatalogPlaylist[],
  query: string
): UniversalSearchPlaylistHit[] {
  const matchedIds = new Set(
    backbone.map((hit) => String(hit.payload.id || "").trim()).filter(Boolean)
  );
  const scoreBySongId = new Map(
    backbone.map((hit) => [String(hit.payload.id || "").trim(), hit.score])
  );

  const hits: UniversalSearchPlaylistHit[] = [];

  for (const playlist of playlists) {
    const overlap = (playlist.songs || []).filter((song) =>
      matchedIds.has(String(song.id || "").trim())
    );
    if (!overlap.length) continue;

    const titleScore = scoreSearchDocument(
      buildSearchDocument([playlist.title, playlist.description, playlist.kind]),
      query,
      0.95
    );
    const overlapBoost = overlap.length * 80;
    const maxSongScore = Math.max(
      ...overlap.map((song) => scoreBySongId.get(String(song.id || "").trim()) || 0)
    );

    const payload = withInheritedSongArtwork(
      {
        ...playlist,
        songs: overlap.length === playlist.songs.length ? playlist.songs : overlap,
      },
      overlap as HiddenTunesNormalizedSong[]
    );

    hits.push({
      id: `playlist:${playlist.id}`,
      score: maxSongScore + titleScore + overlapBoost,
      reason: titleScore > 0 ? "Matched tag" : "Matched title",
      payload,
      subtitle: playlist.description || `${overlap.length} matched tracks`,
    });
  }

  return rankSearchHits(hits, LIMITS.playlists);
}

function deriveGroupedResultsFromSongBackbone(
  catalog: UniversalSearchCatalog,
  query: string,
  songResults: {
    songs: UniversalSearchSongHit[];
    lyrics: UniversalSearchSongHit[];
  }
) {
  const backbone = collectMatchedSongBackbone(songResults);

  return {
    backbone,
    artists: deriveArtistsFromMatchedSongs(backbone, catalog.artists, query),
    albums: deriveAlbumsFromMatchedSongs(backbone, catalog.albums, query),
    genreMoods: deriveGenresFromMatchedSongs(backbone, catalog.genres, query),
    moodRooms: deriveMoodRoomsFromMatchedSongs(backbone, query),
    playlists: derivePlaylistsFromMatchedSongs(backbone, catalog.playlists || [], query),
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
  const derived = deriveGroupedResultsFromSongBackbone(catalog, cleanQuery, songResults);
  const artists = derived.artists;
  const albums = derived.albums;
  const genreMoods = derived.genreMoods;
  const moodRooms = derived.moodRooms;
  const playlists = derived.playlists;
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
): Pick<
  UniversalSearchGroupedResults,
  "songs" | "artists" | "albums" | "genreMoods" | "moodRooms" | "playlists"
> {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery || !songs.length) {
    return {
      songs: [],
      artists: [],
      albums: [],
      genreMoods: [],
      moodRooms: [],
      playlists: [],
    };
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

  const rankedSongs = rankSearchHits(songHits, LIMITS.songs) as UniversalSearchSongHit[];
  const derived = deriveGroupedResultsFromSongBackbone(
    {
      songs: [],
      albums: [],
      artists: [],
      genres: [],
      playlists: [],
      tvVideos: [],
    },
    cleanQuery,
    { songs: rankedSongs, lyrics: [] }
  );

  const backboneArtists = derived.artists;
  const mergedArtists = mergeHitGroups(
    backboneArtists,
    rankSearchHits(artistHits, LIMITS.artists) as UniversalSearchArtistHit[],
    LIMITS.artists
  );

  return {
    songs: rankedSongs,
    artists: mergedArtists,
    albums: derived.albums,
    genreMoods: derived.genreMoods,
    moodRooms: derived.moodRooms,
    playlists: derived.playlists,
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
