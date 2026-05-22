import type { AppSong } from "../context/PlayerContext";
import { getArtworkUri } from "../utils/artwork";

export type RemoteMediaHandlers = {
  onPlay: () => void | Promise<void>;
  onPause: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onPrevious: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
};

export type RemoteMediaSessionSnapshot = {
  song: AppSong | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMillis: number;
  durationMillis: number;
};

export function buildRemoteMediaMetadata(
  song: AppSong | null,
  positionMillis: number,
  durationMillis: number
) {
  if (!song) return null;

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
