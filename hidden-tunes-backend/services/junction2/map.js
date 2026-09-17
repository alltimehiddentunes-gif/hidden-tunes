const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

function publicMediaUrl(publicBaseUrl, publicPlaybackId) {
  return `${String(publicBaseUrl).replace(/\/+$/, "")}/api/media/${encodeURIComponent(publicPlaybackId)}`;
}

export function toPublicSong(record, publicBaseUrl) {
  const streamUrl = publicMediaUrl(publicBaseUrl, record.publicPlaybackId);
  const duration = record.durationMs ? Math.round(record.durationMs / 1000) : 0;
  const artist = record.artist || "Unknown Artist";
  const album = record.album || "Singles";

  return {
    id: record.publicPlaybackId,
    title: record.title || "Untitled",
    slug: null,
    artist,
    artist_name: artist,
    artistId: null,
    artist_id: null,
    album,
    album_title: album,
    albumId: null,
    album_id: null,
    genre: null,
    mood: null,
    duration,
    duration_seconds: duration,
    url: streamUrl,
    audio_url: streamUrl,
    streamUrl,
    stream_url: streamUrl,
    artwork: FALLBACK_COVER,
    cover: FALLBACK_COVER,
    cover_url: FALLBACK_COVER,
    thumbnail: FALLBACK_COVER,
    sourceName: "Hidden Tunes",
    source_name: "Hidden Tunes",
    type: "r2",
    source_type: "r2",
    isOnline: true,
    is_online: true,
    is_public: true,
    created_at: new Date(record.createdAt || Date.now()).toISOString(),
    artists: null,
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
  const hitTitle = normalizeMatchText(hit.title);
  const hitArtist = normalizeMatchText(hit.artist || hit.artist_name);
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
