/**
 * Library favorites identity helpers — classify and key saved items without
 * owning playback. Compound keys use favoriteStorageKey(type, id).
 */
import type { FavoriteItemType, UnifiedFavoriteItem } from "../../types/favorites";
import { favoriteStorageKey } from "../../types/favorites";

export const LIBRARY_FAVORITES_SCHEMA_VERSION = 2;
export const LIBRARY_FAVORITES_SCHEMA_VERSION_KEY =
  "hidden_tunes_library_favorites_schema_version";

/** Strip live-radio AppSong prefix so card + player hearts share one key. */
export function normalizeRadioFavoriteStationId(id: string) {
  return String(id || "")
    .trim()
    .replace(/^radio-/i, "");
}

export function isRadioFavoriteSource(source: {
  id?: string;
  source?: string;
  type?: string;
  sourceName?: string;
}) {
  if (String(source.source || "").toLowerCase() === "radio") return true;
  if (String(source.type || "").toLowerCase() === "live_stream") return true;
  if (String(source.id || "").toLowerCase().startsWith("radio-")) return true;
  return false;
}

export function looksLikeMisclassifiedRadioFavorite(item: UnifiedFavoriteItem) {
  if (item.type === "radio_station") return false;
  if (item.type !== "song") return false;

  if (String(item.source || "").toLowerCase() === "radio") return true;
  if (String(item.metadata?.legacyType || "").toLowerCase() === "live_stream") {
    return true;
  }
  if (String(item.id || "").toLowerCase().startsWith("radio-")) return true;

  // False YouTube id mined from "radio-…" AppSong ids (11-char regex match).
  const videoId = String(item.metadata?.videoId || "");
  if (videoId.toLowerCase().startsWith("radio")) return true;

  const streamUrl = String(item.metadata?.streamUrl || "");
  if (
    streamUrl &&
    (item.metadata?.stationCountry || item.metadata?.stationGenre) &&
    String(item.source || "").toLowerCase() !== "youtube"
  ) {
    return Boolean(item.metadata?.stationCountry || item.metadata?.stationGenre);
  }

  return false;
}

export function isYouTubeLibraryFavorite(item: UnifiedFavoriteItem) {
  if (item.type === "radio_station") return false;
  if (looksLikeMisclassifiedRadioFavorite(item)) return false;
  return (
    item.source === "youtube" ||
    item.metadata?.legacyType === "youtube_video" ||
    Boolean(item.metadata?.videoId)
  );
}

export function libraryMediaBadgeLabel(item: UnifiedFavoriteItem) {
  if (item.type === "radio_station") return "RADIO";
  if (item.type === "artist") return "ARTIST";
  if (item.type === "album") return "ALBUM";
  if (item.type === "song") {
    if (isYouTubeLibraryFavorite(item)) return "YOUTUBE";
    return "SONG";
  }
  return "SAVED";
}

/** Pure owner resolution for Library taps — never defaults to TV. */
export type LibraryFavoriteOwnerRoute =
  | "radio"
  | "song"
  | "youtube"
  | "artist"
  | "album"
  | "unsupported";

export function resolveLibraryFavoriteOwner(
  item: UnifiedFavoriteItem
): LibraryFavoriteOwnerRoute {
  if (!item?.id || !item?.type) return "unsupported";
  if (
    item.type === "radio_station" ||
    looksLikeMisclassifiedRadioFavorite(item)
  ) {
    return "radio";
  }
  if (item.type === "song") {
    return isYouTubeLibraryFavorite(item) ? "youtube" : "song";
  }
  if (item.type === "artist") return "artist";
  if (item.type === "album") return "album";
  return "unsupported";
}

export function libraryFavoriteCompoundKey(type: FavoriteItemType, id: string) {
  const safeId =
    type === "radio_station" ? normalizeRadioFavoriteStationId(id) : String(id || "").trim();
  return favoriteStorageKey(type, safeId);
}

export function migrateUnifiedFavoriteItem(
  item: UnifiedFavoriteItem
): UnifiedFavoriteItem {
  if (!looksLikeMisclassifiedRadioFavorite(item)) {
    if (item.type === "radio_station") {
      const id = normalizeRadioFavoriteStationId(item.id);
      if (id === item.id) return item;
      return { ...item, id, source: item.source || "radio" };
    }
    return item;
  }

  const id = normalizeRadioFavoriteStationId(item.id);
  const metadata = { ...(item.metadata || {}) };
  // Drop false YouTube id mined from radio-prefixed AppSong ids.
  if (String(metadata.videoId || "").toLowerCase().startsWith("radio")) {
    delete metadata.videoId;
  }
  delete metadata.legacyType;

  return {
    ...item,
    id,
    type: "radio_station",
    source: "radio",
    subtitle: item.subtitle || "Live Radio",
    metadata: {
      ...metadata,
      stationCountry: metadata.stationCountry,
      stationGenre: metadata.stationGenre || metadata.albumName,
      streamUrl: metadata.streamUrl,
      legacyType: "live_stream",
    },
  };
}
