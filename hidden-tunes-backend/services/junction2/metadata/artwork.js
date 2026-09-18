/**
 * Artwork priority for public presentation:
 * 1. existing Hidden Tunes catalog artwork (local catalog songs)
 * 2. verified matched release artwork (opaque proxy)
 * 3. verified recording artwork (opaque proxy)
 * 4. source media thumbnail (opaque proxy)
 * 5. Hidden Tunes fallback
 *
 * Public client receives ONLY HT-owned artwork URLs.
 */

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

export function resolvePublicArtwork(record, publicBaseUrl) {
  const base = String(publicBaseUrl || "").replace(/\/+$/, "");
  const opaque = record?.publicPlaybackId
    ? `${base}/api/artwork/${encodeURIComponent(record.publicPlaybackId)}`
    : null;

  // Prefer opaque proxy whenever we have a trusted internal artwork reference.
  if (opaque && record?.albumArtworkUrl) {
    return {
      artwork: opaque,
      cover: opaque,
      cover_url: opaque,
      thumbnail: opaque,
      artworkKind: "RELEASE_ARTWORK",
      artworkProvenance: record.artworkProvenance || "RELEASE_ARTWORK",
      fallbackArtwork: FALLBACK_COVER,
    };
  }

  if (opaque && (record?.mediaThumbnailUrl || record?.provider === "youtube")) {
    return {
      artwork: opaque,
      cover: opaque,
      cover_url: opaque,
      thumbnail: opaque,
      artworkKind: "MEDIA_THUMBNAIL",
      artworkProvenance: record?.mediaThumbnailUrl ? "MEDIA_THUMBNAIL" : "MEDIA_THUMBNAIL",
      fallbackArtwork: FALLBACK_COVER,
    };
  }

  if (opaque) {
    // External opaque ids should never fall through to a third-party host in the public object.
    return {
      artwork: opaque,
      cover: opaque,
      cover_url: opaque,
      thumbnail: opaque,
      artworkKind: "FALLBACK",
      artworkProvenance: "FALLBACK",
      fallbackArtwork: FALLBACK_COVER,
    };
  }

  // Catalog/R2 hosts may appear directly when already HT-owned.
  const catalogArt = sanitizeAllowedArtwork(record?.catalogArtworkUrl, publicBaseUrl);
  if (catalogArt) {
    return {
      artwork: catalogArt,
      cover: catalogArt,
      cover_url: catalogArt,
      thumbnail: catalogArt,
      artworkKind: "CATALOG_ARTWORK",
      artworkProvenance: "CATALOG_ARTWORK",
      fallbackArtwork: FALLBACK_COVER,
    };
  }

  return {
    artwork: FALLBACK_COVER,
    cover: FALLBACK_COVER,
    cover_url: FALLBACK_COVER,
    thumbnail: FALLBACK_COVER,
    artworkKind: "FALLBACK",
    artworkProvenance: "FALLBACK",
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
    h === "images.unsplash.com" ||
    h === "coverartarchive.org" ||
    h.endsWith(".coverartarchive.org") ||
    h === "archive.org" ||
    h.endsWith(".archive.org") ||
    h.endsWith(".archive.org") ||
    /^ia\d+\.us\.archive\.org$/.test(h)
  );
}
