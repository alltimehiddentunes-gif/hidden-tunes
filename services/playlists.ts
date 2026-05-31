import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HiddenTunesNormalizedSong } from "./hiddenTunesApi";

const PLAYLISTS_KEY = "hidden_tunes_user_playlists_v2";

export type UserPlaylist = {
  id: string;
  title: string;
  description?: string;
  artwork?: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
  tracks: HiddenTunesNormalizedSong[];
};

export type SmartPlaylist = UserPlaylist & {
  smartType:
    | "recently-added"
    | "afrobeat"
    | "emotional"
    | "artist"
    | "mood"
    | "genre";
  isSmart: true;
};

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeId(title: string) {
  const base = slugify(title || "playlist");
  return `${base || "playlist"}-${Date.now()}`;
}

function getSongId(song: any) {
  return String(
    song?.id ||
      song?.videoId ||
      `${song?.title || "song"}-${song?.artist || "artist"}`
  )
    .replace("youtube-", "")
    .trim();
}

function normalizePlaylistSong(song: any): HiddenTunesNormalizedSong {
  const artwork =
    song?.artwork || song?.cover || song?.thumbnail || song?.artworkUrl || undefined;

  const streamUrl = song?.streamUrl || song?.url || song?.audioUrl || "";

  return {
    ...song,
    id: getSongId(song),
    title: song?.title || "Unknown Song",
    artist:
      song?.artist ||
      song?.user?.name ||
      song?.channelTitle ||
      song?.sourceName ||
      "Hidden Tunes",
    artistId: song?.artistId,
    album: song?.album || "Singles",
    albumId: song?.albumId,
    genre: song?.genre || "Hidden Tunes",
    mood: song?.mood,
    artwork,
    cover: artwork,
    url: song?.url || streamUrl,
    streamUrl,
    duration:
      typeof song?.duration === "number"
        ? song.duration
        : typeof song?.duration === "string" && Number.isFinite(Number(song.duration))
        ? Number(song.duration)
        : undefined,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
  };
}

function buildArtwork(tracks: HiddenTunesNormalizedSong[]) {
  return tracks.find((track) => track.artwork || track.cover)?.artwork;
}

function hydratePlaylist(playlist: any): UserPlaylist {
  const tracks = Array.isArray(playlist?.tracks)
    ? playlist.tracks.map(normalizePlaylistSong)
    : [];

  const now = new Date().toISOString();

  return {
    id: String(playlist?.id || makeId(playlist?.title || playlist?.name || "playlist")),
    title: String(playlist?.title || playlist?.name || "Untitled Playlist"),
    description: playlist?.description,
    artwork: playlist?.artwork || buildArtwork(tracks),
    createdAt: String(playlist?.createdAt || now),
    updatedAt: String(playlist?.updatedAt || now),
    trackCount: tracks.length,
    tracks,
  };
}

function sortPlaylists(playlists: UserPlaylist[]) {
  return [...playlists].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function uniqueTracks(tracks: HiddenTunesNormalizedSong[]) {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    const id = getSongId(track);

    if (seen.has(id)) return false;

    seen.add(id);
    return true;
  });
}

function makeSmartPlaylist({
  id,
  title,
  description,
  tracks,
  smartType,
}: {
  id: string;
  title: string;
  description: string;
  tracks: HiddenTunesNormalizedSong[];
  smartType: SmartPlaylist["smartType"];
}): SmartPlaylist | null {
  const cleanTracks = uniqueTracks(tracks.map(normalizePlaylistSong));

  if (cleanTracks.length === 0) return null;

  const now = new Date().toISOString();

  return {
    id,
    title,
    description,
    artwork: buildArtwork(cleanTracks),
    createdAt: now,
    updatedAt: now,
    trackCount: cleanTracks.length,
    tracks: cleanTracks,
    smartType,
    isSmart: true,
  };
}

async function savePlaylists(playlists: UserPlaylist[]) {
  const hydrated = sortPlaylists(playlists.map(hydratePlaylist));
  await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(hydrated));
  return hydrated;
}

export async function getUserPlaylists(): Promise<UserPlaylist[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortPlaylists(parsed.map(hydratePlaylist));
  } catch (error) {
    console.log("Get playlists error:", error);
    return [];
  }
}

export async function createUserPlaylist(title: string, description?: string) {
  const playlists = await getUserPlaylists();

  const cleanTitle = title.trim() || "New Playlist";
  const now = new Date().toISOString();

  const playlist: UserPlaylist = {
    id: makeId(cleanTitle),
    title: cleanTitle,
    description: description?.trim() || undefined,
    artwork: undefined,
    createdAt: now,
    updatedAt: now,
    trackCount: 0,
    tracks: [],
  };

  await savePlaylists([playlist, ...playlists]);

  return playlist;
}

export async function deleteUserPlaylist(playlistId: string) {
  const playlists = await getUserPlaylists();
  const updated = playlists.filter((playlist) => playlist.id !== playlistId);

  return await savePlaylists(updated);
}

export async function addSongToPlaylist(
  playlistId: string,
  song: HiddenTunesNormalizedSong
) {
  const playlists = await getUserPlaylists();
  const normalizedSong = normalizePlaylistSong(song);
  const now = new Date().toISOString();

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    const alreadyExists = playlist.tracks.some(
      (track) => getSongId(track) === getSongId(normalizedSong)
    );

    if (alreadyExists) {
      return {
        ...playlist,
        updatedAt: now,
      };
    }

    const tracks = [normalizedSong, ...playlist.tracks];

    return hydratePlaylist({
      ...playlist,
      artwork: playlist.artwork || normalizedSong.artwork,
      updatedAt: now,
      tracks,
    });
  });

  return await savePlaylists(updated);
}

export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string
) {
  const playlists = await getUserPlaylists();
  const now = new Date().toISOString();

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    const tracks = playlist.tracks.filter(
      (track) => getSongId(track) !== String(songId).replace("youtube-", "").trim()
    );

    return hydratePlaylist({
      ...playlist,
      artwork: buildArtwork(tracks),
      updatedAt: now,
      tracks,
    });
  });

  return await savePlaylists(updated);
}

export async function getUserPlaylistById(playlistId: string) {
  const playlists = await getUserPlaylists();
  return playlists.find((playlist) => playlist.id === playlistId) || null;
}

export async function renameUserPlaylist(playlistId: string, title: string) {
  const playlists = await getUserPlaylists();
  const cleanTitle = title.trim();

  if (!cleanTitle) return playlists;

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    return hydratePlaylist({
      ...playlist,
      title: cleanTitle,
      updatedAt: new Date().toISOString(),
    });
  });

  return await savePlaylists(updated);
}

export async function updateUserPlaylistDescription(
  playlistId: string,
  description: string
) {
  const playlists = await getUserPlaylists();

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    return hydratePlaylist({
      ...playlist,
      description: description.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
  });

  return await savePlaylists(updated);
}

export async function clearUserPlaylist(playlistId: string) {
  const playlists = await getUserPlaylists();

  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    return hydratePlaylist({
      ...playlist,
      artwork: undefined,
      updatedAt: new Date().toISOString(),
      tracks: [],
    });
  });

  return await savePlaylists(updated);
}

export async function isSongInPlaylist(playlistId: string, songId: string) {
  const playlist = await getUserPlaylistById(playlistId);
  if (!playlist) return false;

  return playlist.tracks.some((track) => getSongId(track) === getSongId({ id: songId }));
}

export async function searchUserPlaylists(query: string) {
  const playlists = await getUserPlaylists();
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) return playlists;

  return playlists.filter((playlist) => {
    const titleMatch = playlist.title.toLowerCase().includes(cleanQuery);
    const descriptionMatch =
      playlist.description?.toLowerCase().includes(cleanQuery) || false;

    const trackMatch = playlist.tracks.some((track) => {
      return (
        track.title.toLowerCase().includes(cleanQuery) ||
        track.artist.toLowerCase().includes(cleanQuery) ||
        track.album?.toLowerCase().includes(cleanQuery)
      );
    });

    return titleMatch || descriptionMatch || trackMatch;
  });
}

export function generateSmartPlaylists(
  songs: HiddenTunesNormalizedSong[] = [],
  userPlaylists: UserPlaylist[] = []
): SmartPlaylist[] {
  const normalizedSongs = uniqueTracks(songs.map(normalizePlaylistSong));

  const playlistTracks = uniqueTracks(
    userPlaylists.flatMap((playlist) => playlist.tracks).map(normalizePlaylistSong)
  );

  const fullCatalog = uniqueTracks([...normalizedSongs, ...playlistTracks]);

  const smartPlaylists: SmartPlaylist[] = [];

  const recentlyAdded = makeSmartPlaylist({
    id: "smart-recently-added",
    title: "Recently Added",
    description: "Fresh songs from your Hidden Tunes catalog.",
    tracks: fullCatalog.slice(0, 25),
    smartType: "recently-added",
  });

  if (recentlyAdded) smartPlaylists.push(recentlyAdded);

  const afrobeat = makeSmartPlaylist({
    id: "smart-afrobeats-mix",
    title: "Afrobeats Mix",
    description: "Afrobeats, Afro-fusion and African sounds.",
    tracks: fullCatalog.filter((song) => {
      const text = `${song.genre || ""} ${song.mood || ""} ${song.title || ""} ${
        song.album || ""
      }`.toLowerCase();

      return text.includes("afro") || text.includes("amapiano");
    }),
    smartType: "afrobeat",
  });

  if (afrobeat) smartPlaylists.push(afrobeat);

  const emotional = makeSmartPlaylist({
    id: "smart-emotional-mix",
    title: "Emotional Mix",
    description: "Deep, soulful and late-night songs.",
    tracks: fullCatalog.filter((song) => {
      const text = `${song.genre || ""} ${song.mood || ""} ${song.title || ""} ${
        song.album || ""
      }`.toLowerCase();

      return (
        text.includes("emotional") ||
        text.includes("soul") ||
        text.includes("sad") ||
        text.includes("love") ||
        text.includes("lonely")
      );
    }),
    smartType: "emotional",
  });

  if (emotional) smartPlaylists.push(emotional);

  const artistGroups = new Map<string, HiddenTunesNormalizedSong[]>();

  fullCatalog.forEach((song) => {
    const artist = song.artist || "Hidden Tunes";

    if (!artistGroups.has(artist)) {
      artistGroups.set(artist, []);
    }

    artistGroups.get(artist)?.push(song);
  });

  const topArtist = Array.from(artistGroups.entries())
    .filter(([, tracks]) => tracks.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)[0];

  if (topArtist) {
    const [artist, tracks] = topArtist;

    const artistMix = makeSmartPlaylist({
      id: `smart-artist-${slugify(artist)}`,
      title: `${artist} Mix`,
      description: `A focused playlist built around ${artist}.`,
      tracks,
      smartType: "artist",
    });

    if (artistMix) smartPlaylists.push(artistMix);
  }

  const genreGroups = new Map<string, HiddenTunesNormalizedSong[]>();

  fullCatalog.forEach((song) => {
    const genre = song.genre || "Hidden Tunes";

    if (!genreGroups.has(genre)) {
      genreGroups.set(genre, []);
    }

    genreGroups.get(genre)?.push(song);
  });

  const topGenre = Array.from(genreGroups.entries())
    .filter(([genre, tracks]) => genre !== "Hidden Tunes" && tracks.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)[0];

  if (topGenre) {
    const [genre, tracks] = topGenre;

    const genreMix = makeSmartPlaylist({
      id: `smart-genre-${slugify(genre)}`,
      title: `${genre} Mix`,
      description: `A smart mix based on your ${genre} songs.`,
      tracks,
      smartType: "genre",
    });

    if (genreMix) smartPlaylists.push(genreMix);
  }

  const moodGroups = new Map<string, HiddenTunesNormalizedSong[]>();

  fullCatalog.forEach((song) => {
    if (!song.mood) return;

    if (!moodGroups.has(song.mood)) {
      moodGroups.set(song.mood, []);
    }

    moodGroups.get(song.mood)?.push(song);
  });

  const topMood = Array.from(moodGroups.entries())
    .filter(([, tracks]) => tracks.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)[0];

  if (topMood) {
    const [mood, tracks] = topMood;

    const moodMix = makeSmartPlaylist({
      id: `smart-mood-${slugify(mood)}`,
      title: `${mood} Mix`,
      description: `A smart mix for your ${mood} mood.`,
      tracks,
      smartType: "mood",
    });

    if (moodMix) smartPlaylists.push(moodMix);
  }

  return smartPlaylists;
}