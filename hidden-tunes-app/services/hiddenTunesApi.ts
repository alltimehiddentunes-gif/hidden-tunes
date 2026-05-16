import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  FALLBACK_ARTWORK,
  getArtworkUri,
  isRemoteArtworkUrl,
  normalizeArtworkUrl,
} from "../utils/artwork";

const HIDDEN_TUNES_API_BASE_URL = "https://hidden-tunes-api.onrender.com";
const HIDDEN_TUNES_LYRICS_API_BASE_URL =
  "https://hidden-tunes-api.onrender.com";

const CACHE_KEY = "hidden_tunes_cloud_songs_cache_v4";
const CACHE_TIME_KEY = "hidden_tunes_cloud_songs_cache_time_v4";

const ARTISTS_CACHE_KEY = "hidden_tunes_cloud_artists_cache_v1";
const ARTISTS_CACHE_TIME_KEY = "hidden_tunes_cloud_artists_cache_time_v1";

const CACHE_MAX_AGE_MS = 1000 * 60 * 5;

const HOME_SONG_LIMIT = 30;
const SEARCH_SONG_LIMIT = 30;

const BROKEN_PROMISE_FALLBACK = {
  id: "broken-promise-caasi-wills",
  title: "BROKEN PROMISE",
  slug: "broken-promise",
  artist: "Caasi Wills",
  album: "Broken Promise",
  genre: "Afrobeat",
  mood: "Emotional",
  duration_seconds: 198,
  audio_url:
    "https://pub-1c2252e3609040f19ac16c1f6ed481e6.r2.dev/songs/caasi-wills/Broken-promise/01-broken-promise.mp3",
  cover_url:
    "https://pub-1c2252e3609040f19ac16c1f6ed481e6.r2.dev/albums/cover.jpg",
  is_public: true,
};

let songsMemoryCache: HiddenTunesNormalizedSong[] | null = null;
let songsMemoryCacheTime = 0;
let songsFetchPromise: Promise<HiddenTunesNormalizedSong[]> | null = null;

let artistsMemoryCache: HiddenTunesArtist[] | null = null;
let artistsMemoryCacheTime = 0;
let artistsFetchPromise: Promise<HiddenTunesArtist[]> | null = null;

export type HiddenTunesCloudSong = {
  id?: string;
  title?: string;
  slug?: string | null;
  artist?: string | null;
  artist_name?: string | null;
  artist_id?: string | null;
  artistId?: string;
  album?: string | null;
  album_title?: string | null;
  album_id?: string | null;
  albumId?: string | null;
  artists?: any;
  albums?: any;
  genre?: string | null;
  mood?: string | null;
  artwork?: string | null;
  artworkUrl?: string | null;
  artwork_url?: string | null;
  cover?: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  albumCover?: string | null;
  album_cover?: string | null;
  url?: string | null;
  audioUrl?: string | null;
  audio_url?: string | null;
  streamUrl?: string | null;
  stream_url?: string | null;
  duration?: number | string | null;
  duration_seconds?: number | string | null;
  duration_ms?: number | string | null;
  lyrics?: string | null;
  synced_lyrics?: string | null;
  lrc?: string | null;
  sourceName?: string;
  type?: string;
  isOnline?: boolean;
  is_public?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
};

export type HiddenTunesNormalizedSong = {
  id: string;
  title: string;
  slug?: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  genre?: string;
  mood?: string;
  artwork: string;
  cover: string;
  thumbnail: string;
  url: string;
  streamUrl: string;
  duration?: number;
  lyrics?: string;
  syncedLyrics?: string;
  sourceName: "Hidden Tunes";
  type: "r2";
  isOnline: true;
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
  raw?: HiddenTunesCloudSong;
};

export type HiddenTunesAlbum = {
  id: string;
  title: string;
  slug: string;
  artist: string;
  artistId?: string;
  artwork: string;
  genre?: string;
  tracks: HiddenTunesNormalizedSong[];
};

export type HiddenTunesArtist = {
  id: string;
  name: string;
  slug: string;
  artwork: string;
  image_url?: string;
  cover?: string;
  thumbnail?: string;
  bio?: string;
  genre?: string;
  created_at?: string | null;
  albums: HiddenTunesAlbum[];
  tracks: HiddenTunesNormalizedSong[];
};

export type HiddenTunesCloudPlaylist = {
  id: string;
  title: string;
  description?: string;
  artwork: string;
  tracks: HiddenTunesNormalizedSong[];
};

export type HiddenTunesLyricsResponse = {
  songId: string;
  lyrics_type?: "lrc" | "plain" | string | null;
  lyricsType?: "lrc" | "plain" | string | null;
  synced_lrc?: string | null;
  syncedLrc?: string | null;
  lrc?: string | null;
  plain_lyrics?: string | null;
  plainLyrics?: string | null;
  lyrics?: string | null;
  lyrics_url?: string | null;
  lyricsUrl?: string | null;
  source?: string | null;
};

const LYRICS_CACHE_PREFIX = "hidden_tunes_lyrics_cache_";

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned || fallback;
}

function isSafeRemoteUrl(value: unknown) {
  if (typeof value !== "string") return false;

  const clean = value.trim();

  if (!clean) return false;
  if (clean === "null") return false;
  if (clean === "undefined") return false;
  if (clean === "[object Object]") return false;

  return clean.startsWith("https://") || clean.startsWith("http://");
}

function safeUrl(value: unknown, fallback = FALLBACK_ARTWORK) {
  if (!isSafeRemoteUrl(value)) return fallback;
  return normalizeArtworkUrl(value, fallback);
}

function isFreshMemoryCache(timestamp: number) {
  return timestamp > 0 && Date.now() - timestamp < CACHE_MAX_AGE_MS;
}

function hasRealArtwork(value: unknown) {
  return isRemoteArtworkUrl(value);
}

function artworkGroupKey(...values: unknown[]) {
  const first = values.find(
    (value) => typeof value === "string" && value.trim().length > 0
  );

  return slugify(String(first || ""));
}

function safeAudioUrl(value: unknown) {
  if (!isSafeRemoteUrl(value)) return undefined;
  return String(value).trim();
}

function makeSafeId(song: HiddenTunesCloudSong, index: number) {
  return slugify(
    song.id ||
      song.slug ||
      `${song.artist || song.artist_name || song.artists?.name || "unknown"}-${
        song.title || "song"
      }-${index}`
  );
}

function normalizeDuration(song: HiddenTunesCloudSong) {
  const value =
    song.duration_seconds ?? song.duration ?? song.duration_ms ?? undefined;

  if (value === null || value === undefined) return undefined;

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  if (song.duration_ms !== undefined && song.duration_seconds === undefined) {
    return Math.round(parsed / 1000);
  }

  if (parsed > 10000) {
    return Math.round(parsed / 1000);
  }

  return Math.round(parsed);
}

function normalizeArtistName(song: HiddenTunesCloudSong) {
  return cleanString(
    song.artist || song.artist_name || song.artists?.name,
    "Unknown Artist"
  );
}

function normalizeAlbumTitle(song: HiddenTunesCloudSong) {
  return cleanString(
    song.album || song.album_title || song.albums?.title,
    "Singles"
  );
}

function normalizeArtwork(song: HiddenTunesCloudSong) {
  return getArtworkUri(song);
}

function normalizeAudioUrl(song: HiddenTunesCloudSong) {
  return safeAudioUrl(
    song.url ||
      song.audioUrl ||
      song.audio_url ||
      song.streamUrl ||
      song.stream_url
  );
}

function normalizeRawSongArray(data: any): HiddenTunesCloudSong[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.songs)) return data.songs;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.tracks)) return data.tracks;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function normalizeRawArtistArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.artists)) return data.artists;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function dedupeSongs(songs: HiddenTunesNormalizedSong[]) {
  const seen = new Set<string>();

  return songs.filter((song) => {
    const key = `${song.id}-${song.url}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortSongsNewestFirst(songs: HiddenTunesNormalizedSong[]) {
  return [...songs].sort((a, b) => {
    const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
    const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
    return bTime - aTime;
  });
}

function mergeWithFallbackSongs(songs: HiddenTunesNormalizedSong[]) {
  const fallback = normalizeHiddenTunesSong(BROKEN_PROMISE_FALLBACK, 0);

  if (!fallback) return sortSongsNewestFirst(dedupeSongs(songs));

  const exists = songs.some(
    (song) =>
      song.id === fallback.id ||
      song.url === fallback.url ||
      song.title.toLowerCase() === fallback.title.toLowerCase()
  );

  const merged = exists ? songs : [fallback, ...songs];

  return sortSongsNewestFirst(dedupeSongs(merged));
}

function applySmartArtworkFallbacks(songs: HiddenTunesNormalizedSong[]) {
  const albumArtwork = new Map<string, string>();
  const artistArtwork = new Map<string, string>();

  songs.forEach((song) => {
    if (!hasRealArtwork(song.artwork)) return;

    const albumKey = artworkGroupKey(song.albumId, song.artist, song.album);
    const artistKey = artworkGroupKey(song.artistId, song.artist);

    if (albumKey && !albumArtwork.has(albumKey)) {
      albumArtwork.set(albumKey, song.artwork);
    }

    if (artistKey && !artistArtwork.has(artistKey)) {
      artistArtwork.set(artistKey, song.artwork);
    }
  });

  return songs.map((song) => {
    if (hasRealArtwork(song.artwork)) return song;

    const albumKey = artworkGroupKey(song.albumId, song.artist, song.album);
    const artistKey = artworkGroupKey(song.artistId, song.artist);
    const resolvedArtwork =
      albumArtwork.get(albumKey) || artistArtwork.get(artistKey);

    if (!resolvedArtwork) return song;

    return {
      ...song,
      artwork: resolvedArtwork,
      cover: resolvedArtwork,
      thumbnail: resolvedArtwork,
    };
  });
}

function finalizeSongs(songs: HiddenTunesNormalizedSong[]) {
  return applySmartArtworkFallbacks(mergeWithFallbackSongs(songs));
}

async function fetchWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readCachedSongs() {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return finalizeSongs([]);

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return finalizeSongs([]);

    const normalized = parsed
      .map((song: HiddenTunesCloudSong, index: number) =>
        normalizeHiddenTunesSong(song, index)
      )
      .filter(Boolean) as HiddenTunesNormalizedSong[];

    const songs = finalizeSongs(normalized);
    songsMemoryCache = songs;
    songsMemoryCacheTime = Date.now();

    return songs;
  } catch (error) {
    console.log("Hidden Tunes cache read error:", error);
    return finalizeSongs([]);
  }
}

async function writeCachedSongs(songs: HiddenTunesNormalizedSong[]) {
  try {
    songsMemoryCache = songs;
    songsMemoryCacheTime = Date.now();

    await AsyncStorage.multiSet([
      [CACHE_KEY, JSON.stringify(songs)],
      [CACHE_TIME_KEY, String(Date.now())],
    ]);
  } catch (error) {
    console.log("Hidden Tunes cache write error:", error);
  }
}

async function isCacheFresh() {
  try {
    const cachedAt = await AsyncStorage.getItem(CACHE_TIME_KEY);
    if (!cachedAt) return false;

    const parsed = Number(cachedAt);
    if (!Number.isFinite(parsed)) return false;

    return Date.now() - parsed < CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

async function readCachedArtists() {
  try {
    const cached = await AsyncStorage.getItem(ARTISTS_CACHE_KEY);
    if (!cached) return [];

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return [];

    const artists = parsed as HiddenTunesArtist[];
    artistsMemoryCache = artists;
    artistsMemoryCacheTime = Date.now();

    return artists;
  } catch (error) {
    console.log("Hidden Tunes artists cache read error:", error);
    return [];
  }
}

async function writeCachedArtists(artists: HiddenTunesArtist[]) {
  try {
    artistsMemoryCache = artists;
    artistsMemoryCacheTime = Date.now();

    await AsyncStorage.multiSet([
      [ARTISTS_CACHE_KEY, JSON.stringify(artists)],
      [ARTISTS_CACHE_TIME_KEY, String(Date.now())],
    ]);
  } catch (error) {
    console.log("Hidden Tunes artists cache write error:", error);
  }
}

async function isArtistsCacheFresh() {
  try {
    const cachedAt = await AsyncStorage.getItem(ARTISTS_CACHE_TIME_KEY);
    if (!cachedAt) return false;

    const parsed = Number(cachedAt);
    if (!Number.isFinite(parsed)) return false;

    return Date.now() - parsed < CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function normalizeHiddenTunesArtist(rawArtist: any): HiddenTunesArtist | null {
  const name = cleanString(rawArtist?.name, "Unknown Artist");
  const artwork = getArtworkUri(rawArtist);

  const id = cleanString(rawArtist?.id, slugify(name));
  const slug = cleanString(rawArtist?.slug, slugify(name));

  if (!id && !name) return null;

  return {
    id,
    name,
    slug,
    artwork,
    image_url: artwork,
    cover: artwork,
    thumbnail: artwork,
    bio: cleanString(rawArtist?.bio, ""),
    created_at: rawArtist?.created_at || null,
    albums: Array.isArray(rawArtist?.albums) ? rawArtist.albums : [],
    tracks: Array.isArray(rawArtist?.tracks) ? rawArtist.tracks : [],
  };
}

export function normalizeHiddenTunesSong(
  song: HiddenTunesCloudSong,
  index = 0
): HiddenTunesNormalizedSong | null {
  const audioUrl = normalizeAudioUrl(song);
  if (!audioUrl) return null;

  const artwork = normalizeArtwork(song);
  const artist = normalizeArtistName(song);
  const album = normalizeAlbumTitle(song);
  const title = cleanString(song.title, "Untitled");

  const artistId =
    song.artistId || song.artist_id || song.artists?.id || slugify(artist);

  const albumId =
    song.albumId ||
    song.album_id ||
    song.albums?.id ||
    slugify(`${artist}-${album}`);

  return {
    id: makeSafeId(song, index),
    title,
    slug: song.slug || slugify(title),
    artist,
    artistId,
    album,
    albumId,
    genre:
      song.genre ||
      song.albums?.genre ||
      song.artists?.genre ||
      "Hidden Tunes",
    mood: song.mood || undefined,
    artwork,
    cover: artwork,
    thumbnail: artwork,
    url: audioUrl,
    streamUrl: audioUrl,
    duration: normalizeDuration(song),
    lyrics: song.lyrics || undefined,
    syncedLyrics: song.synced_lyrics || song.lrc || undefined,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
    isPublic: song.is_public ?? song.isOnline ?? true,
    createdAt: song.created_at || undefined,
    updatedAt: song.updated_at || undefined,
    raw: song,
  };
}

export async function clearHiddenTunesSongsCache() {
  songsMemoryCache = null;
  songsMemoryCacheTime = 0;
  songsFetchPromise = null;
  await AsyncStorage.multiRemove([CACHE_KEY, CACHE_TIME_KEY]);
}

export async function clearHiddenTunesArtistsCache() {
  artistsMemoryCache = null;
  artistsMemoryCacheTime = 0;
  artistsFetchPromise = null;
  await AsyncStorage.multiRemove([ARTISTS_CACHE_KEY, ARTISTS_CACHE_TIME_KEY]);
}

export async function getHiddenTunesSongs(options?: { forceRefresh?: boolean }) {
  const forceRefresh = options?.forceRefresh ?? false;

  if (
    !forceRefresh &&
    songsMemoryCache &&
    isFreshMemoryCache(songsMemoryCacheTime)
  ) {
    return songsMemoryCache;
  }

  if (!forceRefresh && songsFetchPromise) {
    return songsFetchPromise;
  }

  if (!forceRefresh && (await isCacheFresh())) {
    return await readCachedSongs();
  }

  songsFetchPromise = (async () => {
    const response = await fetchWithTimeout(
      `${HIDDEN_TUNES_API_BASE_URL}/api/songs?limit=${HOME_SONG_LIMIT}&page=1`
    );

    if (!response.ok) {
      throw new Error(`Hidden Tunes API error: ${response.status}`);
    }

    const data = await response.json();
    const rawSongs = normalizeRawSongArray(data);

    const normalized = rawSongs
      .map((song: HiddenTunesCloudSong, index: number) =>
        normalizeHiddenTunesSong(song, index)
      )
      .filter(Boolean) as HiddenTunesNormalizedSong[];

    const withFallback = finalizeSongs(normalized);

    await writeCachedSongs(withFallback);

    return withFallback;
  })();

  try {
    return await songsFetchPromise;
  } catch (error) {
    console.log("Hidden Tunes API fallback to cache:", error);
    return await readCachedSongs();
  } finally {
    songsFetchPromise = null;
  }
}

export async function refreshHiddenTunesSongs() {
  await clearHiddenTunesSongsCache();
  return await getHiddenTunesSongs({ forceRefresh: true });
}

export async function searchHiddenTunesSongs(query: string) {
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) {
    return await getHiddenTunesSongs({ forceRefresh: false });
  }

  try {
    const response = await fetchWithTimeout(
      `${HIDDEN_TUNES_API_BASE_URL}/api/songs?limit=${SEARCH_SONG_LIMIT}&page=1&q=${encodeURIComponent(
        cleanQuery
      )}`
    );

    if (!response.ok) {
      throw new Error(`Hidden Tunes search API error: ${response.status}`);
    }

    const data = await response.json();
    const rawSongs = normalizeRawSongArray(data);

    return applySmartArtworkFallbacks(
      rawSongs
      .map((song: HiddenTunesCloudSong, index: number) =>
        normalizeHiddenTunesSong(song, index)
      )
      .filter(Boolean) as HiddenTunesNormalizedSong[]
    );
  } catch (error) {
    console.log("Hidden Tunes backend search fallback:", error);

    const songs = await getHiddenTunesSongs({ forceRefresh: false });

    return songs.filter((song) => {
      return (
        song.title.toLowerCase().includes(cleanQuery) ||
        song.artist.toLowerCase().includes(cleanQuery) ||
        song.album?.toLowerCase().includes(cleanQuery) ||
        song.genre?.toLowerCase().includes(cleanQuery) ||
        song.mood?.toLowerCase().includes(cleanQuery)
      );
    });
  }
}

export function extractHiddenTunesAlbums(songs: HiddenTunesNormalizedSong[]) {
  const albums = new Map<string, HiddenTunesNormalizedSong[]>();

  songs.forEach((song) => {
    const albumKey =
      song.albumId || slugify(`${song.artist}-${song.album || "Singles"}`);

    if (!albums.has(albumKey)) {
      albums.set(albumKey, []);
    }

    albums.get(albumKey)?.push(song);
  });

  return Array.from(albums.entries()).map(([key, tracks]) => {
    const firstTrack =
      tracks.find((track) => hasRealArtwork(track.artwork)) || tracks[0];

    return {
      id: slugify(key),
      title: firstTrack?.album || "Singles",
      slug: slugify(firstTrack?.album || key),
      artist: firstTrack?.artist || "Various Artists",
      artistId: firstTrack?.artistId,
      artwork: safeUrl(firstTrack?.artwork),
      genre: firstTrack?.genre,
      tracks,
    };
  }) as HiddenTunesAlbum[];
}

export function extractHiddenTunesArtists(songs: HiddenTunesNormalizedSong[]) {
  const albums = extractHiddenTunesAlbums(songs);
  const artists = new Map<string, HiddenTunesNormalizedSong[]>();

  songs.forEach((song) => {
    const artistKey = song.artistId || slugify(song.artist || "Unknown Artist");

    if (!artists.has(artistKey)) {
      artists.set(artistKey, []);
    }

    artists.get(artistKey)?.push(song);
  });

  return Array.from(artists.entries()).map(([key, tracks]) => {
    const firstTrack =
      tracks.find((track) => hasRealArtwork(track.artwork)) || tracks[0];
    const name = firstTrack?.artist || "Unknown Artist";

    return {
      id: slugify(key),
      name,
      slug: slugify(name),
      artwork: safeUrl(firstTrack?.artwork),
      image_url: safeUrl(firstTrack?.artwork),
      cover: safeUrl(firstTrack?.artwork),
      thumbnail: safeUrl(firstTrack?.artwork),
      genre: firstTrack?.genre,
      tracks,
      albums: albums.filter(
        (album) =>
          album.artist === name ||
          album.artistId === firstTrack?.artistId ||
          album.tracks.some((track) => track.artist === name)
      ),
    };
  }) as HiddenTunesArtist[];
}

export async function getHiddenTunesAlbums(options?: { forceRefresh?: boolean }) {
  const songs = await getHiddenTunesSongs(options);
  return extractHiddenTunesAlbums(songs);
}

export async function getHiddenTunesAlbumById(id: string) {
  const albums = await getHiddenTunesAlbums({ forceRefresh: false });
  const cleanId = slugify(id);

  return (
    albums.find(
      (album) =>
        album.id === cleanId ||
        album.slug === cleanId ||
        slugify(album.title) === cleanId
    ) || null
  );
}

export async function getHiddenTunesArtists(options?: {
  forceRefresh?: boolean;
}) {
  const forceRefresh = options?.forceRefresh ?? false;

  if (
    !forceRefresh &&
    artistsMemoryCache &&
    isFreshMemoryCache(artistsMemoryCacheTime)
  ) {
    return artistsMemoryCache;
  }

  if (!forceRefresh && artistsFetchPromise) {
    return artistsFetchPromise;
  }

  if (!forceRefresh && (await isArtistsCacheFresh())) {
    const cachedArtists = await readCachedArtists();
    if (cachedArtists.length > 0) return cachedArtists;
  }

  artistsFetchPromise = (async () => {
    const response = await fetchWithTimeout(
      `${HIDDEN_TUNES_API_BASE_URL}/api/artists`
    );

    if (!response.ok) {
      throw new Error(`Hidden Tunes artists API error: ${response.status}`);
    }

    const data = await response.json();
    const rawArtists = normalizeRawArtistArray(data);

    const artists = rawArtists
      .map((artist) => normalizeHiddenTunesArtist(artist))
      .filter(Boolean) as HiddenTunesArtist[];

    await writeCachedArtists(artists);

    return artists;
  })();

  try {
    return await artistsFetchPromise;
  } catch (error) {
    console.log("Hidden Tunes artists API fallback:", error);

    const cachedArtists = await readCachedArtists();
    if (cachedArtists.length > 0) return cachedArtists;

    const songs = await getHiddenTunesSongs({ forceRefresh: false });
    return extractHiddenTunesArtists(songs);
  } finally {
    artistsFetchPromise = null;
  }
}

export async function getHiddenTunesArtistById(id: string) {
  const artists = await getHiddenTunesArtists({ forceRefresh: false });
  const cleanId = slugify(id);

  return (
    artists.find(
      (artist) =>
        artist.id === id ||
        artist.id === cleanId ||
        artist.slug === cleanId ||
        slugify(artist.name) === cleanId
    ) || null
  );
}

export async function getHiddenTunesCloudPlaylists() {
  const songs = await getHiddenTunesSongs({ forceRefresh: false });

  const afroSongs = songs.filter((song) =>
    `${song.genre || ""} ${song.mood || ""} ${song.title || ""}`
      .toLowerCase()
      .includes("afro")
  );

  const emotionalSongs = songs.filter((song) =>
    `${song.genre || ""} ${song.mood || ""} ${song.title || ""}`
      .toLowerCase()
      .includes("emotional")
  );

  const caasiSongs = songs.filter((song) =>
    song.artist.toLowerCase().includes("caasi")
  );

  const newestSongs = sortSongsNewestFirst(songs);

  const playlists: HiddenTunesCloudPlaylist[] = [
    {
      id: "hidden-tunes-featured",
      title: "Hidden Tunes Featured",
      description: "Fresh cloud-hosted music from your Hidden Tunes catalog.",
      artwork: safeUrl(newestSongs[0]?.artwork),
      tracks: newestSongs,
    },
    {
      id: "caasi-wills-cloud",
      title: "Caasi Wills Essentials",
      description: "Cloud-hosted songs from Caasi Wills.",
      artwork: safeUrl(caasiSongs[0]?.artwork),
      tracks: caasiSongs,
    },
    {
      id: "afrobeat-cloud",
      title: "Afrobeat Cloud",
      description: "Afrobeat and Afro-fusion songs from your own cloud catalog.",
      artwork: safeUrl(afroSongs[0]?.artwork),
      tracks: afroSongs,
    },
    {
      id: "emotional-hidden-tunes",
      title: "Emotional Hidden Tunes",
      description: "Deep, emotional, late-night songs from Hidden Tunes.",
      artwork: safeUrl(emotionalSongs[0]?.artwork),
      tracks: emotionalSongs,
    },
  ];

  return playlists.filter((playlist) => playlist.tracks.length > 0);
}

export async function getHiddenTunesCloudPlaylistById(id: string) {
  const playlists = await getHiddenTunesCloudPlaylists();
  return playlists.find((playlist) => playlist.id === id) || null;
}

function normalizeLyricsResponse(
  songId: string,
  data: any
): HiddenTunesLyricsResponse {
  return {
    songId,
    lyrics_type: data?.lyrics_type || data?.lyricsType || null,
    lyricsType: data?.lyricsType || data?.lyrics_type || null,
    synced_lrc: data?.synced_lrc || data?.syncedLrc || data?.lrc || null,
    syncedLrc: data?.syncedLrc || data?.synced_lrc || data?.lrc || null,
    lrc: data?.lrc || data?.synced_lrc || data?.syncedLrc || null,
    plain_lyrics:
      data?.plain_lyrics || data?.plainLyrics || data?.lyrics || null,
    plainLyrics:
      data?.plainLyrics || data?.plain_lyrics || data?.lyrics || null,
    lyrics: data?.lyrics || data?.plain_lyrics || data?.plainLyrics || null,
    lyrics_url: data?.lyrics_url || data?.lyricsUrl || null,
    lyricsUrl: data?.lyricsUrl || data?.lyrics_url || null,
    source: data?.source || null,
  };
}

export async function getHiddenTunesLyrics(songId: string) {
  const cacheKey = `${LYRICS_CACHE_PREFIX}${songId}`;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached) as HiddenTunesLyricsResponse;
    }
  } catch {}

  const urlsToTry = [
    `${HIDDEN_TUNES_API_BASE_URL}/api/lyrics/${songId}`,
    `${HIDDEN_TUNES_API_BASE_URL}/api/songs/${songId}/lyrics`,
    `${HIDDEN_TUNES_LYRICS_API_BASE_URL}/api/lyrics/${songId}`,
    `${HIDDEN_TUNES_LYRICS_API_BASE_URL}/api/songs/${songId}/lyrics`,
  ];

  for (const url of urlsToTry) {
    try {
      const response = await fetchWithTimeout(url, 1800);

      if (!response.ok) {
        throw new Error(`Lyrics API error: ${response.status}`);
      }

      const data = await response.json();
      const lyrics = normalizeLyricsResponse(songId, data);

      await AsyncStorage.setItem(cacheKey, JSON.stringify(lyrics));

      return lyrics;
    } catch (error) {
      console.log("Lyrics endpoint failed, trying next:", url, error);
    }
  }

  return {
    songId,
    lyrics_type: null,
    lyricsType: null,
    synced_lrc: null,
    syncedLrc: null,
    lrc: null,
    plain_lyrics: null,
    plainLyrics: null,
    lyrics: null,
    lyrics_url: null,
    lyricsUrl: null,
    source: null,
  };
}

export {
  FALLBACK_ARTWORK,
  HIDDEN_TUNES_API_BASE_URL,
  HIDDEN_TUNES_LYRICS_API_BASE_URL,
};
