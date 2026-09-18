/**
 * Artwork priority for public presentation:
 * 1. Existing catalog artwork (handled by preferring local catalog songs)
 * 2. Verified album/single artwork (allowed hosts only)
 * 3. Provider media thumbnail via opaque Hidden Tunes artwork proxy
 * 4. Controlled fallback
 *
 * Never emit ytimg/youtube hosts in public JSON.
 */

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

export function resolvePublicArtwork(record, publicBaseUrl) {
  const base = String(publicBaseUrl || "").replace(/\/+$/, "");
  const opaque = record?.publicPlaybackId
    ? `${base}/api/artwork/${encodeURIComponent(record.publicPlaybackId)}`
    : null;

  const albumArt = sanitizeAllowedArtwork(record?.albumArtworkUrl, publicBaseUrl);
  if (albumArt) {
    return {
      artwork: albumArt,
      cover: albumArt,
      cover_url: albumArt,
      thumbnail: albumArt,
      artworkKind: "albumArtwork",
      fallbackArtwork: FALLBACK_COVER,
    };
  }

  if (opaque && (record?.mediaThumbnailUrl || record?.provider === "youtube")) {
    return {
      artwork: opaque,
      cover: opaque,
      cover_url: opaque,
      thumbnail: opaque,
      artworkKind: "mediaThumbnail",
      fallbackArtwork: FALLBACK_COVER,
    };
  }

  return {
    artwork: FALLBACK_COVER,
    cover: FALLBACK_COVER,
    cover_url: FALLBACK_COVER,
    thumbnail: FALLBACK_COVER,
    artworkKind: "fallbackArtwork",
    fallbackArtwork: FALLBACK_COVER,
  };
}

function sanitizeAllowedArtwork(url, publicBaseUrl) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.host.toLowerCase();
    const allowed = new Set(["images.unsplash.com"]);
    try {
      if (publicBaseUrl) allowed.add(new URL(publicBaseUrl).host.toLowerCase());
    } catch {
      /* ignore */
    }
    const r2 =
      process.env.PUBLIC_R2_BASE_URL ||
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.R2_PUBLIC_URL ||
      "";
    if (r2) {
      try {
        allowed.add(new URL(r2).host.toLowerCase());
      } catch {
        /* ignore */
      }
    }
    if (!allowed.has(host)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function fallbackCoverUrl() {
  return FALLBACK_COVER;
}

/** Hosts permitted for server-side artwork fetch (internal proxy only). */
export function isAllowedUpstreamArtworkHost(host) {
  const h = String(host || "").toLowerCase();
  return (
    h === "i.ytimg.com" ||
    h === "img.youtube.com" ||
    h.endsWith(".ytimg.com") ||
    h === "images.unsplash.com"
  );
}
