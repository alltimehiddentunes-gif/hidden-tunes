import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  FALLBACK_ARTWORK,
  getArtworkUri,
  isRemoteArtworkUrl,
  normalizeArtworkUrl,
} from "../utils/artwork";
import {
  logApiRefresh,
  logCacheResult,
  recordSlowEndpointWarning,
  startPerformanceTimer,
} from "../utils/performanceLogs";
import { isAppActiveForWork } from "../utils/performanceMode";

const HIDDEN_TUNES_API_BASE_URL = "https://hidden-tunes-api.onrender.com";
const HIDDEN_TUNES_LYRICS_API_BASE_URL =
  "https://hidden-tunes-api.onrender.com";

const CACHE_KEY = "hidden_tunes_cloud_songs_cache_v4";
const CACHE_TIME_KEY = "hidden_tunes_cloud_songs_cache_time_v4";

const ARTISTS_CACHE_KEY = "hidden_tunes_cloud_artists_cache_v1";
const ARTISTS_CACHE_TIME_KEY = "hidden_tunes_cloud_artists_cache_time_v1";

const CACHE_MAX_AGE_MS = 1000 * 60 * 5;
const NETWORK_FETCH_TIMEOUT_MS = 5500;
const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 1000 * 60 * 15;
const SLOW_ENDPOINT_WARNING_MS = 4200;
const FAILED_ENDPOINT_COOLDOWN_MS = 1000 * 30;

const HOME_SONG_LIMIT = 20;
const SEARCH_SONG_LIMIT = 24;
export const HIDDEN_TUNES_SONG_PAGE_SIZE = 24;
export const HIDDEN_TUNES_ARTIST_PAGE_SIZE = 50;

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
let songsBackgroundRefreshPromise: Promise<void> | null = null;
let songsBackgroundRefreshAttemptTime = 0;
const endpointFailures = new Map<string, { failedAt: number; count: number }>();

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

export type HiddenTunesSongPage = {
  songs: HiddenTunesNormalizedSong[];
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number;
};

export type HiddenTunesArtistPage = {
  artists: HiddenTunesArtist[];
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number;
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

function buildSongsUrl(options?: {
  page?: number;
  limit?: number;
  query?: string;
  artistId?: string;
  albumId?: string;
  genre?: string;
}) {
  const page = Math.max(Number(options?.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(options?.limit) || HIDDEN_TUNES_SONG_PAGE_SIZE, 1),
    100
  );
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });
  const query = String(options?.query || "").trim();
  const artistId = String(options?.artistId || "").trim();
  const albumId = String(options?.albumId || "").trim();
  const genre = String(options?.genre || "").trim();

  if (query) params.set("q", query);
  if (artistId) params.set("artistId", artistId);
  if (albumId) params.set("albumId", albumId);
  if (genre) params.set("genre", genre);

  return `${HIDDEN_TUNES_API_BASE_URL}/api/songs?${params.toString()}`;
}

function buildArtistsUrl(options?: {
  page?: number;
  limit?: number;
  query?: string;
}) {
  const page = Math.max(Number(options?.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(options?.limit) || HIDDEN_TUNES_ARTIST_PAGE_SIZE, 1),
    500
  );
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });
  const query = String(options?.query || "").trim();

  if (query) params.set("q", query);

  return `${HIDDEN_TUNES_API_BASE_URL}/api/artists?${params.toString()}`;
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

function mergeSongPages(
  existing: HiddenTunesNormalizedSong[],
  incoming: HiddenTunesNormalizedSong[]
) {
  return applySmartArtworkFallbacks(
    sortSongsNewestFirst(dedupeSongs([...existing, ...incoming]))
  );
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

function isNormalizedCatalogSong(value: unknown): value is HiddenTunesNormalizedSong {
  if (!value || typeof value !== "object") return false;

  const song = value as HiddenTunesNormalizedSong;
  return song.sourceName === "Hidden Tunes" && Boolean(song.streamUrl || song.url);
}

function scheduleCatalogBackgroundRefresh() {
  if (!isAppActiveForWork()) return;
  if (songsBackgroundRefreshPromise || songsFetchPromise) return;

  const now = Date.now();
  if (now - songsBackgroundRefreshAttemptTime < BACKGROUND_REFRESH_MIN_INTERVAL_MS) {
    return;
  }

  songsBackgroundRefreshAttemptTime = now;

  songsBackgroundRefreshPromise = (async () => {
    try {
      await getHiddenTunesSongsPage({
        page: 1,
        limit: HOME_SONG_LIMIT,
      });
    } catch {}
  })().finally(() => {
    songsBackgroundRefreshPromise = null;
  });
}

export async function hydrateHiddenTunesCatalogCache(): Promise<
  HiddenTunesNormalizedSong[]
> {
  if (songsMemoryCache?.length) {
    logCacheResult("catalog", true, {
      source: "memory",
      count: songsMemoryCache.length,
    });
    return songsMemoryCache;
  }

  const cached = await readCachedSongs();
  logCacheResult("catalog", cached.length > 0, {
    source: "storage",
    count: cached.length,
  });
  return cached;
}

export function getHiddenTunesCatalogSnapshot(): HiddenTunesNormalizedSong[] {
  return songsMemoryCache?.length ? songsMemoryCache : [];
}

export async function getHiddenTunesCatalogCacheInfo() {
  if (!songsMemoryCache?.length) {
    await readCachedSongs();
  }

  return {
    count: songsMemoryCache?.length || 0,
    cachedAt: songsMemoryCacheTime || 0,
    ageMs: songsMemoryCacheTime ? Date.now() - songsMemoryCacheTime : 0,
    isFresh: songsMemoryCacheTime ? isFreshMemoryCache(songsMemoryCacheTime) : false,
  };
}

export function prefetchHiddenTunesCatalog() {
  void hydrateHiddenTunesCatalogCache().then((cached) => {
    if (cached.length && isFreshMemoryCache(songsMemoryCacheTime)) return;

    scheduleCatalogBackgroundRefresh();
  });
}

async function fetchWithTimeout(url: string, timeoutMs = NETWORK_FETCH_TIMEOUT_MS) {
  const endpointKey = url.split("?")[0];
  const endpointFailure = endpointFailures.get(endpointKey);

  if (
    endpointFailure &&
    Date.now() - endpointFailure.failedAt < FAILED_ENDPOINT_COOLDOWN_MS
  ) {
    throw new Error(
      `Endpoint cooling down after ${endpointFailure.count} failures: ${endpointKey}`
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= SLOW_ENDPOINT_WARNING_MS) {
      recordSlowEndpointWarning({
        endpoint: endpointKey,
        elapsedMs,
      });
    }

    if (response.ok) {
      endpointFailures.delete(endpointKey);
    } else if (response.status >= 500 || response.status === 429) {
      const previous = endpointFailures.get(endpointKey);
      endpointFailures.set(endpointKey, {
        failedAt: Date.now(),
        count: (previous?.count || 0) + 1,
      });
    }

    return response;
  } catch (error) {
    const previous = endpointFailures.get(endpointKey);
    endpointFailures.set(endpointKey, {
      failedAt: Date.now(),
      count: (previous?.count || 0) + 1,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readCachedSongs() {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) {
      return finalizeSongs([]);
    }

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed)) return finalizeSongs([]);

    const cachedAt = await AsyncStorage.getItem(CACHE_TIME_KEY);
    const parsedTime = Number(cachedAt);
    const cacheTimestamp =
      Number.isFinite(parsedTime) && parsedTime > 0 ? parsedTime : Date.now();

    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(isNormalizedCatalogSong)
    ) {
      songsMemoryCache = parsed;
      songsMemoryCacheTime = cacheTimestamp;
      return parsed;
    }

    const normalized = parsed
      .map((song: HiddenTunesCloudSong, index: number) =>
        normalizeHiddenTunesSong(song, index)
      )
      .filter(Boolean) as HiddenTunesNormalizedSong[];

    const songs = finalizeSongs(normalized);
    songsMemoryCache = songs;
    songsMemoryCacheTime = cacheTimestamp;

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
    if (!cached) {
      return [];
    }

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

export async function getHiddenTunesSongsPage(options?: {
  page?: number;
  limit?: number;
  query?: string;
  artistId?: string;
  albumId?: string;
  genre?: string;
  forceRefresh?: boolean;
}): Promise<HiddenTunesSongPage> {
  const page = Math.max(Number(options?.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(options?.limit) || HIDDEN_TUNES_SONG_PAGE_SIZE, 1),
    100
  );
  const query = String(options?.query || "").trim();
  const artistId = String(options?.artistId || "").trim();
  const albumId = String(options?.albumId || "").trim();
  const genre = String(options?.genre || "").trim();
  const isGlobalCatalog = !query && !artistId && !albumId && !genre;
  const url = buildSongsUrl({ page, limit, query, artistId, albumId, genre });

  try {
    const refreshStart = startPerformanceTimer();
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Hidden Tunes songs page API error: ${response.status}`);
    }

    const data = await response.json();
    const rawSongs = normalizeRawSongArray(data);
    const normalized = rawSongs
      .map((song: HiddenTunesCloudSong, index: number) =>
        normalizeHiddenTunesSong(song, index + (page - 1) * limit)
      )
      .filter(Boolean) as HiddenTunesNormalizedSong[];
    const songs = applySmartArtworkFallbacks(dedupeSongs(normalized));

    if (isGlobalCatalog) {
      const existing =
        page === 1
          ? []
          : songsMemoryCache && songsMemoryCache.length > 0
          ? songsMemoryCache
          : await readCachedSongs();
      const merged = page === 1 ? finalizeSongs(songs) : mergeSongPages(existing, songs);

      await writeCachedSongs(merged);
    }

    logApiRefresh("catalog_page", refreshStart, {
      page,
      limit,
      count: songs.length,
      scope: isGlobalCatalog ? "global" : "filtered",
    });

    return {
      songs,
      page,
      limit,
      hasMore: songs.length >= limit,
      nextPage: page + 1,
    };
  } catch (error) {
    console.log("Hidden Tunes songs page API error:", {
      page,
      limit,
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    if (!isGlobalCatalog) {
      return {
        songs: [],
        page,
        limit,
        hasMore: false,
        nextPage: page + 1,
      };
    }

    const cached = await readCachedSongs();
    const start = (page - 1) * limit;
    const songs = cached.slice(start, start + limit);

    return {
      songs,
      page,
      limit,
      hasMore: start + limit < cached.length,
      nextPage: page + 1,
    };
  }
}

export async function getHiddenTunesSongs(options?: { forceRefresh?: boolean }) {
  const forceRefresh = options?.forceRefresh ?? false;

  if (!forceRefresh && songsMemoryCache?.length) {
    logCacheResult("catalog", true, {
      source: "memory",
      count: songsMemoryCache.length,
    });

    if (!isFreshMemoryCache(songsMemoryCacheTime)) {
      scheduleCatalogBackgroundRefresh();
    }

    return songsMemoryCache;
  }

  if (!forceRefresh) {
    const cached = await readCachedSongs();

    if (cached.length) {
      logCacheResult("catalog", true, {
        source: "storage",
        count: cached.length,
      });

      if (!isFreshMemoryCache(songsMemoryCacheTime)) {
        scheduleCatalogBackgroundRefresh();
      }

      return cached;
    }
    logCacheResult("catalog", false, {
      source: "storage",
      count: 0,
    });
  }

  if (!forceRefresh && songsFetchPromise) {
    return songsFetchPromise;
  }

  songsFetchPromise = (async () => {
    const page = await getHiddenTunesSongsPage({
      page: 1,
      limit: HOME_SONG_LIMIT,
    });

    return songsMemoryCache && songsMemoryCache.length > page.songs.length
      ? songsMemoryCache
      : finalizeSongs(page.songs);
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
  if (!isAppActiveForWork()) {
    return await getHiddenTunesSongs({ forceRefresh: false });
  }

  await getHiddenTunesSongsPage({
    page: 1,
    limit: HOME_SONG_LIMIT,
  });

  return songsMemoryCache?.length
    ? songsMemoryCache
    : await getHiddenTunesSongs({ forceRefresh: false });
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
      id: String(key),
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
      id: String(key),
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
  const cachedAlbum =
    albums.find(
      (album) =>
        album.id === id ||
        slugify(album.id) === cleanId ||
        album.slug === cleanId ||
        slugify(album.title) === cleanId
    ) || null;

  const albumId = cachedAlbum?.id || id;

  try {
    const firstPage = await getHiddenTunesSongsPage({
      page: 1,
      limit: 100,
      albumId,
    });

    let allTracks = firstPage.songs;
    let nextPage = firstPage.nextPage;
    let hasMore = firstPage.hasMore;

    while (hasMore && nextPage <= 10) {
      const page = await getHiddenTunesSongsPage({
        page: nextPage,
        limit: 100,
        albumId,
      });

      allTracks = mergeSongPages(allTracks, page.songs);
      hasMore = page.hasMore;
      nextPage = page.nextPage;
    }

    if (allTracks.length > 0) {
      const [album] = extractHiddenTunesAlbums(allTracks);

      if (album) {
        return {
          ...album,
          id: cachedAlbum?.id || album.id,
          slug: cachedAlbum?.slug || album.slug,
          title: cachedAlbum?.title || album.title,
          artwork: cachedAlbum?.artwork || album.artwork,
          tracks: allTracks,
        };
      }
    }
  } catch (error) {
    console.log("Hidden Tunes album page fallback:", error);
  }

  return (
    cachedAlbum || null
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
    const page = await getHiddenTunesArtistsPage({
      page: 1,
      limit: HIDDEN_TUNES_ARTIST_PAGE_SIZE,
    });

    return artistsMemoryCache && artistsMemoryCache.length > page.artists.length
      ? artistsMemoryCache
      : page.artists;
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

export async function getHiddenTunesArtistsPage(options?: {
  page?: number;
  limit?: number;
  query?: string;
}): Promise<HiddenTunesArtistPage> {
  const page = Math.max(Number(options?.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(options?.limit) || HIDDEN_TUNES_ARTIST_PAGE_SIZE, 1),
    500
  );
  const query = String(options?.query || "").trim();
  const url = buildArtistsUrl({ page, limit, query });

  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Hidden Tunes artists page API error: ${response.status}`);
    }

    const data = await response.json();
    const rawArtists = normalizeRawArtistArray(data);
    const artists = rawArtists
      .map((artist) => normalizeHiddenTunesArtist(artist))
      .filter(Boolean) as HiddenTunesArtist[];

    if (!query) {
      const existing =
        page === 1
          ? []
          : artistsMemoryCache && artistsMemoryCache.length > 0
          ? artistsMemoryCache
          : await readCachedArtists();
      const seen = new Set<string>();
      const merged = [...existing, ...artists].filter((artist) => {
        const key = String(artist.id || artist.slug || artist.name).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      await writeCachedArtists(merged);
    }

    return {
      artists,
      page,
      limit,
      hasMore: artists.length >= limit,
      nextPage: page + 1,
    };
  } catch (error) {
    console.log("Hidden Tunes artists page API error:", {
      page,
      limit,
      url,
      error: error instanceof Error ? error.message : String(error),
    });

    if (query) {
      return {
        artists: [],
        page,
        limit,
        hasMore: false,
        nextPage: page + 1,
      };
    }

    const cached = await readCachedArtists();
    const start = (page - 1) * limit;
    const artists = cached.slice(start, start + limit);

    return {
      artists,
      page,
      limit,
      hasMore: start + limit < cached.length,
      nextPage: page + 1,
    };
  }
}

export async function searchHiddenTunesSongsPage(
  query: string,
  page = 1,
  limit = SEARCH_SONG_LIMIT
) {
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) {
    return await getHiddenTunesSongsPage({ page, limit });
  }

  const apiPage = await getHiddenTunesSongsPage({
    page,
    limit,
    query: cleanQuery,
  });

  if (apiPage.songs.length > 0) {
    return apiPage;
  }

  const cached = await readCachedSongs();
  const filtered = cached.filter((song) => {
    const searchable = [
      song.title,
      song.artist,
      song.album,
      song.genre,
      song.mood,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(cleanQuery);
  });
  const start = (Math.max(page, 1) - 1) * limit;
  const songs = filtered.slice(start, start + limit);

  if (songs.length > 0) {
    logCacheResult("search", true, {
      query: cleanQuery,
      page,
      count: songs.length,
    });

    return {
      songs,
      page,
      limit,
      hasMore: start + limit < filtered.length,
      nextPage: page + 1,
    };
  }

  logCacheResult("search", false, {
    query: cleanQuery,
    page,
  });

  return apiPage;
}

export async function getHiddenTunesArtistById(id: string) {
  const artists = await getHiddenTunesArtists({ forceRefresh: false });
  const cleanId = slugify(id);
  const cachedArtist =
    artists.find(
      (artist) =>
        artist.id === id ||
        slugify(artist.id) === cleanId ||
        artist.slug === cleanId ||
        slugify(artist.name) === cleanId
    ) || null;
  const artistId = cachedArtist?.id || id;

  try {
    const firstPage = await getHiddenTunesSongsPage({
      page: 1,
      limit: 100,
      artistId,
    });

    let allTracks = firstPage.songs;
    let nextPage = firstPage.nextPage;
    let hasMore = firstPage.hasMore;

    while (hasMore && nextPage <= 10) {
      const page = await getHiddenTunesSongsPage({
        page: nextPage,
        limit: 100,
        artistId,
      });

      allTracks = mergeSongPages(allTracks, page.songs);
      hasMore = page.hasMore;
      nextPage = page.nextPage;
    }

    if (allTracks.length > 0) {
      const [artist] = extractHiddenTunesArtists(allTracks);

      if (artist) {
        return {
          ...artist,
          id: cachedArtist?.id || artist.id,
          slug: cachedArtist?.slug || artist.slug,
          name: cachedArtist?.name || artist.name,
          artwork: cachedArtist?.artwork || artist.artwork,
          bio: cachedArtist?.bio || artist.bio,
          created_at: cachedArtist?.created_at || artist.created_at,
          tracks: allTracks,
        };
      }
    }
  } catch (error) {
    console.log("Hidden Tunes artist page fallback:", error);
  }

  return (
    cachedArtist || null
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
