import type { AppSong } from "../context/PlayerContext";
import { FALLBACK_ARTWORK, getArtworkUri } from "../utils/artwork";

export type RemoteMediaHandlers = {
  onPlay: () => void | Promise<void>;
  onPause: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onPrevious: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
};

/** Owner-agnostic presented item (TV live, etc.). */
export type RemoteMediaPresentedItem = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUri?: string;
  isLive?: boolean;
};

export type RemoteMediaSessionSnapshot = {
  song: AppSong | null;
  presented?: RemoteMediaPresentedItem | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMillis: number;
  durationMillis: number;
};

export function buildRemoteMediaMetadata(
  song: AppSong | null,
  positionMillis: number,
  durationMillis: number,
  presented?: RemoteMediaPresentedItem | null
) {
  if (presented) {
    return {
      title: presented.title || "Live TV",
      artist: String(presented.artist || "Hidden Tunes TV"),
      album: String(presented.album || "Hidden Tunes TV"),
      artwork: {
        uri: presented.artworkUri || FALLBACK_ARTWORK,
      },
      // Live TV: never invent duration / elapsed from prior music sessions.
      duration: 0,
      elapsedTime: 0,
    };
  }

  if (!song) return null;

  const matureScope = String(song.matureScope || "").toLowerCase();
  if (matureScope && matureScope !== "safe" && matureScope !== "general_only") {
    return {
      title: "Private podcast playing",
      artist: "Hidden Tunes",
      album: "Hidden Tunes",
      artwork: { uri: FALLBACK_ARTWORK },
      duration: Math.max(0, Math.round(durationMillis / 1000)),
      elapsedTime: Math.max(0, Math.round(positionMillis / 1000)),
    };
  }

  const artist =
    song.artist ||
    song.channelTitle ||
    (typeof song.user === "object" && song.user?.name) ||
    "Unknown Artist";
  const title = song.title || "Unknown Track";
  const album = song.album || song.sourceName || "Hidden Tunes";

  return {
    title,
    artist: String(artist),
    album: String(album),
    artwork: { uri: getArtworkUri(song) },
    duration: Math.max(0, Math.round(durationMillis / 1000)),
    elapsedTime: Math.max(0, Math.round(positionMillis / 1000)),
  };
}
