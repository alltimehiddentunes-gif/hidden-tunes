import { Image } from "react-native";

const HIDDEN_TUNES_LOGO = require("../assets/images/logo.png");

export const FALLBACK_ARTWORK_ASSET = HIDDEN_TUNES_LOGO;
export const FALLBACK_ARTWORK = Image.resolveAssetSource(HIDDEN_TUNES_LOGO).uri;

const EMPTY_URL_VALUES = new Set(["", "null", "undefined", "[object object]"]);
const MAX_FAILED_ARTWORK_URLS = 512;
const failedArtworkUrls = new Set<string>();

function rememberFailedArtworkUrl(url: string) {
  if (!url || url === FALLBACK_ARTWORK) return;

  if (failedArtworkUrls.size >= MAX_FAILED_ARTWORK_URLS) {
    const oldest = failedArtworkUrls.values().next().value;
    if (oldest) failedArtworkUrls.delete(oldest);
  }

  failedArtworkUrls.add(url);
}

function cleanArtworkString(value: string) {
  return value.trim();
}

export function isHttpsArtworkUrl(value: unknown) {
  if (typeof value !== "string") return false;

  const clean = cleanArtworkString(value);
  if (EMPTY_URL_VALUES.has(clean.toLowerCase())) return false;

  try {
    const parsed = new URL(clean);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isRemoteArtworkUrl(value: unknown) {
  return isHttpsArtworkUrl(value);
}

export function normalizeArtworkUrl(
  value: unknown,
  fallback = FALLBACK_ARTWORK
) {
  if (!isHttpsArtworkUrl(value)) return fallback;

  const normalized = encodeURI(cleanArtworkString(String(value)));
  if (isArtworkUrlFailed(normalized)) return fallback;

  return normalized;
}

export function isArtworkUrlFailed(value: unknown) {
  if (typeof value !== "string") return false;

  const clean = cleanArtworkString(value);
  if (!clean) return false;

  return failedArtworkUrls.has(clean);
}

export function markArtworkUrlFailed(value: unknown) {
  if (typeof value !== "string") return;

  const clean = cleanArtworkString(value);
  if (!isHttpsArtworkUrl(clean)) return;

  rememberFailedArtworkUrl(clean);
}

function pushArtworkCandidate(candidates: any[], value: unknown) {
  if (!value) return;

  if (typeof value === "string") {
    if (isHttpsArtworkUrl(value) && !isArtworkUrlFailed(value)) {
      candidates.push(normalizeArtworkUrl(value));
    }
    return;
  }

  if (typeof value === "object") {
    candidates.push(value);
  }
}

function artworkCandidateKey(candidate: any) {
  if (typeof candidate === "string") return candidate;
  if (typeof candidate === "number") return String(candidate);

  try {
    return JSON.stringify(candidate);
  } catch {
    return String(candidate);
  }
}

export function getArtworkCandidates(item: any, fallback = FALLBACK_ARTWORK): any[] {
  const candidates: any[] = [];

  if (!item) return [fallback];

  if (Array.isArray(item)) {
    for (const entry of item) {
      getArtworkCandidates(entry, fallback).forEach((candidate) => {
        pushArtworkCandidate(candidates, candidate);
      });
    }
    const seen = new Set<string>();
    const unique = candidates.filter((candidate) => {
      const key = artworkCandidateKey(candidate);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.length ? unique : [fallback];
  }

  if (typeof item === "string") {
    pushArtworkCandidate(candidates, item);
    return candidates.length ? candidates : [fallback];
  }

  if (typeof item !== "object") {
    return [item];
  }

  const raw = item.raw && typeof item.raw === "object" ? item.raw : null;

  const rawCandidates = [
    item.artwork,
    item.artworkUrl,
    item.artwork_url,
    item.cover,
    item.coverUrl,
    item.cover_url,
    item.albumArt,
    item.album_art,
    item.albumArtwork,
    item.album_artwork,
    item.albumArtworkUrl,
    item.album_artwork_url,
    item.album_cover_url,
    item.album?.artwork,
    item.album?.artworkUrl,
    item.album?.artwork_url,
    item.album?.cover,
    item.album?.coverUrl,
    item.album?.cover_url,
    item.album?.image,
    item.album?.image_url,
    item.album?.thumbnail,
    item.artistArtwork,
    item.artist_artwork,
    item.artistArtworkUrl,
    item.artist_artwork_url,
    item.artist_image_url,
    item.artist?.artwork,
    item.artist?.artworkUrl,
    item.artist?.artwork_url,
    item.artist?.image,
    item.artist?.imageUrl,
    item.artist?.image_url,
    item.artist?.cover,
    item.artist?.thumbnail,
    item.genreArtwork,
    item.genreArtworkUrl,
    item.genre_artwork,
    item.genre_artwork_url,
    item.genre?.artwork,
    item.genre?.artworkUrl,
    item.genre?.artwork_url,
    item.moodArtwork,
    item.moodArtworkUrl,
    item.mood_artwork,
    item.mood_artwork_url,
    item.mood?.artwork,
    item.mood?.artworkUrl,
    item.mood?.artwork_url,
    item.image,
    item.imageUrl,
    item.image_url,
    item.thumbnail,
    item.thumbnailUrl,
    item.thumbnail_url,
    item.artistImage,
    item.artistArtwork,
    item.artist_artwork_image,
    item.albumCover,
    raw?.artwork,
    raw?.artworkUrl,
    raw?.artwork_url,
    raw?.cover,
    raw?.coverUrl,
    raw?.cover_url,
    raw?.image,
    raw?.imageUrl,
    raw?.image_url,
    raw?.thumbnail,
    raw?.thumbnailUrl,
    raw?.thumbnail_url,
    item.album_cover,
    item.albums?.artwork,
    item.albums?.artworkUrl,
    item.albums?.artwork_url,
    item.albums?.cover,
    item.albums?.coverUrl,
    item.albums?.cover_url,
    item.albums?.image,
    item.albums?.image_url,
    item.artists?.artwork,
    item.artists?.image,
    item.artists?.image_url,
    item.artists?.cover,
    item.artists?.thumbnail,
  ];

  rawCandidates.forEach((candidate) => pushArtworkCandidate(candidates, candidate));

  if (Array.isArray(item.songs)) {
    item.songs.slice(0, 6).forEach((song: unknown) => {
      getArtworkCandidates(song, fallback).forEach((candidate) => {
        pushArtworkCandidate(candidates, candidate);
      });
    });
  }

  if (Array.isArray(item.tracks)) {
    item.tracks.slice(0, 6).forEach((track: unknown) => {
      getArtworkCandidates(track, fallback).forEach((candidate) => {
        pushArtworkCandidate(candidates, candidate);
      });
    });
  }

  const primarySong = item.primarySong ?? item.primary_song;
  if (primarySong) {
    getArtworkCandidates(primarySong, fallback).forEach((candidate) => {
      pushArtworkCandidate(candidates, candidate);
    });
  }

  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    const key = artworkCandidateKey(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueCandidates.length ? uniqueCandidates : [fallback];
}

export function resolveArtwork(item: any, fallback = FALLBACK_ARTWORK) {
  const candidates = getArtworkCandidates(item, fallback);
  const value = candidates[0] || fallback;
  const source = value === fallback ? "fallback_logo" : "catalog";

  return {
    value,
    uri: typeof value === "string" ? value : fallback,
    source,
    candidates,
    hasArtwork: value !== fallback,
  };
}

export function getArtworkValue(item: any, fallback = FALLBACK_ARTWORK): any {
  return resolveArtwork(item, fallback).value;
}

export function getArtworkUri(item: any, fallback = FALLBACK_ARTWORK) {
  const artwork = getArtworkValue(item, fallback);
  return typeof artwork === "string" ? artwork : fallback;
}

export function getArtworkSource(item: any, fallback = FALLBACK_ARTWORK) {
  const artwork = getArtworkValue(item, fallback);
  return typeof artwork === "string" ? { uri: artwork } : artwork;
}

export function hasCatalogArtwork(
  value: unknown,
  fallback = FALLBACK_ARTWORK
): boolean {
  if (typeof value !== "string") return false;

  return (
    isHttpsArtworkUrl(value) &&
    value !== fallback &&
    !isArtworkUrlFailed(value)
  );
}

export function hasResolvableArtwork(
  item: any,
  fallback = FALLBACK_ARTWORK
): boolean {
  if (!item) return false;
  return resolveArtwork(item, fallback).hasArtwork;
}

export function pickBestArtworkSong<T extends Record<string, unknown>>(
  songs: T[] = []
): T | null {
  for (const song of songs) {
    if (hasResolvableArtwork(song)) return song;
  }
  return songs[0] || null;
}

export function resolveGroupArtworkSource(group: {
  title?: string;
  type?: string;
  artwork?: unknown;
  songs?: any[];
}) {
  const primarySong = pickBestArtworkSong(group.songs || []);
  if (primarySong) return primarySong;

  return {
    title: group.title,
    mood: group.title,
    type: group.type,
    artwork: group.artwork,
    songs: group.songs,
  };
}

export function pickBestArtworkFromSongs(
  songs: Array<{
    artwork?: unknown;
    cover?: unknown;
    thumbnail?: unknown;
  }>,
  fallback = FALLBACK_ARTWORK
): string {
  for (const song of songs) {
    const candidates = getArtworkCandidates(song, fallback);

    for (const candidate of candidates) {
      if (typeof candidate === "string" && hasCatalogArtwork(candidate, fallback)) {
        return candidate;
      }
    }
  }

  return fallback;
}

export function resolveEntityArtwork(
  entity: any,
  relatedSongs: Array<{
    album?: unknown;
    artist?: unknown;
    artwork?: unknown;
    cover?: unknown;
    thumbnail?: unknown;
  }> = [],
  fallback = FALLBACK_ARTWORK
) {
  const directCandidates = getArtworkCandidates(entity, fallback);

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && hasCatalogArtwork(candidate, fallback)) {
      return candidate;
    }
  }

  const entityAlbum = String(entity?.album || entity?.title || "")
    .trim()
    .toLowerCase();
  const entityArtist = String(entity?.artist || entity?.name || "")
    .trim()
    .toLowerCase();

  const scopedSongs = relatedSongs.filter((song) => {
    const songAlbum = String(song.album || "").trim().toLowerCase();
    const songArtist = String(song.artist || "").trim().toLowerCase();

    if (entityAlbum && songAlbum && songAlbum === entityAlbum) return true;
    if (entityArtist && songArtist && songArtist === entityArtist) return true;

    return false;
  });

  return pickBestArtworkFromSongs(
    scopedSongs.length ? scopedSongs : relatedSongs,
    fallback
  );
}
