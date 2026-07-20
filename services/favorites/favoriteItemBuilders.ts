import type { RadioStationListItem } from "../../types/radio";
import type { FavoriteItemMetadata, UnifiedFavoriteItem } from "../../types/favorites";
import { isMatureContentItem } from "../../types/matureContent";
import {
  isRadioFavoriteSource,
  normalizeRadioFavoriteStationId,
} from "./libraryFavoriteIdentity";

/** Local artwork pick — avoids importing RN artwork utils (keeps Node tests green). */
function resolveArtwork(source: unknown) {
  if (!source || typeof source !== "object") {
    return typeof source === "string" && source.trim() ? source.trim() : undefined;
  }
  const record = source as Record<string, unknown>;
  for (const key of [
    "artwork",
    "artworkUrl",
    "cover",
    "coverUrl",
    "thumbnail",
    "favicon",
    "uri",
  ]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function matureMetadata(item?: {
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: FavoriteItemMetadata["content_rating"];
}): FavoriteItemMetadata | undefined {
  if (!item || !isMatureContentItem(item)) return undefined;
  return {
    is_mature: true,
    mature_reason: item.mature_reason,
    content_rating: item.content_rating,
  };
}

function sanitizeYouTubeVideoId(value: unknown) {
  const text = String(value || "").replace("youtube-", "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  const match = text.match(/[a-zA-Z0-9_-]{11}/);
  return match ? match[0] : "";
}

type SongFavoriteSource = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  user?: { name?: string };
  channelTitle?: string;
  cover?: unknown;
  thumbnail?: unknown;
  artwork?: unknown;
  artworkUrl?: unknown;
  coverUrl?: unknown;
  videoId?: string;
  type?: string;
  source?: string;
  sourceName?: string;
  streamUrl?: string;
  url?: string;
  audioUrl?: string;
  duration?: number | string;
  artistId?: string;
  albumId?: string;
  genre?: string;
  country?: string;
  language?: string;
  is_mature?: boolean;
  mature_reason?: string;
  content_rating?: FavoriteItemMetadata["content_rating"];
};

export function buildSongFavoriteItem(song: SongFavoriteSource): UnifiedFavoriteItem {
  const record = song;

  // Live radio plays as AppSong (id radio-*, source radio, type live_stream).
  // MiniPlayer/Player hearts call this builder — never save Radio as a song.
  if (isRadioFavoriteSource(record)) {
    return buildRadioStationFavoriteItem({
      id: normalizeRadioFavoriteStationId(String(record.id || "")),
      title: record.title,
      name: record.title,
      artworkUrl: String(
        record.artworkUrl || record.coverUrl || record.artwork || record.cover || ""
      ),
      country: record.country,
      language: record.language,
      genre: record.genre,
      streamUrl: String(record.streamUrl || record.url || record.audioUrl || ""),
      is_mature: record.is_mature,
      mature_reason: record.mature_reason,
      content_rating: record.content_rating,
    });
  }

  const artist =
    record.artist ||
    record.user?.name ||
    record.channelTitle ||
    String((record as any).artistName || "Unknown Artist");

  const explicitYoutube =
    record.type === "youtube_video" ||
    record.source === "youtube" ||
    record.sourceName === "YouTube" ||
    Boolean(record.videoId);

  // Only mine videoId from the raw id when the item is already YouTube-owned.
  // Otherwise radio-/generic ids falsely match the 11-char YouTube pattern.
  const videoId = explicitYoutube
    ? sanitizeYouTubeVideoId(record.videoId || record.id)
    : sanitizeYouTubeVideoId(record.videoId);

  return {
    id: String(record.id || videoId || ""),
    type: "song",
    title: String(record.title || "Untitled"),
    subtitle: String(artist),
    artwork: resolveArtwork(record),
    source: explicitYoutube
      ? "youtube"
      : String(record.source || record.sourceName || "hidden_tunes"),
    addedAt: new Date().toISOString(),
    metadata: {
      artistName: String(artist),
      albumName: record.album ? String(record.album) : undefined,
      duration: record.duration,
      videoId: videoId || undefined,
      legacyType: record.type,
      sourceName: record.sourceName,
      streamUrl: String(record.streamUrl || record.url || record.audioUrl || ""),
      artistId: record.artistId,
      albumId: record.albumId,
    },
  };
}

export function buildArtistFavoriteItem(artist: {
  id: string;
  name?: string;
  title?: string;
  artwork?: string;
  cover?: string;
  thumbnail?: string;
  genre?: string;
}): UnifiedFavoriteItem {
  const title = String(artist.name || artist.title || "Unknown Artist");
  return {
    id: String(artist.id),
    type: "artist",
    title,
    subtitle: artist.genre ? String(artist.genre) : "Artist",
    artwork: resolveArtwork(artist),
    source: "hidden_tunes",
    addedAt: new Date().toISOString(),
    metadata: {
      artistName: title,
    },
  };
}

export function buildAlbumFavoriteItem(album: {
  id: string;
  title: string;
  artist?: string;
  artwork?: string;
  cover?: string;
  thumbnail?: string;
  artistId?: string;
}): UnifiedFavoriteItem {
  const artistName = String(album.artist || "Hidden Tunes");
  return {
    id: String(album.id),
    type: "album",
    title: String(album.title || "Unknown Album"),
    subtitle: artistName,
    artwork: resolveArtwork(album),
    source: "hidden_tunes",
    addedAt: new Date().toISOString(),
    metadata: {
      artistName,
      albumName: String(album.title || ""),
      artistId: album.artistId,
      albumId: String(album.id),
    },
  };
}

export function buildRadioStationFavoriteItem(
  station: RadioStationListItem | {
    id: string;
    title?: string;
    name?: string;
    artworkUrl?: string;
    favicon?: string;
    country?: string;
    language?: string;
    genre?: string;
    tags?: string[];
    streamUrl?: string;
    is_mature?: boolean;
    mature_reason?: string;
    content_rating?: FavoriteItemMetadata["content_rating"];
  }
): UnifiedFavoriteItem {
  const title = String(station.title || (station as { name?: string }).name || "Radio Station");
  const genre =
    station.genre ||
    (Array.isArray((station as RadioStationListItem).tags)
      ? (station as RadioStationListItem).tags[0]
      : undefined);
  const id = normalizeRadioFavoriteStationId(String(station.id || ""));

  return {
    id,
    type: "radio_station",
    title,
    subtitle: String(station.country || genre || "Live Radio"),
    artwork: resolveArtwork({
      artworkUrl: station.artworkUrl,
      favicon: (station as { favicon?: string }).favicon,
    }),
    source: "radio",
    addedAt: new Date().toISOString(),
    metadata: {
      stationCountry: station.country,
      stationLanguage: station.language,
      stationGenre: genre,
      streamUrl: (station as { streamUrl?: string }).streamUrl,
      legacyType: "live_stream",
      ...matureMetadata(station),
    },
  };
}
