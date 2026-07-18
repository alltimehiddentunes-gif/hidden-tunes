import { Platform } from "react-native";

import { isHiddenAudioEnabledOnIOS } from "../constants/playbackConfig";
import {
  getFavoritesByType,
  hydrateUnifiedFavorites,
  songFavoriteToAppSong,
} from "./favorites/unifiedFavorites";
import {
  fetchHiddenTunesCatalog,
  getCachedHiddenTunesCatalog,
  type HiddenTunesSong,
} from "./hiddenTunes";
import { getUserPlaylists } from "./playlists";
import { loadRecentlyPlayed } from "./recentlyPlayedEngine";
import { loadRecentlyPlayedRadioItems } from "./radio/recentlyPlayedRadio";
import { readCachedRadioStations } from "./radio/radioCache";
import { normalizeRadioStation } from "./radio/radioNormalizer";
import { radioStationToAppSong } from "./playback/radioPlaybackAdapter";
import { syncHiddenAudioCarPlayCatalog } from "../src/hidden-audio/hiddenAudioBridge";
import type { HiddenTunesStation, RadioStation } from "../types/radio";

export const CARPLAY_CATALOG_LIMITS = {
  recentlyPlayed: 25,
  favorites: 25,
  playlists: 20,
  playlistTracks: 50,
  music: 50,
  radio: 25,
  search: 30,
} as const;

export type CarPlayBrowseItem = {
  mediaId: string;
  title: string;
  subtitle: string;
  playable: boolean;
};

export type CarPlayTrackPayload = {
  mediaId: string;
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationSeconds: number;
  collection: string;
  isLiveStream: boolean;
  playableUrlAvailable: boolean;
};

export type CarPlayCatalogSnapshot = {
  roots: CarPlayBrowseItem[];
  sections: Array<{ parentId: string; items: CarPlayBrowseItem[] }>;
  tracks: CarPlayTrackPayload[];
};

type CarPlayResolvable = {
  kind: "song" | "radio";
  song: ReturnType<typeof songFavoriteToAppSong> | ReturnType<typeof radioStationToAppSong>;
  queue: Array<ReturnType<typeof songFavoriteToAppSong> | ReturnType<typeof radioStationToAppSong>>;
  queueMode?: "standard" | "live_stream";
};

const RADIO_CATEGORY_MAP: Array<{
  mediaId: string;
  title: string;
  subtitle: string;
  cacheKeys: string[];
}> = [
  {
    mediaId: "radio_recent",
    title: "Recently Played Radio",
    subtitle: "Stations you opened recently",
    cacheKeys: [],
  },
  {
    mediaId: "radio_favorites",
    title: "Favorites",
    subtitle: "Saved stations",
    cacheKeys: [],
  },
  {
    mediaId: "radio_country",
    title: "Country",
    subtitle: "Country listening",
    cacheKeys: ["browse-country", "popular-country", "country"],
  },
  {
    mediaId: "radio_gospel",
    title: "Gospel",
    subtitle: "Gospel and worship",
    cacheKeys: ["faith", "sundayWorship", "gospel"],
  },
  {
    mediaId: "radio_afrobeats",
    title: "Afrobeats",
    subtitle: "Afrobeats energy",
    cacheKeys: ["african-radio", "afroHeat", "afrobeats"],
  },
  {
    mediaId: "radio_jazz",
    title: "Jazz",
    subtitle: "Jazz stations",
    cacheKeys: ["jazz"],
  },
  {
    mediaId: "radio_news",
    title: "News",
    subtitle: "News and talk",
    cacheKeys: ["news", "talk"],
  },
  {
    mediaId: "radio_global",
    title: "Global",
    subtitle: "Around the world",
    cacheKeys: ["featured", "popular", "lane:featured", "lane:popular"],
  },
  {
    mediaId: "radio_focus",
    title: "Focus",
    subtitle: "Focus and study",
    cacheKeys: ["deep-focus", "deepFocus", "focus"],
  },
  {
    mediaId: "radio_faith",
    title: "Faith",
    subtitle: "Faith and worship",
    cacheKeys: ["faith"],
  },
];

let lastSyncSignature = "";
let lastTrackRegistry = new Map<string, CarPlayTrackPayload>();

function emptyItem(parentId: string): CarPlayBrowseItem {
  return {
    mediaId: `empty:${parentId}`,
    title: "Nothing here yet",
    subtitle: "Hidden Tunes",
    playable: false,
  };
}

function songMediaId(songId: string) {
  return `song:${String(songId || "").trim()}`;
}

function radioMediaId(stationId: string) {
  return `radio:${String(stationId || "").trim()}`;
}

function playlistMediaId(playlistId: string) {
  return `playlist:${String(playlistId || "").trim()}`;
}

function artworkOf(song: {
  artwork?: string;
  cover?: string;
  thumbnail?: string;
  artworkUrl?: string;
  coverUrl?: string;
}) {
  return String(
    song.artworkUrl || song.artwork || song.coverUrl || song.cover || song.thumbnail || ""
  ).trim();
}

function streamOf(song: { streamUrl?: string; url?: string }) {
  return String(song.streamUrl || song.url || "").trim();
}

function toSongTrack(
  song: {
    id?: string;
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    cover?: string;
    thumbnail?: string;
    artworkUrl?: string;
    coverUrl?: string;
    streamUrl?: string;
    url?: string;
    duration?: number | string;
  },
  collection: string
): CarPlayTrackPayload | null {
  const id = String(song.id || "").trim();
  const url = streamOf(song);
  if (!id || !url) return null;

  const duration =
    typeof song.duration === "number"
      ? song.duration
      : typeof song.duration === "string" && Number.isFinite(Number(song.duration))
        ? Number(song.duration)
        : 0;

  return {
    mediaId: songMediaId(id),
    id,
    url,
    title: String(song.title || "Untitled").trim() || "Untitled",
    artist: String(song.artist || "Hidden Tunes").trim() || "Hidden Tunes",
    album: String(song.album || "").trim(),
    artworkUrl: artworkOf(song),
    durationSeconds: duration > 0 ? duration : 0,
    collection,
    isLiveStream: false,
    playableUrlAvailable: true,
  };
}

function toRadioTrack(station: RadioStation, collection: string): CarPlayTrackPayload | null {
  const id = String(station.id || "").trim();
  const url = String(station.streamUrl || "").trim();
  if (!id || !url.startsWith("https://")) return null;

  return {
    mediaId: radioMediaId(id),
    id: `radio-${id}`,
    url,
    title: String(station.title || (station as { name?: string }).name || "Live Station"),
    artist: String(station.country || station.genre || "Hidden Tunes Radio"),
    album: "Live Radio",
    artworkUrl: String(station.artworkUrl || (station as { favicon?: string }).favicon || ""),
    durationSeconds: 0,
    collection,
    isLiveStream: true,
    playableUrlAvailable: true,
  };
}

function playableItem(track: CarPlayTrackPayload): CarPlayBrowseItem {
  return {
    mediaId: track.mediaId,
    title: track.title,
    subtitle: track.artist,
    playable: true,
  };
}

function dedupeTracks(tracks: CarPlayTrackPayload[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track.mediaId || seen.has(track.mediaId)) return false;
    seen.add(track.mediaId);
    return true;
  });
}

function readStationsForKeys(cacheKeys: string[], limit: number): RadioStation[] {
  const out: RadioStation[] = [];
  const seen = new Set<string>();

  for (const key of cacheKeys) {
    const cached = (readCachedRadioStations(key) || []) as HiddenTunesStation[];
    for (const station of cached) {
      const id = String(station.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(normalizeRadioStation(station));
      if (out.length >= limit) return out;
    }
  }

  return out;
}

function defaultRoots(): CarPlayBrowseItem[] {
  return [
    {
      mediaId: "now_playing",
      title: "Now Playing",
      subtitle: "Current Hidden Tunes session",
      playable: false,
    },
    {
      mediaId: "recently_played",
      title: "Recently Played",
      subtitle: "Pick up where you left off",
      playable: false,
    },
    {
      mediaId: "favorites",
      title: "Favorites",
      subtitle: "Your saved music",
      playable: false,
    },
    {
      mediaId: "playlists",
      title: "Playlists",
      subtitle: "Collections",
      playable: false,
    },
    {
      mediaId: "music",
      title: "Music",
      subtitle: "Recommended for you",
      playable: false,
    },
    {
      mediaId: "radio",
      title: "Radio",
      subtitle: "Live stations",
      playable: false,
    },
    {
      mediaId: "search",
      title: "Search",
      subtitle: "Find music",
      playable: false,
    },
  ];
}

function catalogSignature(snapshot: CarPlayCatalogSnapshot) {
  return [
    snapshot.tracks.length,
    snapshot.sections.length,
    snapshot.roots.length,
    snapshot.tracks[0]?.mediaId || "",
    snapshot.tracks[snapshot.tracks.length - 1]?.mediaId || "",
  ].join(":");
}

export function isCarPlayCatalogSyncEnabled() {
  return Platform.OS === "ios" && isHiddenAudioEnabledOnIOS();
}

export function getCarPlayTrackByMediaId(mediaId: string): CarPlayTrackPayload | null {
  return lastTrackRegistry.get(String(mediaId || "").trim()) || null;
}

export function resolveCarPlayMediaId(mediaId: string): CarPlayResolvable | null {
  const cleanId = String(mediaId || "").trim();
  if (!cleanId) return null;

  const track = getCarPlayTrackByMediaId(cleanId);
  if (track?.isLiveStream || cleanId.startsWith("radio:")) {
    if (!track?.url) return null;
    const song = radioStationToAppSong({
      id: cleanId.replace(/^radio:/, ""),
      title: track.title,
      streamUrl: track.url,
      artworkUrl: track.artworkUrl,
      country: track.artist,
      genre: track.album,
      tags: [],
      source: "radio",
    });
    return { kind: "radio", song, queue: [song], queueMode: "live_stream" };
  }

  if (track?.url) {
    const song = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artworkUrl,
      streamUrl: track.url,
      url: track.url,
      duration: track.durationSeconds || undefined,
      sourceName: "Hidden Tunes",
      isOnline: true,
    };
    return { kind: "song", song, queue: [song], queueMode: "standard" };
  }

  if (!cleanId.startsWith("song:")) return null;
  const catalog = getCachedHiddenTunesCatalog();
  const songId = cleanId.slice("song:".length);
  const song = (catalog?.songs || []).find((entry) => String(entry.id) === songId);
  if (!song) return null;
  return { kind: "song", song, queue: [song], queueMode: "standard" };
}

export function searchCarPlayCatalog(query: string): CarPlayBrowseItem[] {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  const catalog = getCachedHiddenTunesCatalog();
  if (catalog?.songs?.length) {
    const normalizedQuery = trimmed.toLowerCase();
    return catalog.songs
      .filter((song) => {
        const haystack = `${song.title} ${song.artist} ${song.album || ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, CARPLAY_CATALOG_LIMITS.search)
      .map((song) => ({
        mediaId: songMediaId(String(song.id)),
        title: String(song.title || "Untitled"),
        subtitle: String(song.artist || "Hidden Tunes"),
        playable: true,
      }));
  }

  const local: CarPlayBrowseItem[] = [];
  for (const track of lastTrackRegistry.values()) {
    if (track.isLiveStream) continue;
    const haystack = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
    if (!haystack.includes(trimmed.toLowerCase())) continue;
    local.push(playableItem(track));
    if (local.length >= CARPLAY_CATALOG_LIMITS.search) break;
  }
  return local;
}

export async function buildCarPlayCatalogSnapshot(): Promise<CarPlayCatalogSnapshot> {
  const tracks: CarPlayTrackPayload[] = [];
  const sections: CarPlayCatalogSnapshot["sections"] = [];
  const roots = defaultRoots();

  await hydrateUnifiedFavorites().catch(() => undefined);

  const [recent, playlists, catalog] = await Promise.all([
    loadRecentlyPlayed().catch(() => []),
    getUserPlaylists().catch(() => []),
    Promise.resolve(getCachedHiddenTunesCatalog()).then(
      (cached) => cached || fetchHiddenTunesCatalog().catch(() => null)
    ),
  ]);

  // Recently Played
  const recentItems: CarPlayBrowseItem[] = [];
  for (const entry of recent.slice(0, CARPLAY_CATALOG_LIMITS.recentlyPlayed)) {
    if (String(entry.id || "").startsWith("radio-")) continue;
    const payload = toSongTrack(entry, "recently_played");
    if (!payload) continue;
    tracks.push(payload);
    recentItems.push(playableItem(payload));
  }
  sections.push({
    parentId: "recently_played",
    items: recentItems.length ? recentItems : [emptyItem("recently_played")],
  });

  // Favorites (songs only for music queue ownership)
  const favoriteSongs = getFavoritesByType("song").slice(0, CARPLAY_CATALOG_LIMITS.favorites);
  const favoriteItems: CarPlayBrowseItem[] = [];
  for (const favorite of favoriteSongs) {
    const appSong = songFavoriteToAppSong(favorite);
    const payload = toSongTrack(appSong, "favorites");
    if (!payload) continue;
    tracks.push(payload);
    favoriteItems.push(playableItem(payload));
  }
  sections.push({
    parentId: "favorites",
    items: favoriteItems.length ? favoriteItems : [emptyItem("favorites")],
  });

  // Playlists
  const playlistItems: CarPlayBrowseItem[] = [];
  for (const playlist of playlists.slice(0, CARPLAY_CATALOG_LIMITS.playlists)) {
    const parentId = playlistMediaId(playlist.id);
    playlistItems.push({
      mediaId: parentId,
      title: playlist.title || "Playlist",
      subtitle: `${playlist.trackCount || playlist.tracks?.length || 0} tracks`,
      playable: false,
    });

    const childItems: CarPlayBrowseItem[] = [];
    for (const song of (playlist.tracks || []).slice(0, CARPLAY_CATALOG_LIMITS.playlistTracks)) {
      const payload = toSongTrack(song, `playlist:${playlist.id}`);
      if (!payload) continue;
      tracks.push(payload);
      childItems.push(playableItem(payload));
    }
    sections.push({
      parentId,
      items: childItems.length ? childItems : [emptyItem(parentId)],
    });
  }
  sections.push({
    parentId: "playlists",
    items: playlistItems.length ? playlistItems : [emptyItem("playlists")],
  });

  // Music recommendations from cached catalog
  const musicSongs = ((catalog?.songs || []) as HiddenTunesSong[]).slice(
    0,
    CARPLAY_CATALOG_LIMITS.music
  );
  const musicItems: CarPlayBrowseItem[] = [];
  for (const song of musicSongs) {
    const payload = toSongTrack(song, "music");
    if (!payload) continue;
    tracks.push(payload);
    musicItems.push(playableItem(payload));
  }
  sections.push({
    parentId: "music",
    items: musicItems.length ? musicItems : [emptyItem("music")],
  });

  // Radio hierarchy
  const radioRootItems: CarPlayBrowseItem[] = RADIO_CATEGORY_MAP.map((entry) => ({
    mediaId: entry.mediaId,
    title: entry.title,
    subtitle: entry.subtitle,
    playable: false,
  }));
  sections.push({ parentId: "radio", items: radioRootItems });

  const recentRadio = await loadRecentlyPlayedRadioItems(CARPLAY_CATALOG_LIMITS.radio).catch(() => ({
    stations: [] as HiddenTunesStation[],
  }));
  const recentRadioItems: CarPlayBrowseItem[] = [];
  for (const station of recentRadio.stations.slice(0, CARPLAY_CATALOG_LIMITS.radio)) {
    const payload = toRadioTrack(normalizeRadioStation(station), "radio_recent");
    if (!payload) continue;
    tracks.push(payload);
    recentRadioItems.push(playableItem(payload));
  }
  sections.push({
    parentId: "radio_recent",
    items: recentRadioItems.length ? recentRadioItems : [emptyItem("radio_recent")],
  });

  const favoriteStations = getFavoritesByType("radio_station").slice(
    0,
    CARPLAY_CATALOG_LIMITS.radio
  );
  const favoriteRadioItems: CarPlayBrowseItem[] = [];
  for (const favorite of favoriteStations) {
    const streamUrl = String(favorite.metadata?.streamUrl || "").trim();
    if (!streamUrl.startsWith("https://")) continue;
    const payload = toRadioTrack(
      {
        id: favorite.id,
        title: favorite.title,
        streamUrl,
        artworkUrl: favorite.artwork,
        country: favorite.subtitle,
        tags: [],
        source: "radio",
      },
      "radio_favorites"
    );
    if (!payload) continue;
    tracks.push(payload);
    favoriteRadioItems.push(playableItem(payload));
  }
  sections.push({
    parentId: "radio_favorites",
    items: favoriteRadioItems.length ? favoriteRadioItems : [emptyItem("radio_favorites")],
  });

  for (const category of RADIO_CATEGORY_MAP) {
    if (category.mediaId === "radio_recent" || category.mediaId === "radio_favorites") {
      continue;
    }
    const stations = readStationsForKeys(category.cacheKeys, CARPLAY_CATALOG_LIMITS.radio);
    const items: CarPlayBrowseItem[] = [];
    for (const station of stations) {
      const payload = toRadioTrack(station, category.mediaId);
      if (!payload) continue;
      tracks.push(payload);
      items.push(playableItem(payload));
    }
    sections.push({
      parentId: category.mediaId,
      items: items.length ? items : [emptyItem(category.mediaId)],
    });
  }

  const dedupedTracks = dedupeTracks(tracks).slice(0, 420);
  lastTrackRegistry = new Map(dedupedTracks.map((track) => [track.mediaId, track]));

  return {
    roots,
    sections,
    tracks: dedupedTracks,
  };
}

export async function syncCarPlayCatalogFromDerived(): Promise<void> {
  if (!isCarPlayCatalogSyncEnabled()) return;

  try {
    const snapshot = await buildCarPlayCatalogSnapshot();
    const signature = catalogSignature(snapshot);
    if (signature === lastSyncSignature) return;

    lastSyncSignature = signature;
    await syncHiddenAudioCarPlayCatalog(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[CarPlay] catalog sync failed", error);
    }
  }
}
