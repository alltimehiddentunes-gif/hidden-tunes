import AsyncStorage from "@react-native-async-storage/async-storage";

import { getArtworkValue } from "../utils/artwork";

const RECENTLY_PLAYED_KEY = "hidden_tunes_recently_played";

export type RecentlyPlayedTrack = {
  id: string;
  title: string;
  artist?: string;
  channelTitle?: string;
  thumbnail?: string;
  cover?: any;
  artwork?: string;
  coverUrl?: string;
  cover_url?: string;
  artworkUrl?: string;
  artwork_url?: string;
  image?: any;
  imageUrl?: string;
  image_url?: string;
  albumCover?: string;
  album_cover?: string;
  streamUrl?: string;
  sourceName?: string;
  type?: "local" | "audius" | "archive" | "youtube";
  isOnline?: boolean;
  showId?: string;
  playedAt: number;
  playCount: number;
};

export async function loadRecentlyPlayed(): Promise<RecentlyPlayedTrack[]> {
  try {
    const saved = await AsyncStorage.getItem(RECENTLY_PLAYED_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecentlyPlayed(
  tracks: RecentlyPlayedTrack[]
) {
  await AsyncStorage.setItem(
    RECENTLY_PLAYED_KEY,
    JSON.stringify(tracks)
  );
}

export async function addToRecentlyPlayed(song: any) {
  if (!song?.id) return [];

  const current = await loadRecentlyPlayed();

  const existing = current.find(
    (item) => item.id === song.id
  );
  const artwork = getArtworkValue(song);
  const artworkUri = typeof artwork === "string" ? artwork : undefined;

  const normalized: RecentlyPlayedTrack = {
    id: song.id,
    title: song.title || "Unknown Title",

    artist:
      song.artist ||
      song.user?.name ||
      song.channelTitle ||
      "Unknown Artist",

    channelTitle: song.channelTitle,

    thumbnail: song.thumbnail || artworkUri,

    cover: song.cover || artwork,

    artwork: song.artwork || artworkUri,

    coverUrl: song.coverUrl || song.cover_url || artworkUri,

    cover_url: song.cover_url || song.coverUrl || artworkUri,

    artworkUrl: song.artworkUrl || song.artwork_url || artworkUri,

    artwork_url: song.artwork_url || song.artworkUrl || artworkUri,

    image: song.image || artwork,

    imageUrl: song.imageUrl || song.image_url || artworkUri,

    image_url: song.image_url || song.imageUrl || artworkUri,

    albumCover: song.albumCover || song.album_cover || artworkUri,

    album_cover: song.album_cover || song.albumCover || artworkUri,

    streamUrl: song.streamUrl,

    showId: typeof song.showId === "string" ? song.showId : undefined,

    sourceName: song.sourceName,

    type: song.type,

    isOnline: song.isOnline,

    playedAt: Date.now(),

    playCount: existing
      ? existing.playCount + 1
      : 1,
  };

  const updated = [
    normalized,
    ...current.filter(
      (item) => item.id !== song.id
    ),
  ].slice(0, 60);

  await saveRecentlyPlayed(updated);

  return updated;
}

export async function clearRecentlyPlayed() {
  await AsyncStorage.removeItem(
    RECENTLY_PLAYED_KEY
  );
}

export function getTopRecentlyPlayed(
  tracks: RecentlyPlayedTrack[],
  limit = 10
) {
  return [...tracks]
    .sort((a, b) => {
      if (b.playCount !== a.playCount) {
        return b.playCount - a.playCount;
      }

      return b.playedAt - a.playedAt;
    })
    .slice(0, limit);
}

export function buildRecommendationSeedFromRecent(
  tracks: RecentlyPlayedTrack[]
) {
  if (!tracks.length) {
    return "popular afrobeats songs";
  }

  const top = getTopRecentlyPlayed(
    tracks,
    5
  );

  const artists = top
    .map(
      (track) =>
        track.artist ||
        track.channelTitle
    )
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  const titles = top
    .map((track) => track.title)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  const seed = `${artists} ${titles}`.trim();

  return seed.length > 0
    ? `${seed} similar songs`
    : "popular afrobeats songs";
}
