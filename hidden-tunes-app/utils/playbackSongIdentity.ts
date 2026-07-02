import type { AppSong } from "../context/PlayerContext";

export function isPodcastEpisodeSong(song?: AppSong | null) {
  return song?.source === "podcast" || song?.type === "podcast";
}

export function isRadioStreamSong(song?: AppSong | null) {
  return song?.source === "radio" || song?.type === "live_stream";
}
