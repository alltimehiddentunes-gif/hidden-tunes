import {
  fetchAllHiddenTunesCatalogSongs,
  getHiddenTunesCatalogSnapshot,
  getHiddenTunesSongsPage,
  hydrateHiddenTunesCatalogCache,
  type HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";

export interface HiddenTunesSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  mood?: string;
  cover: string;
  artwork?: string;
  thumbnail?: string;
  streamUrl: string;
  url?: string;
  lyrics?: string;
  duration?: number;
  isOnline: boolean;
  sourceName?: "Hidden Tunes";
  type?: "r2";
}

export interface HiddenTunesArtistCatalogItem {
  id: string;
  name: string;
  artwork: string;
  songs: HiddenTunesSong[];
  albums: HiddenTunesAlbumCatalogItem[];
}

export interface HiddenTunesAlbumCatalogItem {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  songs: HiddenTunesSong[];
}

export interface HiddenTunesGenreCatalogItem {
  id: string;
  title: string;
  artwork: string;
  songs: HiddenTunesSong[];
}

export interface HiddenTunesCatalogPlaylist {
  id: string;
  title: string;
  description: string;
  artwork: string;
  songs: HiddenTunesSong[];
  kind: "latest" | "artist" | "album" | "genre";
  routeParams?: Record<string, string>;
}

export interface HiddenTunesDerivedCatalog {
  songs: HiddenTunesSong[];
  artists: HiddenTunesArtistCatalogItem[];
  albums: HiddenTunesAlbumCatalogItem[];
  genres: HiddenTunesGenreCatalogItem[];
  playlists: HiddenTunesCatalogPlaylist[];
}

const SONGS_URL = "https://hiddentunes.com/songs.json";
const FALLBACK_COVER = "https://hiddentunes.com/covers/zangu-done.png";

function cleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const clean = value.trim();
  return clean || fallback;
}

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstString(...values: unknown[]) {
  const value = values.find(
    (item) => typeof item === "string" && item.trim().length > 0
  );

  return typeof value === "string" ? value.trim() : "";
}

function normalizeDuration(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeSong(song: any, index: number): HiddenTunesSong {
  const artist = cleanString(song?.artist || song?.artist_name, "Unknown Artist");
  const title = cleanString(song?.title, "Untitled Song");
  const album = cleanString(
    song?.album ||
      song?.album_title ||
      song?.albumName ||
      song?.album_name ||
      song?.releaseTitle ||
      song?.release_title
  );
  const genre = cleanString(song?.genre);
  const mood = cleanString(song?.mood);
  const artwork =
    firstString(
      song?.cover,
      song?.coverUrl,
      song?.cover_url,
      song?.artwork,
      song?.artworkUrl,
      song?.artwork_url,
      song?.image,
      song?.imageUrl,
      song?.image_url
    ) || FALLBACK_COVER;
  const streamUrl = firstString(
    song?.streamUrl,
    song?.stream_url,
    song?.audioUrl,
    song?.audio_url,
    song?.url
  );

  return {
    id: cleanString(song?.id || song?.slug, slugify(`${artist}-${title}-${index}`)),
    title,
    artist,
    album: album || undefined,
    genre: genre || undefined,
    mood: mood || undefined,
    cover: artwork,
    artwork,
    thumbnail: artwork,
    streamUrl,
    url: streamUrl,
    lyrics: cleanString(song?.lyrics || song?.lrc || song?.synced_lyrics),
    duration: normalizeDuration(song?.duration_seconds || song?.duration),
    isOnline: true,
    sourceName: "Hidden Tunes",
    type: "r2",
  };
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const key = getKey(item);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  });

  return grouped;
}

function firstArtwork(songs: HiddenTunesSong[]) {
  return songs.find((song) => song.cover || song.artwork)?.cover || FALLBACK_COVER;
}

function normalizeAlbumLabel(value: unknown) {
  return cleanString(value).replace(/\s+/g, " ").toLowerCase();
}

function albumKey(song: HiddenTunesSong) {
  const album = normalizeAlbumLabel(song.album) || "singles";
  return `${normalizeAlbumLabel(song.artist)}:${album}`;
}

function buildAlbums(songs: HiddenTunesSong[]): HiddenTunesAlbumCatalogItem[] {
  return Array.from(groupBy(songs, albumKey).entries()).map(([key, albumSongs]) => {
    const lead = albumSongs[0];
    const title = lead.album || "Singles";

    return {
      id: slugify(key),
      title,
      artist: lead.artist,
      artwork: firstArtwork(albumSongs),
      songs: albumSongs,
    };
  });
}

function buildArtists(
  songs: HiddenTunesSong[],
  albums: HiddenTunesAlbumCatalogItem[]
): HiddenTunesArtistCatalogItem[] {
  // Group by slugified identity — raw display names that only differ by case /
  // punctuation must not become separate rows with the same FlatList key
  // (e.g. "Caasi Wills" + "Caasi wills" → both id "caasi-wills").
  return Array.from(
    groupBy(songs, (song) => {
      const slug = slugify(cleanString(song.artist, "Unknown Artist"));
      return slug || "unknown-artist";
    }).entries()
  ).map(([id, artistSongs]) => {
    const nameCounts = new Map<string, number>();
    artistSongs.forEach((song) => {
      const name = cleanString(song.artist, "Unknown Artist");
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    });

    let preferredName = "Unknown Artist";
    let preferredCount = -1;
    nameCounts.forEach((count, name) => {
      if (count > preferredCount) {
        preferredName = name;
        preferredCount = count;
      }
    });

    if (
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      nameCounts.size > 1
    ) {
      console.log("[list_key_collision] artist_name_variants_merged", {
        key: id,
        variants: Array.from(nameCounts.keys()),
      });
    }

    return {
      id,
      name: preferredName,
      artwork: firstArtwork(artistSongs),
      songs: artistSongs,
      albums: albums.filter(
        (album) =>
          slugify(cleanString(album.artist, "Unknown Artist")) === id ||
          album.artist === preferredName
      ),
    };
  });
}

function buildGenres(songs: HiddenTunesSong[]): HiddenTunesGenreCatalogItem[] {
  return Array.from(
    groupBy(
      songs.filter((song) => Boolean(song.genre)),
      (song) => song.genre || ""
    ).entries()
  ).map(([title, genreSongs]) => ({
    id: slugify(title),
    title,
    artwork: firstArtwork(genreSongs),
    songs: genreSongs,
  }));
}

function buildPlaylists(
  songs: HiddenTunesSong[],
  artists: HiddenTunesArtistCatalogItem[],
  albums: HiddenTunesAlbumCatalogItem[],
  genres: HiddenTunesGenreCatalogItem[]
): HiddenTunesCatalogPlaylist[] {
  const playlists: HiddenTunesCatalogPlaylist[] = [];

  if (songs.length) {
    playlists.push({
      id: "latest-hidden-tunes",
      title: "Latest Hidden Tunes",
      description: "Newest songs from the current catalog source",
      artwork: firstArtwork(songs),
      songs,
      kind: "latest",
    });
  }

  artists.forEach((artist) => {
    playlists.push({
      id: `artist-${artist.id}`,
      title: `${artist.name} Essentials`,
      description: `${artist.songs.length} song${artist.songs.length === 1 ? "" : "s"} by ${artist.name}`,
      artwork: artist.artwork,
      songs: artist.songs,
      kind: "artist",
      routeParams: { artist: artist.name },
    });
  });

  albums.forEach((album) => {
    playlists.push({
      id: `album-${album.id}`,
      title: album.title,
      description: `${album.songs.length} song${album.songs.length === 1 ? "" : "s"} from ${album.artist}`,
      artwork: album.artwork,
      songs: album.songs,
      kind: "album",
      routeParams: { album: album.title, artist: album.artist, thumbnail: album.artwork },
    });
  });

  genres.forEach((genre) => {
    playlists.push({
      id: `genre-${genre.id}`,
      title: genre.title,
      description: `${genre.songs.length} song${genre.songs.length === 1 ? "" : "s"} tagged ${genre.title}`,
      artwork: genre.artwork,
      songs: genre.songs,
      kind: "genre",
      routeParams: { title: genre.title, query: genre.title, id: genre.id, type: "genre" },
    });
  });

  return playlists;
}

export function deriveHiddenTunesCatalog(
  songs: HiddenTunesSong[]
): HiddenTunesDerivedCatalog {
  const playableSongs = songs.filter((song) => Boolean(song.streamUrl));
  const albums = buildAlbums(playableSongs);
  const artists = buildArtists(playableSongs, albums);
  const genres = buildGenres(playableSongs);
  const playlists = buildPlaylists(playableSongs, artists, albums, genres);

  return {
    songs: playableSongs,
    artists,
    albums,
    genres,
    playlists,
  };
}

function mapNormalizedCatalogSong(
  song: HiddenTunesNormalizedSong,
  index: number
): HiddenTunesSong {
  return normalizeSong(
    {
      id: song.id,
      title: song.title,
      slug: song.slug,
      artist: song.artist,
      artist_name: song.artist,
      album: song.album,
      genre: song.genre,
      mood: song.mood,
      cover: song.cover || song.artwork,
      cover_url: song.cover,
      artwork: song.artwork,
      artwork_url: song.artwork,
      thumbnail: song.thumbnail,
      streamUrl: song.streamUrl || song.url,
      stream_url: song.streamUrl || song.url,
      audio_url: song.url || song.streamUrl,
      url: song.url || song.streamUrl,
      lyrics: song.lyrics,
      synced_lyrics: song.syncedLyrics,
      duration: song.duration,
      duration_seconds: song.duration,
    },
    index
  );
}

const SONGS_JSON_FETCH_TIMEOUT_MS = 5500;

async function fetchHiddenTunesSongsFromJson(): Promise<HiddenTunesSong[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SONGS_JSON_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(SONGS_URL, { signal: controller.signal });

    if (!response.ok) {
      console.log("Failed to fetch songs.json:", response.status);
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.log("songs.json is not an array");
      return [];
    }

    const songs = data.map(normalizeSong).filter((song) => Boolean(song.streamUrl));

    if (songs.length > 0) {
      console.log(
        `[HiddenTunes][catalog] loaded ${songs.length} song(s) from songs.json fallback`
      );
    }

    return songs;
  } catch (error) {
    console.log("Hidden Tunes songs.json fetch error:", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHiddenTunesSongs(options?: {
  forceRefresh?: boolean;
}): Promise<HiddenTunesSong[]> {
  try {
    const normalized = await fetchAllHiddenTunesCatalogSongs({
      forceRefresh: options?.forceRefresh,
    });

    const apiSongs = normalized
      .map(mapNormalizedCatalogSong)
      .filter((song) => Boolean(song.streamUrl));

    if (apiSongs.length > 0) {
      return apiSongs;
    }
  } catch (error) {
    console.log("Hidden Tunes API catalog error, falling back to songs.json:", error);
  }

  return fetchHiddenTunesSongsFromJson();
}

let derivedCatalogCache: HiddenTunesDerivedCatalog | null = null;
let derivedCatalogFingerprint = "";
let catalogFetchInflight: Promise<HiddenTunesDerivedCatalog> | null = null;

function buildCatalogFingerprint(songs: HiddenTunesSong[]) {
  if (!songs.length) return "empty";
  const first = songs[0]?.id || "";
  const last = songs[songs.length - 1]?.id || "";
  return `${songs.length}:${first}:${last}`;
}

export const DISCOVERY_MIN_TRUSTED_CATALOG_SIZE = 50;
export const DISCOVERY_CATALOG_PAGE_LIMIT = 60;

function mapSnapshotSongs(snapshot: HiddenTunesNormalizedSong[]) {
  const seen = new Set<string>();
  const songs: HiddenTunesSong[] = [];

  snapshot.forEach((song, index) => {
    const mapped = mapNormalizedCatalogSong(song, index);
    if (!mapped.streamUrl || seen.has(mapped.id)) return;
    seen.add(mapped.id);
    songs.push(mapped);
  });

  return songs;
}

function rebuildDerivedCatalog(songs: HiddenTunesSong[]) {
  const catalog = deriveHiddenTunesCatalog(songs);
  derivedCatalogCache = catalog;
  derivedCatalogFingerprint = buildCatalogFingerprint(songs);
  return catalog;
}

export function isDerivedCatalogTrusted(catalog?: HiddenTunesDerivedCatalog | null) {
  return Boolean(
    catalog && catalog.songs.length >= DISCOVERY_MIN_TRUSTED_CATALOG_SIZE
  );
}

export function syncDerivedCatalogFromSnapshot() {
  const snapshotSongs = mapSnapshotSongs(getHiddenTunesCatalogSnapshot());
  if (!snapshotSongs.length) {
    return derivedCatalogCache;
  }

  const derivedCount = derivedCatalogCache?.songs.length || 0;
  if (derivedCatalogCache && snapshotSongs.length <= derivedCount) {
    return derivedCatalogCache;
  }

  return rebuildDerivedCatalog(snapshotSongs);
}

export function getDiscoveryPlayableSongs(): HiddenTunesSong[] {
  syncDerivedCatalogFromSnapshot();

  const snapshotSongs = mapSnapshotSongs(getHiddenTunesCatalogSnapshot());
  const derivedSongs = derivedCatalogCache?.songs || [];
  const best = snapshotSongs.length >= derivedSongs.length ? snapshotSongs : derivedSongs;

  if (best.length > derivedSongs.length) {
    rebuildDerivedCatalog(best);
  }

  return best.length ? best : derivedSongs;
}

export function getCachedHiddenTunesCatalog() {
  syncDerivedCatalogFromSnapshot();
  return derivedCatalogCache;
}

/**
 * Disk → memory → derived catalog for first paint.
 * Returns any non-empty cache (including untrusted slices) so Home is not blocked.
 */
export async function hydrateCachedHiddenTunesCatalog(): Promise<HiddenTunesDerivedCatalog | null> {
  await hydrateHiddenTunesCatalogCache();
  syncDerivedCatalogFromSnapshot();
  const cached = derivedCatalogCache;
  return cached && cached.songs.length > 0 ? cached : null;
}

export function clearHiddenTunesCatalogCache() {
  derivedCatalogCache = null;
  derivedCatalogFingerprint = "";
  catalogFetchInflight = null;
}

export async function fetchHiddenTunesDiscoveryCatalog(options?: {
  forceRefresh?: boolean;
}): Promise<HiddenTunesDerivedCatalog> {
  if (options?.forceRefresh) {
    clearHiddenTunesCatalogCache();
  } else {
    syncDerivedCatalogFromSnapshot();
    if (derivedCatalogCache && isDerivedCatalogTrusted(derivedCatalogCache)) {
      return derivedCatalogCache;
    }
  }

  try {
    const page = await getHiddenTunesSongsPage({
      page: 1,
      limit: DISCOVERY_CATALOG_PAGE_LIMIT,
      forceRefresh: options?.forceRefresh,
    });
    const songs = page.songs.map((song, index) =>
      mapNormalizedCatalogSong(song, index)
    );

    if (songs.length > 0) {
      return rebuildDerivedCatalog(songs);
    }
  } catch (error) {
    console.log("Hidden Tunes discovery catalog API error:", error);
  }

  if (derivedCatalogCache) {
    return derivedCatalogCache;
  }

  return rebuildDerivedCatalog([]);
}

export async function fetchHiddenTunesCatalog(options?: {
  forceRefresh?: boolean;
}): Promise<HiddenTunesDerivedCatalog> {
  if (options?.forceRefresh) {
    clearHiddenTunesCatalogCache();
  } else {
    syncDerivedCatalogFromSnapshot();
    if (derivedCatalogCache && isDerivedCatalogTrusted(derivedCatalogCache)) {
      return derivedCatalogCache;
    }

    if (catalogFetchInflight) {
      return catalogFetchInflight;
    }
  }

  const run = async (): Promise<HiddenTunesDerivedCatalog> => {
    const needsFullFetch =
      options?.forceRefresh ||
      !derivedCatalogCache ||
      !isDerivedCatalogTrusted(derivedCatalogCache);

    const songs = await fetchHiddenTunesSongs({
      forceRefresh: needsFullFetch,
    });
    const fingerprint = buildCatalogFingerprint(songs);

    if (
      !needsFullFetch &&
      derivedCatalogCache &&
      derivedCatalogFingerprint === fingerprint
    ) {
      return derivedCatalogCache;
    }

    return rebuildDerivedCatalog(songs);
  };

  if (options?.forceRefresh) {
    return run();
  }

  catalogFetchInflight = run().finally(() => {
    catalogFetchInflight = null;
  });

  return catalogFetchInflight;
}
