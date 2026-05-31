import type { AppSong } from "../context/PlayerContext";
import { getHydratedCatalogSnapshot } from "../state/catalogFetchLayer";
import { getHydratedCatalogTrackOnce } from "../state/catalogHydrationCache";
import type { HiddenTunesTrack, Track } from "../types/music";
import { getArtworkValue } from "./artwork";
import { catalogSongToTrack } from "./worldCatalogAdapter";

export function appSongToTrack(song: AppSong): Track {
  const catalogHit = getHydratedCatalogSnapshot().find(
    (entry) => String(entry.id) === String(song.id)
  );

  if (catalogHit) {
    return catalogSongToTrack(catalogHit);
  }

  const candidate: HiddenTunesTrack & Record<string, unknown> = {
    id: String(song.id),
    title: song.title || "Unknown Track",
    artist:
      song.artist ||
      song.user?.name ||
      song.channelTitle ||
      "Unknown Artist",
    album: song.album,
    artwork: getArtworkValue(song) || "",
    source: "cloudflare",
    type: "song",
    isOnline: song.isOnline ?? true,
    streamUrl: song.streamUrl || song.audioUrl || song.url,
    url: song.url || song.streamUrl || song.audioUrl,
    thumbnail: song.thumbnail,
    mood: song.mood,
    genre: song.genre,
  };

  return getHydratedCatalogTrackOnce(candidate);
}

export function trackToAppSong(track: Track): AppSong {
  return {
    id: String(track.id),
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
    thumbnail: track.thumbnail,
    streamUrl: track.streamUrl,
    url: track.url || track.streamUrl,
    type: "r2",
    isOnline: track.isOnline,
    album: track.album,
  };
}
