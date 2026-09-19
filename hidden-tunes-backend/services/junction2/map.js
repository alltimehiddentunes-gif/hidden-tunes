import { resolvePublicArtwork, fallbackCoverUrl } from "./metadata/artwork.js";

function publicMediaUrl(publicBaseUrl, publicPlaybackId) {
  return `${String(publicBaseUrl).replace(/\/+$/, "")}/api/media/${encodeURIComponent(publicPlaybackId)}`;
}

export function toPublicSong(record, publicBaseUrl) {
  const streamUrl = publicMediaUrl(publicBaseUrl, record.publicPlaybackId);
  // Unknown duration stays null — never coerce null→0 (false reject downstream).
  const duration =
    Number.isFinite(record.durationMs) && record.durationMs > 0
      ? Math.round(record.durationMs / 1000)
      : null;
  const artist = record.artist || "Unknown Artist";
  const title = record.title || "Untitled";
  const album = record.album || null;
  const art = resolvePublicArtwork(record, publicBaseUrl);
  const artists =
    Array.isArray(record.artists) && record.artists.length
      ? record.artists
      : [{ name: artist, role: "primary" }];

  return {
    id: record.publicPlaybackId,
    title,
    slug: null,
    artist,
    artist_name: artist,
    artists,
    artistId: record.artistId || null,
    artist_id: record.artistId || null,
    album: album,
    album_title: album,
    albumId: record.albumId || null,
    album_id: record.albumId || null,
    genre: record.genre || null,
    genres: record.genre ? [record.genre] : null,
    mood: null,
    duration,
    duration_seconds: duration,
    releaseDate: record.releaseDate || null,
    releaseYear: record.releaseYear || null,
    explicit: typeof record.explicit === "boolean" ? record.explicit : null,
    trackNumber: record.trackNumber || null,
    discNumber: record.discNumber || null,
    isrc: record.isrc || null,
    url: streamUrl,
    audio_url: streamUrl,
    streamUrl,
    stream_url: streamUrl,
    artwork: art.artwork,
    cover: art.cover,
    cover_url: art.cover_url,
    thumbnail: art.thumbnail,
    sourceName: "Hidden Tunes",
    source_name: "Hidden Tunes",
    type: "external",
    source_type: "external",
    isOnline: true,
    is_online: true,
    is_public: true,
    created_at: new Date(record.createdAt || Date.now()).toISOString(),
    albums: null,
  };
}

export function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isConservativeDuplicate(hit, localSong) {
  const hitTitle = normalizeMatchText(hit.title || hit.enrichment?.displayTitle);
  const hitArtist = normalizeMatchText(hit.artist || hit.artist_name || hit.enrichment?.primaryArtist);
  const localTitle = normalizeMatchText(localSong.title);
  const localArtist = normalizeMatchText(localSong.artist || localSong.artist_name);
  if (!hitTitle || !localTitle || hitTitle !== localTitle) return false;
  if (!hitArtist || !localArtist || hitArtist !== localArtist) return false;
  return true;
}

export function mergePreferLocal(localSongs, mappedSongs, limit) {
  const cap = Number.isFinite(Number(limit)) ? Number(limit) : localSongs.length + mappedSongs.length;
  const room = Math.max(0, cap - localSongs.length);
  if (room === 0) return localSongs.slice(0, cap);
  return [...localSongs, ...mappedSongs.slice(0, room)];
}

export { fallbackCoverUrl };
