import type { AppSong } from "../context/PlayerContext";
import {
  isPodcastEpisodeSong,
  isRadioStreamSong,
} from "./playbackSongIdentity";

export type PlaybackSurfaceMode = "music" | "podcast" | "radio";

function isLectureQueueSong(song?: AppSong | null) {
  if (!song) return false;
  if (song.source === "lecture" || song.type === "lecture") return true;
  return String(song.id || "").startsWith("lecture");
}

export function getPlaybackSurfaceMode(song?: AppSong | null): PlaybackSurfaceMode {
  if (isRadioStreamSong(song)) return "radio";
  // Lectures share the bounded podcast-style queue (no smart music autoplay extend).
  if (isPodcastEpisodeSong(song) || isLectureQueueSong(song)) return "podcast";
  return "music";
}

export function isBoundedQueuePlayback(song?: AppSong | null) {
  return getPlaybackSurfaceMode(song) !== "music";
}
