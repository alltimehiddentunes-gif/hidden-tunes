import type { AndroidAutoBrowseItem, AndroidAutoTrackPayload } from "./androidAutoCatalogSync";

export type CarPlayArtworkFallback =
  | "music" | "artist" | "album" | "playlist" | "radio" | "podcast" | "audiobook" | "Hidden Tunes";
export type CarPlayArtworkDescriptor = {
  source: string;
  fallbackKey: CarPlayArtworkFallback;
  cacheIdentity: string;
  role: "row" | "folder" | "now-playing";
  sizeClass?: "small" | "medium";
};

export const CARPLAY_NATIVE_ARTWORK_ENABLED = false;

export function sanitizeCarPlayText(value: unknown, maxLength = 120) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text || /^(?:https?|javascript|data):/i.test(text)) return "";
  return text.replace(/\s*[•·|]+\s*/g, " • ").replace(/(?:\s*•\s*){2,}/g, " • ")
    .replace(/\s+/g, " ").replace(/^\s*•|•\s*$/g, "").trim().slice(0, maxLength);
}

export function formatCarPlaySubtitle(primary: unknown, parts: unknown[]) {
  const title = sanitizeCarPlayText(primary).toLowerCase();
  const seen = new Set<string>();
  return parts.map((part) => sanitizeCarPlayText(part, 80)).filter((part) => {
    const key = part.toLowerCase();
    if (!key || key === title || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 2).join(" • ").slice(0, 120);
}

export function artworkDescriptor(
  source: unknown,
  fallbackKey: CarPlayArtworkFallback,
  role: CarPlayArtworkDescriptor["role"],
  sizeClass?: CarPlayArtworkDescriptor["sizeClass"]
): CarPlayArtworkDescriptor | null {
  const cleanSource = String(source || "").trim().slice(0, 500);
  if (cleanSource && !/^https:\/\//i.test(cleanSource) && !/^asset:[a-z0-9/_-]+$/i.test(cleanSource)) return null;
  const resolvedSource = cleanSource || `asset:fallback/${fallbackKey.toLowerCase().replace(/\s+/g, "-")}`;
  return { source: resolvedSource, fallbackKey,
    cacheIdentity: `${fallbackKey}:${resolvedSource}`.slice(0, 560), role, ...(sizeClass ? { sizeClass } : {}) };
}

export function dedupeCarPlayRows<T extends AndroidAutoBrowseItem>(rows: T[]): T[] {
  const seen = new Set<string>();
  const playable = rows.filter((row) => row.playable);
  const source = playable.length ? rows.filter((row) => !String(row.mediaId).startsWith("empty:"))
    : rows.filter((row, index) => !String(row.mediaId).startsWith("empty:") || index === rows.findIndex(
      (candidate) => String(candidate.mediaId).startsWith("empty:")
    ));
  return source.filter((row) => {
    const id = String(row.mediaId || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id); return true;
  });
}

export function withCarPlayArtworkDescriptor(track: AndroidAutoTrackPayload) {
  const raw = track as AndroidAutoTrackPayload & Record<string, unknown>;
  const content = String(track.contentType || "music").toLowerCase();
  const fallback: CarPlayArtworkFallback = content === "radio" ? "radio"
    : content === "podcast" ? "podcast" : content === "audiobook" ? "audiobook" : "music";
  return { ...track, artworkDescriptor: artworkDescriptor(track.artworkUrl, fallback, "row", "small"),
    artworkCapabilityEnabled: CARPLAY_NATIVE_ARTWORK_ENABLED, artworkCacheIdentity: artworkDescriptor(
      track.artworkUrl, fallback, "row", "small"
    )?.cacheIdentity || `fallback:${fallback}`, collection: sanitizeCarPlayText(raw.collection, 160) };
}
