import type { HiddenTunesPodcastEpisode, HiddenTunesPodcastShow } from "../podcastCatalogApi";
import type { RadioStationListItem } from "../../types/radio";
import type { FavoriteItemMetadata, UnifiedFavoriteItem } from "../../types/favorites";
import { isMatureContentItem } from "../../types/matureContent";
import { isMaturePodcastEpisode } from "../../utils/maturePodcastVisibility";
import { sanitizePodcastDiscoveryText } from "../../utils/openHiddenTunesPodcast";
import { getArtworkUri } from "../../utils/artwork";

function resolveArtwork(source: unknown) {
  const artwork = getArtworkUri(source as any);
  return artwork || undefined;
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
};

export function buildSongFavoriteItem(song: SongFavoriteSource): UnifiedFavoriteItem {
  const record = song;
  const artist =
    record.artist ||
    record.user?.name ||
    record.channelTitle ||
    String((record as any).artistName || "Unknown Artist");
  const videoId = sanitizeYouTubeVideoId(record.videoId || record.id);
  const isYoutube =
    record.type === "youtube_video" ||
    record.source === "youtube" ||
    record.sourceName === "YouTube" ||
    Boolean(record.videoId);

  return {
    id: String(record.id || videoId || ""),
    type: "song",
    title: String(record.title || "Untitled"),
    subtitle: String(artist),
    artwork: resolveArtwork(record),
    source: isYoutube ? "youtube" : String(record.source || record.sourceName || "hidden_tunes"),
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

  return {
    id: String(station.id),
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
      ...matureMetadata(station),
    },
  };
}

export function buildPodcastShowFavoriteItem(show: HiddenTunesPodcastShow): UnifiedFavoriteItem {
  return {
    id: String(show.id),
    type: "podcast_show",
    title: sanitizePodcastDiscoveryText(show.title) || show.title,
    subtitle: String(show.host_name || show.primary_category || "Podcast"),
    artwork: show.artwork_url,
    source: "podcast",
    addedAt: new Date().toISOString(),
    metadata: {
      podcastPublisher: show.host_name,
      ...matureMetadata(show),
    },
  };
}

export function buildPodcastEpisodeFavoriteItem(
  episode: HiddenTunesPodcastEpisode,
  options?: {
    showTitle?: string;
    showIsMature?: boolean;
    podcastFeedUrl?: string;
  }
): UnifiedFavoriteItem {
  const mature = isMaturePodcastEpisode(episode, options?.showIsMature);

  return {
    id: String(episode.id),
    type: "podcast_episode",
    title: sanitizePodcastDiscoveryText(episode.title) || episode.title,
    subtitle: options?.showTitle || "Podcast Episode",
    artwork: episode.artwork_url,
    source: "podcast",
    addedAt: new Date().toISOString(),
    metadata: {
      episodeDate: episode.published_at,
      duration: episode.duration_seconds,
      streamUrl: episode.audio_url,
      podcastFeedUrl: options?.podcastFeedUrl,
      showId: episode.show_id,
      showTitle: options?.showTitle,
      is_mature: mature || episode.is_mature,
      content_rating: episode.content_rating,
      mature_reason: episode.mature_reason,
    },
  };
}
