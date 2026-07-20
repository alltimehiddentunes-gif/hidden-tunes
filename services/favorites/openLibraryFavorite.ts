/**
 * Library Favorites tap router — opens existing feature owners only.
 * Does not own playback; does not default to TV.
 */
import { router } from "expo-router";

import type { UnifiedFavoriteItem } from "../../types/favorites";
import { songFavoriteToAppSong } from "./unifiedFavorites";
import {
  normalizeRadioFavoriteStationId,
  resolveLibraryFavoriteOwner,
} from "./libraryFavoriteIdentity";

export type OpenLibraryFavoriteDeps = {
  playSong: (
    song: ReturnType<typeof songFavoriteToAppSong>,
    queue: ReturnType<typeof songFavoriteToAppSong>[],
    index: number,
    context: { source: string; label: string; artistName?: string }
  ) => void | Promise<void>;
  playRadioStation: (
    station: {
      id: string;
      title: string;
      streamUrl: string;
      artworkUrl?: string;
      country?: string;
      genre?: string;
      tags: string[];
      source: "radio";
    },
    options: {
      session: Array<{
        id: string;
        title: string;
        streamUrl: string;
        artworkUrl?: string;
        country?: string;
        genre?: string;
        tags: string[];
        source: "radio";
      }>;
      startIndex: number;
      label: string;
      cacheKey: string;
    }
  ) => void | Promise<void>;
  songFavoritesQueue: ReturnType<typeof songFavoriteToAppSong>[];
  radioFavorites: UnifiedFavoriteItem[];
  onUnsupported?: (item: UnifiedFavoriteItem) => void;
};

function sanitizeYouTubeVideoId(value: unknown) {
  const text = String(value || "").replace("youtube-", "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

function toRadioSessionStation(item: UnifiedFavoriteItem) {
  const id = normalizeRadioFavoriteStationId(item.id);
  return {
    id,
    title: item.title,
    streamUrl: String(item.metadata?.streamUrl || ""),
    artworkUrl: item.artwork,
    country: item.metadata?.stationCountry
      ? String(item.metadata.stationCountry)
      : undefined,
    genre: item.metadata?.stationGenre
      ? String(item.metadata.stationGenre)
      : undefined,
    tags: item.metadata?.stationGenre ? [String(item.metadata.stationGenre)] : [],
    source: "radio" as const,
  };
}

function openRadioFavorite(item: UnifiedFavoriteItem, deps: OpenLibraryFavoriteDeps) {
  const radioFavorites = deps.radioFavorites.length ? deps.radioFavorites : [item];
  const sessionStations = radioFavorites.map(toRadioSessionStation);
  const activeId = normalizeRadioFavoriteStationId(item.id);
  const active =
    sessionStations.find((entry) => entry.id === activeId) ||
    toRadioSessionStation(item);

  return deps.playRadioStation(active, {
    session: sessionStations,
    startIndex: Math.max(
      0,
      sessionStations.findIndex((entry) => entry.id === activeId)
    ),
    label: "Radio Favorites",
    cacheKey: "favorites",
  });
}

/**
 * Route a Library favorite to its existing owner.
 * Never falls through to TV for unknown or radio items.
 */
export function openLibraryFavorite(
  item: UnifiedFavoriteItem,
  deps: OpenLibraryFavoriteDeps
) {
  const owner = resolveLibraryFavoriteOwner(item);

  switch (owner) {
    case "radio":
      return openRadioFavorite(item, deps);
    case "youtube": {
      const videoId = sanitizeYouTubeVideoId(item.metadata?.videoId || item.id);
      if (!videoId) {
        deps.onUnsupported?.(item);
        return;
      }
      router.push({
        pathname: "/youtube-player",
        params: {
          videoId,
          title: item.title,
          channelTitle: item.subtitle || item.metadata?.artistName || "Unknown Artist",
          thumbnail: item.artwork || "",
        },
      } as any);
      return;
    }
    case "song": {
      const song = songFavoriteToAppSong(item);
      void deps.playSong(song, deps.songFavoritesQueue, 0, {
        source: "playlist",
        label: "Favorites",
        artistName: song.artist,
      });
      return;
    }
    case "artist":
      router.push({
        pathname: "/artist/[id]",
        params: { id: item.id },
      } as any);
      return;
    case "album":
      router.push({
        pathname: "/album/[id]",
        params: { id: item.id },
      } as any);
      return;
    default:
      deps.onUnsupported?.(item);
  }
}
