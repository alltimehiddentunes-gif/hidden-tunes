import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import { getHydratedCatalogTrackOnce } from "../state/catalogHydrationCache";
import type { HiddenTunesTrack, Track } from "../types/music";

function catalogSongToHiddenTunesTrack(
  song: HiddenTunesNormalizedSong
): HiddenTunesTrack & Record<string, unknown> {
  const raw = (song.raw ?? {}) as Record<string, unknown>;

  return {
    id: String(song.id),
    title: song.title || "Unknown Track",
    artist: song.artist || "Unknown Artist",
    album: song.album,
    artwork: song.artwork || song.cover || song.thumbnail || "",
    duration: song.duration ? String(song.duration) : undefined,
    source: "cloudflare",
    type: "song",
    isOnline: song.isOnline ?? true,
    streamUrl: song.streamUrl,
    url: song.url,
    thumbnail: song.thumbnail || song.cover,
    ...raw,
  };
}

export function catalogSongToTrack(song: HiddenTunesNormalizedSong): Track {
  return getHydratedCatalogTrackOnce(catalogSongToHiddenTunesTrack(song));
}

export function catalogSongsToTracks(songs: HiddenTunesNormalizedSong[]): Track[] {
  return songs.map(catalogSongToTrack);
}
