import type { AppSong } from "../context/PlayerContext";
import {
  isPodcastEpisodeSong,
  isRadioStreamSong,
} from "../services/playback/playbackRouter";

export type PlaybackSurfaceMode = "music" | "podcast" | "radio";

export function getPlaybackSurfaceMode(song?: AppSong | null): PlaybackSurfaceMode {
  if (isRadioStreamSong(song)) return "radio";
  if (isPodcastEpisodeSong(song)) return "podcast";
  return "music";
}

export function isBoundedQueuePlayback(song?: AppSong | null) {
  return getPlaybackSurfaceMode(song) !== "music";
}
