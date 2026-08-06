import { Platform } from "react-native";

import { isHiddenAudioEnabledOnAndroid } from "../constants/playbackConfig";
import type { UnifiedFavoriteItem } from "../types/favorites";
import type { HiddenTunesDerivedCatalog, HiddenTunesSong } from "./hiddenTunes";
import type { RecentlyPlayedTrack } from "./recentlyPlayedEngine";
import { isAndroidAutoContentVisible, isAndroidAutoMatureContent } from "./androidAutoVisibility";

export const ANDROID_AUTO_SNAPSHOT_SCHEMA_VERSION = 3;

const LIMITS = {
  recent: 24,
  favorites: 24,
  artists: 30,
  albums: 24,
  genres: 12,
  playlists: 8,
  songsPerBucket: 16,
  radio: 24,
  podcasts: 16,
  audiobooks: 12,
  motivation: 12,
  lectures: 12,
  search: 24,
  tracks: 420,
};

export type AndroidAutoBrowseItem = {
  mediaId: string;
  title: string;
  subtitle: string;
  playable: boolean;
  artworkUrl?: string;
  contentType?: string;
  parentId?: string;
};

export type AndroidAutoTrackPayload = {
  mediaId: string;
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationSeconds: number;
  contentType?: string;
  isLive?: boolean;
  parentId?: string;
  canonicalId?: string;
  isMature?: boolean;
  showId?: string;
  episodeId?: string;
  bookId?: string;
  chapterId?: string;
  resumePositionMillis?: number;
  collection?: string;
};

export type AndroidAutoCatalogSnapshot = {
  schemaVersion?: number;
  profileNamespace?: string;
  signature?: string;
  generatedAt?: number;
  matureAllowed?: boolean;
  maturePodcastAllowed?: boolean;
  roots: AndroidAutoBrowseItem[];
  sections: { parentId: string; items: AndroidAutoBrowseItem[] }[];
  tracks: AndroidAutoTrackPayload[];
};

export type AndroidAutoCatalogExtras = {
  recentlyPlayed?: RecentlyPlayedTrack[];
  favorites?: UnifiedFavoriteItem[];
  radioStations?: {
    id: string;
    title: string;
    subtitle?: string;
    streamUrl?: string;
    artworkUrl?: string;
  }[];
  podcastEpisodes?: {
    id: string;
    title: string;
    subtitle?: string;
    audioUrl?: string;
    artworkUrl?: string;
    durationSeconds?: number;
  }[];
  audiobooks?: {
    id: string;
    title: string;
    subtitle?: string;
    artworkUrl?: string;
  }[];
  motivationItems?: {
    id: string;
    title: string;
    subtitle?: string;
    artworkUrl?: string;
    audioUrl?: string;
  }[];
  lectureItems?: {
    id: string;
    title: string;
    subtitle?: string;
    artworkUrl?: string;
    audioUrl?: string;
  }[];
};

function songMediaId(song: { id?: string | number }) {
  return `song:${String(song.id || "").trim()}`;
}

function bucketMediaId(kind: string, key: string) {
  return `${kind}:${key}`;
}

function contextualSongMediaId(song: HiddenTunesSong, parentId: string) {
  const id = String(song.id || "").trim();
  if (["recently_added", "recently_played"].includes(parentId)) return `song:${id}`;
  return `song:${id}:ctx:${encodeURIComponent(parentId)}`;
}

function playableSongItem(song: HiddenTunesSong, parentId = "recently_added"): AndroidAutoBrowseItem {
  return {
    mediaId: contextualSongMediaId(song, parentId),
    title: song.title || "Untitled",
    subtitle: song.artist || "Hidden Tunes",
    playable: true,
    artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""),
    contentType: "music",
    parentId,
  };
}

function trackPayload(song: HiddenTunesSong, parentId = "recently_added"): AndroidAutoTrackPayload | null {
  const url = String(song.streamUrl || song.url || "").trim();
  const id = String(song.id || "").trim();
  if (!url || !id || !isAndroidAutoContentVisible(song, "music")) return null;

  return {
    mediaId: contextualSongMediaId(song, parentId),
    id,
    url,
    title: song.title || "Untitled",
    artist: song.artist || "Hidden Tunes",
    album: song.album || "",
    artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""),
    durationSeconds:
      typeof song.duration === "number" && song.duration > 0 ? song.duration : 0,
    contentType: "music",
    isLive: false,
    parentId,
    canonicalId: id,
    isMature: isAndroidAutoMatureContent(song),
    collection: [
      (song as HiddenTunesSong & { genre?: string }).genre,
      (song as HiddenTunesSong & { mood?: string }).mood,
    ].filter(Boolean).join(" · "),
  };
}

function dedupeTracks(tracks: AndroidAutoTrackPayload[]) {
  const seen = setOf();
  return tracks.filter((track) => {
    if (!track.mediaId || seen.has(track.mediaId)) return false;
    seen.add(track.mediaId);
    return true;
  });
}

function setOf() {
  return new Set<string>();
}

const HIDDEN_AA_ROOTS = new Set(["motivationals", "lectures"]);

let playableTrackRegistry = new Map<string, AndroidAutoTrackPayload>();
let currentAndroidAutoSnapshot: AndroidAutoCatalogSnapshot | null = null;

/** Remember playable AA tracks from the last snapshot (podcast/radio/music URLs). */
export function rememberAndroidAutoPlayableTracks(
  tracks: AndroidAutoTrackPayload[]
) {
  const next = new Map<string, AndroidAutoTrackPayload>();
  for (const track of tracks) {
    const mediaId = String(track.mediaId || "").trim();
    const url = String(track.url || "").trim();
    if (!mediaId || !url) continue;
    next.set(mediaId, track);
  }
  playableTrackRegistry = next;
}

export function rememberAndroidAutoCatalogSnapshot(snapshot: AndroidAutoCatalogSnapshot) {
  currentAndroidAutoSnapshot = snapshot;
  rememberAndroidAutoPlayableTracks(snapshot.tracks);
}

export function getCurrentAndroidAutoCatalogSnapshot() {
  return currentAndroidAutoSnapshot;
}

export function getAndroidAutoPlayableTrack(
  mediaId: string
): AndroidAutoTrackPayload | null {
  const track = playableTrackRegistry.get(String(mediaId || "").trim()) || null;
  if (!track) return null;
  const domain = String(track.contentType || "music") as
    "music" | "radio" | "podcast" | "audiobook";
  return isAndroidAutoContentVisible(track, domain) ? track : null;
}

function rootEntry(
  mediaId: string,
  title: string,
  subtitle: string,
  contentType: string
): AndroidAutoBrowseItem {
  return { mediaId, title, subtitle, playable: false, contentType };
}

function buildVisibleRoots(sections: AndroidAutoCatalogSnapshot["sections"]): AndroidAutoBrowseItem[] {
  const byParent = new Map(sections.map((section) => [section.parentId, section.items]));
  const order: Array<{
    id: string;
    title: string;
    subtitle: string;
    contentType: string;
    always?: boolean;
  }> = [
    {
      id: "recently_played",
      title: "Recently Played",
      subtitle: "Continue listening",
      contentType: "recent",
    },
    {
      id: "favorites",
      title: "Favorites",
      subtitle: "Saved audio",
      contentType: "favorites",
    },
    {
      id: "music",
      title: "Music",
      subtitle: "Songs and collections",
      contentType: "music",
      always: true,
    },
    { id: "radio", title: "Radio", subtitle: "Live stations", contentType: "radio" },
    { id: "podcasts", title: "Podcasts", subtitle: "Episodes", contentType: "podcast" },
  ];

  const roots: AndroidAutoBrowseItem[] = [];
  for (const entry of order) {
    if (HIDDEN_AA_ROOTS.has(entry.id)) continue;
    if (entry.always) {
      roots.push(rootEntry(entry.id, entry.title, entry.subtitle, entry.contentType));
      continue;
    }
    const items = byParent.get(entry.id) || [];
    if (!items.some((item) => item.playable)) continue;
    roots.push(rootEntry(entry.id, entry.title, entry.subtitle, entry.contentType));
  }
  return roots;
}

export function buildAndroidAutoMinimalCatalogSnapshot(): AndroidAutoCatalogSnapshot {
  const sections = [
    {
      parentId: "music",
      items: [
        {
          mediaId: "recently_added",
          title: "Recently Added",
          subtitle: "Latest songs",
          playable: false,
          contentType: "music",
        },
        {
          mediaId: "artists",
          title: "Artists",
          subtitle: "Browse by artist",
          playable: false,
          contentType: "music",
        },
        {
          mediaId: "albums",
          title: "Albums",
          subtitle: "Browse by album",
          playable: false,
          contentType: "music",
        },
        {
          mediaId: "genres",
          title: "Genres",
          subtitle: "Browse by genre",
          playable: false,
          contentType: "music",
        },
        {
          mediaId: "playlists",
          title: "Playlists",
          subtitle: "Collections",
          playable: false,
          contentType: "music",
        },
      ],
    },
  ];
  const snapshot = {
    roots: buildVisibleRoots(sections),
    sections,
    tracks: [] as AndroidAutoTrackPayload[],
  };
  rememberAndroidAutoCatalogSnapshot(snapshot);
  return snapshot;
}

export function buildAndroidAutoFallbackQueue(
  catalog: HiddenTunesDerivedCatalog | null | undefined
): HiddenTunesSong[] {
  if (!catalog?.songs?.length) return [];

  const queue: HiddenTunesSong[] = [];
  const seen = setOf();
  for (const song of catalog.songs) {
    const id = String(song.id || "").trim();
    if (!id || seen.has(id)) continue;
    const url = String(song.streamUrl || song.url || "").trim();
    if (!url) continue;
    seen.add(id);
    queue.push(song);
    if (queue.length >= LIMITS.recent) break;
  }
  return queue;
}

export function buildAndroidAutoCatalogSnapshot(
  catalog: HiddenTunesDerivedCatalog,
  extras: AndroidAutoCatalogExtras = {}
): AndroidAutoCatalogSnapshot {
  const tracks: AndroidAutoTrackPayload[] = [];
  const sections: AndroidAutoCatalogSnapshot["sections"] = [];

  // --- Recently Played ---
  const recentItems: AndroidAutoBrowseItem[] = [];
  for (const entry of (extras.recentlyPlayed || []).filter((item) =>
    isAndroidAutoContentVisible(item, "music")
  ).slice(0, LIMITS.recent)) {
    const id = String(entry.id || "").trim();
    if (!id) continue;
    const url = String(entry.streamUrl || "").trim();
    const mediaId = `song:${id}`;
    recentItems.push({
      mediaId,
      title: entry.title || "Untitled",
      subtitle: entry.artist || "Hidden Tunes",
      playable: Boolean(url) || Boolean(id),
      artworkUrl: String(entry.artwork || entry.cover || entry.thumbnail || ""),
      contentType: "music",
      parentId: "recently_played",
    });
    if (url) {
      tracks.push({
        mediaId,
        id,
        url,
        title: entry.title || "Untitled",
        artist: entry.artist || "Hidden Tunes",
        album: "",
        artworkUrl: String(entry.artwork || entry.cover || entry.thumbnail || ""),
        durationSeconds: 0,
        contentType: "music",
        isLive: false,
        parentId: "recently_played",
        canonicalId: id,
      });
    }
  }
  sections.push({ parentId: "recently_played", items: recentItems });

  // --- Favorites (audio only: song + radio) ---
  const favoriteItems: AndroidAutoBrowseItem[] = [];
  for (const fav of (extras.favorites || []).filter((item) => {
    const domain = item.type === "radio_station" ? "radio" : "music";
    return isAndroidAutoContentVisible({ ...item.metadata,
      url: item.metadata?.streamUrl }, domain);
  }).slice(0, LIMITS.favorites)) {
    if (fav.type === "song") {
      const mediaId = `fav:song:${fav.id}`;
      const url = String(fav.metadata?.streamUrl || "").trim();
      favoriteItems.push({
        mediaId,
        title: fav.title,
        subtitle: fav.subtitle || "Favorite",
        playable: true,
        artworkUrl: fav.artwork || "",
        contentType: "music",
      });
      if (url) {
        tracks.push({
          mediaId,
          id: String(fav.id),
          url,
          title: fav.title,
          artist: fav.subtitle || "Hidden Tunes",
          album: "",
          artworkUrl: fav.artwork || "",
          durationSeconds: 0,
          contentType: "music",
          isLive: false,
          parentId: "favorites",
          canonicalId: String(fav.id),
        });
      }
    } else if (fav.type === "radio_station") {
      const mediaId = `fav:radio:${fav.id}`;
      const url = String(fav.metadata?.streamUrl || "").trim();
      favoriteItems.push({
        mediaId,
        title: fav.title,
        subtitle: fav.subtitle || "Live radio",
        playable: true,
        artworkUrl: fav.artwork || "",
        contentType: "radio",
      });
      tracks.push({
        mediaId,
        id: String(fav.id),
        url,
        title: fav.title,
        artist: fav.subtitle || "Live radio",
        album: "Radio",
        artworkUrl: fav.artwork || "",
        durationSeconds: 0,
        contentType: "radio",
        isLive: true,
        parentId: "favorites",
        canonicalId: String(fav.id),
      });
    }
  }
  sections.push({ parentId: "favorites", items: favoriteItems });

  // --- Music (bounded, nested under music) ---
  const musicHome: AndroidAutoBrowseItem[] = [
    {
      mediaId: "recently_added",
      title: "Recently Added",
      subtitle: "Latest songs",
      playable: false,
      contentType: "music",
    },
    {
      mediaId: "artists",
      title: "Artists",
      subtitle: "Browse by artist",
      playable: false,
      contentType: "music",
    },
    {
      mediaId: "albums",
      title: "Albums",
      subtitle: "Browse by album",
      playable: false,
      contentType: "music",
    },
    {
      mediaId: "genres",
      title: "Genres",
      subtitle: "Browse by genre",
      playable: false,
      contentType: "music",
    },
    {
      mediaId: "playlists",
      title: "Playlists",
      subtitle: "Collections",
      playable: false,
      contentType: "music",
    },
  ];
  sections.push({ parentId: "music", items: musicHome });

  const recentSongs = (catalog.songs || []).filter((song) =>
    isAndroidAutoContentVisible(song, "music")
  ).slice(0, LIMITS.recent);
  const recentMusicItems = recentSongs.map((song) => playableSongItem(song, "recently_added"));
  for (const song of recentSongs) {
    const payload = trackPayload(song, "recently_added");
    if (payload) tracks.push(payload);
  }
  sections.push({ parentId: "recently_added", items: recentMusicItems });

  const artistItems: AndroidAutoBrowseItem[] = [];
  for (const artist of (catalog.artists || []).slice(0, LIMITS.artists)) {
    const mediaId = bucketMediaId("artist", String(artist.id || artist.name));
    artistItems.push({
      mediaId,
      title: artist.name,
      subtitle: `${artist.songs?.length || 0} songs`,
      playable: false,
      contentType: "music",
    });

    const artistSongs = (artist.songs || []).filter((song) =>
      isAndroidAutoContentVisible(song, "music")
    ).slice(0, LIMITS.songsPerBucket);
    const artistSongItems = artistSongs.map((song) => playableSongItem(song, mediaId));
    for (const song of artistSongs) {
      const payload = trackPayload(song, mediaId);
      if (payload) tracks.push(payload);
    }
    if (artistSongItems.length) {
      sections.push({ parentId: mediaId, items: artistSongItems });
    }
  }
  sections.push({ parentId: "artists", items: artistItems });

  const albumItems: AndroidAutoBrowseItem[] = [];
  for (const album of (catalog.albums || []).slice(0, LIMITS.albums)) {
    const mediaId = bucketMediaId("album", String(album.id || album.title));
    albumItems.push({
      mediaId,
      title: album.title,
      subtitle: album.artist,
      playable: false,
      contentType: "music",
    });

    const albumSongs = (album.songs || []).filter((song) =>
      isAndroidAutoContentVisible(song, "music")
    ).slice(0, LIMITS.songsPerBucket);
    const albumSongItems = albumSongs.map((song) => playableSongItem(song, mediaId));
    for (const song of albumSongs) {
      const payload = trackPayload(song, mediaId);
      if (payload) tracks.push(payload);
    }
    if (albumSongItems.length) {
      sections.push({ parentId: mediaId, items: albumSongItems });
    }
  }
  sections.push({ parentId: "albums", items: albumItems });

  const genreItems: AndroidAutoBrowseItem[] = [];
  for (const genre of (catalog.genres || []).slice(0, LIMITS.genres)) {
    const mediaId = bucketMediaId("genre", String(genre.id || genre.title));
    genreItems.push({
      mediaId,
      title: genre.title,
      subtitle: `${genre.songs?.length || 0} tracks`,
      playable: false,
      contentType: "music",
    });

    const genreSongs = (genre.songs || []).filter((song) =>
      isAndroidAutoContentVisible(song, "music")
    ).slice(0, LIMITS.songsPerBucket);
    const genreSongItems = genreSongs.map((song) => playableSongItem(song, mediaId));
    for (const song of genreSongs) {
      const payload = trackPayload(song, mediaId);
      if (payload) tracks.push(payload);
    }
    if (genreSongItems.length) {
      sections.push({ parentId: mediaId, items: genreSongItems });
    }
  }
  sections.push({ parentId: "genres", items: genreItems });

  const playlistItems: AndroidAutoBrowseItem[] = [];
  for (const playlist of (catalog.playlists || []).slice(0, LIMITS.playlists)) {
    const mediaId = bucketMediaId("playlist", String(playlist.id || playlist.title));
    playlistItems.push({
      mediaId,
      title: playlist.title,
      subtitle: playlist.description || "Collection",
      playable: false,
      contentType: "music",
    });

    const playlistSongs = (playlist.songs || []).filter((song) =>
      isAndroidAutoContentVisible(song, "music")
    ).slice(0, LIMITS.songsPerBucket);
    const playlistSongItems = playlistSongs.map((song) => playableSongItem(song, mediaId));
    for (const song of playlistSongs) {
      const payload = trackPayload(song, mediaId);
      if (payload) tracks.push(payload);
    }
    if (playlistSongItems.length) {
      sections.push({ parentId: mediaId, items: playlistSongItems });
    }
  }
  sections.push({ parentId: "playlists", items: playlistItems });

  // --- Radio (bounded favorites / recent only — never full station dump) ---
  const radioItems: AndroidAutoBrowseItem[] = [];
  for (const station of (extras.radioStations || []).filter((item) =>
    isAndroidAutoContentVisible({ ...item, url: item.streamUrl }, "radio")
  ).slice(0, LIMITS.radio)) {
    const id = String(station.id || "").trim();
    if (!id) continue;
    const mediaId = `radio:${id}`;
    radioItems.push({
      mediaId,
      title: station.title || "Radio",
      subtitle: station.subtitle || "Live",
      playable: true,
      artworkUrl: station.artworkUrl || "",
      contentType: "radio",
    });
    tracks.push({
      mediaId,
      id,
      url: String(station.streamUrl || "").trim(),
      title: station.title || "Radio",
      artist: station.subtitle || "Live radio",
      album: "Radio",
      artworkUrl: station.artworkUrl || "",
      durationSeconds: 0,
      contentType: "radio",
      isLive: true,
      parentId: "radio",
      canonicalId: id,
    });
  }
  sections.push({ parentId: "radio", items: radioItems });

  // --- Podcasts (playable only when episode has an audio URL) ---
  const podcastItems: AndroidAutoBrowseItem[] = [];
  for (const episode of (extras.podcastEpisodes || []).filter((item) =>
    isAndroidAutoContentVisible({ ...item, url: item.audioUrl }, "podcast")
  ).slice(0, LIMITS.podcasts)) {
    const id = String(episode.id || "").trim();
    if (!id) continue;
    const url = String(episode.audioUrl || "").trim();
    if (!url) continue;
    const mediaId = `podcast:${id}`;
    podcastItems.push({
      mediaId,
      title: episode.title || "Episode",
      subtitle: episode.subtitle || "Podcast",
      playable: true,
      artworkUrl: episode.artworkUrl || "",
      contentType: "podcast",
    });
    tracks.push({
      mediaId,
      id,
      url,
      title: episode.title || "Episode",
      artist: episode.subtitle || "Podcast",
      album: "Podcasts",
      artworkUrl: episode.artworkUrl || "",
      durationSeconds: episode.durationSeconds || 0,
      contentType: "podcast",
      isLive: false,
      parentId: "podcasts",
      canonicalId: id,
      episodeId: id,
    });
  }
  sections.push({ parentId: "podcasts", items: podcastItems });

  // Motivationals and lectures remain omitted until their canonical resolvers
  // exist. Audiobooks are supplied by the bounded premium snapshot collector.

  const dedupedTracks = dedupeTracks(tracks).slice(0, LIMITS.tracks);
  const snapshot = {
    roots: buildVisibleRoots(sections),
    sections,
    tracks: dedupedTracks,
  };
  rememberAndroidAutoCatalogSnapshot(snapshot);
  return snapshot;
}

export function resolveAndroidAutoMediaId(
  catalog: HiddenTunesDerivedCatalog,
  mediaId: string
): { song: HiddenTunesSong; queue: HiddenTunesSong[] } | null {
  const cleanId = String(mediaId || "").trim();
  let songId = "";
  if (cleanId.startsWith("song:")) {
    songId = cleanId.slice("song:".length);
  } else if (cleanId.startsWith("fav:song:")) {
    songId = cleanId.slice("fav:song:".length);
  } else {
    return null;
  }

  const allSongs = catalog.songs || [];
  const song = allSongs.find((entry) => String(entry.id) === songId);
  if (!song) return null;

  return { song, queue: [song] };
}

export function parseAndroidAutoMediaId(mediaId: string): {
  kind:
    | "song"
    | "radio"
    | "podcast"
    | "audiobook"
    | "motivation"
    | "lecture"
    | "unknown";
  id: string;
  raw: string;
} {
  const raw = String(mediaId || "").trim();
  if (raw.startsWith("song:")) return { kind: "song", id: raw.slice(5), raw };
  if (raw.startsWith("fav:song:")) return { kind: "song", id: raw.slice(9), raw };
  if (raw.startsWith("radio:")) return { kind: "radio", id: raw.slice(6), raw };
  if (raw.startsWith("fav:radio:")) return { kind: "radio", id: raw.slice(10), raw };
  if (raw.startsWith("podcast:")) return { kind: "podcast", id: raw.slice(8), raw };
  if (raw.startsWith("audiobook:")) return { kind: "audiobook", id: raw.slice(10), raw };
  if (raw.startsWith("motivation:")) return { kind: "motivation", id: raw.slice(11), raw };
  if (raw.startsWith("lecture:") || raw.startsWith("edu:")) {
    const id = raw.startsWith("lecture:") ? raw.slice(8) : raw.slice(4);
    return { kind: "lecture", id, raw };
  }
  return { kind: "unknown", id: raw, raw };
}

export function isAndroidAutoCatalogSyncEnabled() {
  return Platform.OS === "android" && isHiddenAudioEnabledOnAndroid();
}
