import { Platform } from "react-native";

import { isHiddenAudioEnabledOnAndroid } from "../constants/playbackConfig";
import type { HiddenTunesDerivedCatalog, HiddenTunesSong } from "./hiddenTunes";

const AUTO_ROOT_ID = "hidden_tunes_root";
const LIMITS = {
  recent: 24,
  artists: 30,
  albums: 24,
  genres: 12,
  playlists: 8,
  songsPerBucket: 16,
};

export type AndroidAutoBrowseItem = {
  mediaId: string;
  title: string;
  subtitle: string;
  playable: boolean;
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
};

export type AndroidAutoCatalogSnapshot = {
  roots: AndroidAutoBrowseItem[];
  sections: Array<{ parentId: string; items: AndroidAutoBrowseItem[] }>;
  tracks: AndroidAutoTrackPayload[];
};

function songMediaId(song: HiddenTunesSong) {
  return `song:${String(song.id || "").trim()}`;
}

function bucketMediaId(kind: string, key: string) {
  return `${kind}:${key}`;
}

function playableSongItem(song: HiddenTunesSong): AndroidAutoBrowseItem {
  return {
    mediaId: songMediaId(song),
    title: song.title || "Untitled",
    subtitle: song.artist || "Hidden Tunes",
    playable: true,
  };
}

function trackPayload(song: HiddenTunesSong): AndroidAutoTrackPayload | null {
  const url = String(song.streamUrl || song.url || "").trim();
  const id = String(song.id || "").trim();
  if (!url || !id) return null;

  return {
    mediaId: songMediaId(song),
    id,
    url,
    title: song.title || "Untitled",
    artist: song.artist || "Hidden Tunes",
    album: song.album || "",
    artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""),
    durationSeconds:
      typeof song.duration === "number" && song.duration > 0 ? song.duration : 0,
  };
}

function dedupeTracks(tracks: AndroidAutoTrackPayload[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track.mediaId || seen.has(track.mediaId)) return false;
    seen.add(track.mediaId);
    return true;
  });
}

export function buildAndroidAutoCatalogSnapshot(
  catalog: HiddenTunesDerivedCatalog
): AndroidAutoCatalogSnapshot {
  const tracks: AndroidAutoTrackPayload[] = [];
  const sections: AndroidAutoCatalogSnapshot["sections"] = [];

  const roots: AndroidAutoBrowseItem[] = [
    {
      mediaId: "recently_added",
      title: "Recently Added",
      subtitle: "Latest songs",
      playable: false,
    },
    {
      mediaId: "artists",
      title: "Artists",
      subtitle: "Browse by artist",
      playable: false,
    },
    {
      mediaId: "albums",
      title: "Albums",
      subtitle: "Browse by album",
      playable: false,
    },
    {
      mediaId: "genres",
      title: "Genres",
      subtitle: "Browse by genre",
      playable: false,
    },
    {
      mediaId: "playlists",
      title: "Playlists",
      subtitle: "Collections and rooms",
      playable: false,
    },
  ];

  const recentSongs = (catalog.songs || []).slice(0, LIMITS.recent);
  const recentItems = recentSongs.map(playableSongItem);
  for (const song of recentSongs) {
    const payload = trackPayload(song);
    if (payload) tracks.push(payload);
  }
  sections.push({ parentId: "recently_added", items: recentItems });

  const artistItems: AndroidAutoBrowseItem[] = [];
  for (const artist of (catalog.artists || []).slice(0, LIMITS.artists)) {
    const mediaId = bucketMediaId("artist", String(artist.id || artist.name));
    artistItems.push({
      mediaId,
      title: artist.name,
      subtitle: `${artist.songs?.length || 0} songs`,
      playable: false,
    });

    const artistSongs = (artist.songs || []).slice(0, LIMITS.songsPerBucket);
    const artistSongItems = artistSongs.map(playableSongItem);
    for (const song of artistSongs) {
      const payload = trackPayload(song);
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
    });

    const albumSongs = (album.songs || []).slice(0, LIMITS.songsPerBucket);
    const albumSongItems = albumSongs.map(playableSongItem);
    for (const song of albumSongs) {
      const payload = trackPayload(song);
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
    });

    const genreSongs = (genre.songs || []).slice(0, LIMITS.songsPerBucket);
    const genreSongItems = genreSongs.map(playableSongItem);
    for (const song of genreSongs) {
      const payload = trackPayload(song);
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
    });

    const playlistSongs = (playlist.songs || []).slice(0, LIMITS.songsPerBucket);
    const playlistSongItems = playlistSongs.map(playableSongItem);
    for (const song of playlistSongs) {
      const payload = trackPayload(song);
      if (payload) tracks.push(payload);
    }
    if (playlistSongItems.length) {
      sections.push({ parentId: mediaId, items: playlistSongItems });
    }
  }
  sections.push({ parentId: "playlists", items: playlistItems });

  return {
    roots,
    sections,
    tracks: dedupeTracks(tracks).slice(0, 420),
  };
}

export function resolveAndroidAutoMediaId(
  catalog: HiddenTunesDerivedCatalog,
  mediaId: string
): { song: HiddenTunesSong; queue: HiddenTunesSong[] } | null {
  const cleanId = String(mediaId || "").trim();
  if (!cleanId.startsWith("song:")) return null;

  const songId = cleanId.slice("song:".length);
  const allSongs = catalog.songs || [];
  const song = allSongs.find((entry) => String(entry.id) === songId);
  if (!song) return null;

  return { song, queue: [song] };
}

export function isAndroidAutoCatalogSyncEnabled() {
  return Platform.OS === "android" && isHiddenAudioEnabledOnAndroid();
}
