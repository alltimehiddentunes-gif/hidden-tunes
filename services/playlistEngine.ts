import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAYLISTS_KEY = "hidden_tunes_playlists_v1";

export type PlaylistTrack = {
  id: string;
  title: string;
  artist?: string;
  user?: {
    name?: string;
  };
  channelTitle?: string;
  artwork?: string;
  cover?: any;
  thumbnail?: string;
  url?: string;
  streamUrl?: string;
  source?: string;
  sourceName?: string;
  type?: "local" | "audius" | "archive" | "youtube" | string;
  isOnline?: boolean;
  duration?: number | string;
  videoId?: string;
};

export type HiddenTunesPlaylist = {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  tracks: PlaylistTrack[];
};

function makeId() {
  return `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeTrackId(track: PlaylistTrack) {
  const raw =
    track.id ||
    track.videoId ||
    `${track.title || "track"}-${track.artist || track.channelTitle || "artist"}`;

  return String(raw).replace("youtube-", "").trim();
}

export function normalizePlaylistTrack(track: PlaylistTrack): PlaylistTrack {
  const artist =
    track.artist ||
    track.user?.name ||
    track.channelTitle ||
    track.sourceName ||
    "Unknown Artist";

  const image = track.cover || track.thumbnail || track.artwork || "";

  return {
    ...track,
    id: makeTrackId(track),
    title: track.title || "Unknown Song",
    artist,
    user: track.user || {
      name: artist,
    },
    channelTitle: track.channelTitle || artist,
    cover: image,
    thumbnail: track.thumbnail || image,
    artwork: track.artwork || image,
    sourceName: track.sourceName || track.source || "Hidden Tunes",
    isOnline: track.isOnline ?? true,
  };
}

function normalizePlaylist(playlist: HiddenTunesPlaylist): HiddenTunesPlaylist {
  return {
    ...playlist,
    tracks: Array.isArray(playlist.tracks)
      ? playlist.tracks.map(normalizePlaylistTrack)
      : [],
  };
}

export async function getPlaylists(): Promise<HiddenTunesPlaylist[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYLISTS_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizePlaylist);
  } catch (error) {
    console.log("Get playlists error:", error);
    return [];
  }
}

export async function savePlaylists(playlists: HiddenTunesPlaylist[]) {
  const normalized = playlists.map(normalizePlaylist);
  await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(normalized));
}

export async function createPlaylist(name: string, description = "") {
  const playlists = await getPlaylists();

  const newPlaylist: HiddenTunesPlaylist = {
    id: makeId(),
    name: name.trim() || "New Playlist",
    description,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tracks: [],
  };

  const updated = [newPlaylist, ...playlists];

  await savePlaylists(updated);

  return newPlaylist;
}

export async function deletePlaylist(playlistId: string) {
  const playlists = await getPlaylists();
  const updated = playlists.filter((playlist) => playlist.id !== playlistId);

  await savePlaylists(updated);

  return updated;
}

export async function addTrackToPlaylist(
  playlistId: string,
  track: PlaylistTrack
) {
  const playlists = await getPlaylists();
  const normalizedTrack = normalizePlaylistTrack(track);

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    const exists = playlist.tracks.some(
      (item) => makeTrackId(item) === normalizedTrack.id
    );

    if (exists) return playlist;

    return {
      ...playlist,
      updatedAt: Date.now(),
      tracks: [normalizedTrack, ...playlist.tracks],
    };
  });

  await savePlaylists(updated);

  return updated;
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string
) {
  const playlists = await getPlaylists();

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    return {
      ...playlist,
      updatedAt: Date.now(),
      tracks: playlist.tracks.filter(
        (track) => makeTrackId(track) !== String(trackId)
      ),
    };
  });

  await savePlaylists(updated);

  return updated;
}

export async function reorderPlaylistTracks(
  playlistId: string,
  fromIndex: number,
  toIndex: number
) {
  const playlists = await getPlaylists();

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    const tracks = [...playlist.tracks];

    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tracks.length ||
      toIndex >= tracks.length
    ) {
      return playlist;
    }

    const [movedTrack] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, movedTrack);

    return {
      ...playlist,
      updatedAt: Date.now(),
      tracks,
    };
  });

  await savePlaylists(updated);

  return updated;
}

export async function renamePlaylist(playlistId: string, name: string) {
  const playlists = await getPlaylists();

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    return {
      ...playlist,
      name: name.trim() || playlist.name,
      updatedAt: Date.now(),
    };
  });

  await savePlaylists(updated);

  return updated;
}

export async function getPlaylistById(playlistId: string) {
  const playlists = await getPlaylists();
  return playlists.find((playlist) => playlist.id === playlistId) || null;
}

export async function clearAllPlaylists() {
  await AsyncStorage.removeItem(PLAYLISTS_KEY);
}