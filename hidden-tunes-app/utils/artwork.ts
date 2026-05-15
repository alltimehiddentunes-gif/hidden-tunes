export const FALLBACK_ARTWORK =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

const EMPTY_URL_VALUES = new Set(["", "null", "undefined", "[object object]"]);

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

export function normalizeArtworkUrl(
  value: unknown,
  fallback = FALLBACK_ARTWORK
) {
  if (!isHttpsArtworkUrl(value)) return fallback;
  return encodeURI(cleanArtworkString(String(value)));
}

export function getArtworkValue(item: any, fallback = FALLBACK_ARTWORK): any {
  if (!item) return fallback;

  if (typeof item === "string") {
    return normalizeArtworkUrl(item, fallback);
  }

  if (typeof item !== "object") {
    return item;
  }

  const candidates = [
    item.artwork,
    item.artworkUrl,
    item.artwork_url,
    item.cover,
    item.coverUrl,
    item.cover_url,
    item.image,
    item.imageUrl,
    item.image_url,
    item.thumbnail,
    item.albumCover,
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

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate === "string") {
      if (isHttpsArtworkUrl(candidate)) {
        return normalizeArtworkUrl(candidate, fallback);
      }

      continue;
    }

    return candidate;
  }

  return fallback;
}

export function getArtworkUri(item: any, fallback = FALLBACK_ARTWORK) {
  const artwork = getArtworkValue(item, fallback);
  return typeof artwork === "string" ? artwork : fallback;
}

export function getArtworkSource(item: any, fallback = FALLBACK_ARTWORK) {
  const artwork = getArtworkValue(item, fallback);
  return typeof artwork === "string" ? { uri: artwork } : artwork;
}
