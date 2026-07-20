import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  FavoriteItemType,
  UnifiedFavoriteItem,
} from "../../types/favorites";
import { favoriteStorageKey } from "../../types/favorites";
import { isMatureContentItem } from "../../types/matureContent";
import { buildSongFavoriteItem } from "./favoriteItemBuilders";
import {
  LIBRARY_FAVORITES_SCHEMA_VERSION,
  LIBRARY_FAVORITES_SCHEMA_VERSION_KEY,
  libraryFavoriteCompoundKey,
  migrateUnifiedFavoriteItem,
  normalizeRadioFavoriteStationId,
} from "./libraryFavoriteIdentity";

export const UNIFIED_FAVORITES_KEY = "hidden_tunes_unified_favorites_v1";
export const LEGACY_SONG_FAVORITES_KEY = "hidden_tunes_favorites";

export type LegacyAppSong = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  cover?: string;
  thumbnail?: string;
  source?: string;
  sourceName?: string;
  type?: string;
  videoId?: string;
  streamUrl?: string;
  url?: string;
  duration?: number | string;
  artistId?: string;
  albumId?: string;
  isOnline?: boolean;
};

export type UnifiedFavoritesSnapshot = {
  items: UnifiedFavoriteItem[];
  lookup: ReadonlyMap<string, UnifiedFavoriteItem>;
  version: number;
};

let snapshot: UnifiedFavoritesSnapshot = {
  items: [],
  lookup: new Map(),
  version: 0,
};

let hydrated = false;
let hydratePromise: Promise<UnifiedFavoritesSnapshot> | null = null;
const listeners = new Set<() => void>();

function buildLookup(items: UnifiedFavoriteItem[]) {
  const lookup = new Map<string, UnifiedFavoriteItem>();
  for (const item of items) {
    if (!item?.id || !item?.type) continue;
    lookup.set(libraryFavoriteCompoundKey(item.type, item.id), item);
  }
  return lookup;
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function applySnapshot(items: UnifiedFavoriteItem[]) {
  const deduped = dedupeFavorites(items);
  snapshot = {
    items: deduped,
    lookup: buildLookup(deduped),
    version: snapshot.version + 1,
  };
  notifyListeners();
}

function dedupeFavorites(items: UnifiedFavoriteItem[]) {
  const seen = new Set<string>();
  const result: UnifiedFavoriteItem[] = [];

  for (const item of items) {
    if (!item?.id || !item?.type) continue;
    const key = libraryFavoriteCompoundKey(item.type, item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeFavoriteItem(raw: unknown): UnifiedFavoriteItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as UnifiedFavoriteItem;
  const id = String(item.id || "").trim();
  const type = item.type;
  if (!id || !type) return null;

  const allowed: FavoriteItemType[] = [
    "song",
    "artist",
    "album",
    "radio_station",
  ];

  if (!allowed.includes(type)) return null;

  const title = String(item.title || item.subtitle || "Untitled").trim() || "Untitled";
  const normalizedId =
    type === "radio_station" ? normalizeRadioFavoriteStationId(id) : id;

  return migrateUnifiedFavoriteItem({
    id: normalizedId,
    type,
    title,
    subtitle: item.subtitle ? String(item.subtitle) : undefined,
    artwork: item.artwork ? String(item.artwork) : undefined,
    source: item.source ? String(item.source) : undefined,
    addedAt: item.addedAt || new Date().toISOString(),
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
  });
}

function legacySongToFavorite(raw: unknown): UnifiedFavoriteItem | null {
  if (!raw || typeof raw !== "object") return null;
  const legacy = raw as Record<string, unknown>;
  if (!legacy.id) return null;
  return buildSongFavoriteItem(legacy as Parameters<typeof buildSongFavoriteItem>[0]);
}

async function readLegacySongFavorites() {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_SONG_FAVORITES_KEY);
    if (!raw) return [] as UnifiedFavoriteItem[];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as UnifiedFavoriteItem[];

    return parsed
      .map((item) => legacySongToFavorite(item))
      .filter(Boolean) as UnifiedFavoriteItem[];
  } catch {
    return [] as UnifiedFavoriteItem[];
  }
}

async function persistFavorites(items: UnifiedFavoriteItem[]) {
  const serialized = JSON.stringify(items);
  const songItems = items.filter((item) => item.type === "song");

  await Promise.all([
    AsyncStorage.setItem(UNIFIED_FAVORITES_KEY, serialized),
    AsyncStorage.setItem(
      LEGACY_SONG_FAVORITES_KEY,
      JSON.stringify(songItems.map(songFavoriteToAppSong))
    ),
  ]);
}

export function songFavoriteToAppSong(item: UnifiedFavoriteItem): LegacyAppSong {
  const metadata = item.metadata || {};
  const isYoutube =
    item.type === "song" &&
    (item.source === "youtube" ||
      metadata.legacyType === "youtube_video" ||
      Boolean(metadata.videoId)) &&
    metadata.legacyType !== "live_stream" &&
    item.source !== "radio";

  return {
    id: item.id,
    title: item.title,
    artist: String(metadata.artistName || item.subtitle || "Unknown Artist"),
    album: metadata.albumName ? String(metadata.albumName) : undefined,
    artwork: item.artwork,
    cover: item.artwork,
    thumbnail: item.artwork,
    source: item.source,
    sourceName: metadata.sourceName ? String(metadata.sourceName) : undefined,
    type: isYoutube ? "youtube_video" : String(metadata.legacyType || "r2"),
    videoId: isYoutube && metadata.videoId ? String(metadata.videoId) : undefined,
    streamUrl: metadata.streamUrl ? String(metadata.streamUrl) : undefined,
    url: metadata.streamUrl ? String(metadata.streamUrl) : undefined,
    duration: metadata.duration,
    artistId: metadata.artistId ? String(metadata.artistId) : undefined,
    albumId: metadata.albumId ? String(metadata.albumId) : undefined,
    isOnline: true,
  };
}

export function subscribeUnifiedFavorites(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUnifiedFavoritesSnapshot() {
  return snapshot;
}

export function getFavorites(): UnifiedFavoriteItem[] {
  return snapshot.items;
}

export function getFavoritesByType(type: FavoriteItemType) {
  return snapshot.items.filter((item) => item.type === type);
}

export function isFavorite(type: FavoriteItemType, id: string) {
  if (!id) return false;
  const primary = libraryFavoriteCompoundKey(type, id);
  if (snapshot.lookup.has(primary)) return true;

  // Tolerate pre-migration radio-prefixed AppSong ids until hydrate rewrites storage.
  if (type === "radio_station") {
    const bare = normalizeRadioFavoriteStationId(id);
    const prefixed = bare.startsWith("radio-") ? bare : `radio-${bare}`;
    return (
      snapshot.lookup.has(favoriteStorageKey(type, bare)) ||
      snapshot.lookup.has(favoriteStorageKey(type, prefixed))
    );
  }

  return false;
}

export function filterVisibleFavorites(
  items: UnifiedFavoriteItem[],
  includeMature: boolean
) {
  if (includeMature) return items;
  return items.filter((item) => !isMatureContentItem(item.metadata));
}

export async function hydrateUnifiedFavorites() {
  if (hydrated) return snapshot;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const [unifiedRaw, legacyItems, schemaRaw] = await Promise.all([
        AsyncStorage.getItem(UNIFIED_FAVORITES_KEY),
        readLegacySongFavorites(),
        AsyncStorage.getItem(LIBRARY_FAVORITES_SCHEMA_VERSION_KEY),
      ]);

      let items: UnifiedFavoriteItem[] = [];
      const storedSchema = Number(schemaRaw || 0);

      if (unifiedRaw) {
        const parsed = JSON.parse(unifiedRaw);
        if (Array.isArray(parsed)) {
          items = parsed
            .map((item) => normalizeFavoriteItem(item))
            .filter(Boolean) as UnifiedFavoriteItem[];
        }
      }

      if (!items.length && legacyItems.length) {
        items = legacyItems
          .map((item) => migrateUnifiedFavoriteItem(item))
          .filter(Boolean);
        await persistFavorites(items);
        await AsyncStorage.setItem(
          LIBRARY_FAVORITES_SCHEMA_VERSION_KEY,
          String(LIBRARY_FAVORITES_SCHEMA_VERSION)
        );
      } else if (legacyItems.length) {
        const migratedLegacy = legacyItems.map((item) =>
          migrateUnifiedFavoriteItem(item)
        );
        const merged = dedupeFavorites([...items, ...migratedLegacy]);
        if (merged.length !== items.length) {
          items = merged;
          await persistFavorites(items);
        }
      }

      // Always run additive identity migration; idempotent via compound keys.
      const migrated = dedupeFavorites(
        items.map((item) => migrateUnifiedFavoriteItem(item))
      );
      const changed =
        migrated.length !== items.length ||
        migrated.some((item, index) => {
          const prev = items[index];
          return (
            !prev ||
            prev.type !== item.type ||
            prev.id !== item.id ||
            String(prev.metadata?.videoId || "") !== String(item.metadata?.videoId || "")
          );
        }) ||
        storedSchema < LIBRARY_FAVORITES_SCHEMA_VERSION;

      if (changed) {
        items = migrated;
        await persistFavorites(items);
        await AsyncStorage.setItem(
          LIBRARY_FAVORITES_SCHEMA_VERSION_KEY,
          String(LIBRARY_FAVORITES_SCHEMA_VERSION)
        );
      }

      applySnapshot(items);
    } catch {
      applySnapshot([]);
    }

    hydrated = true;
    hydratePromise = null;
    return snapshot;
  })();

  return hydratePromise;
}

export async function addFavorite(item: UnifiedFavoriteItem) {
  await hydrateUnifiedFavorites();
  if (!item?.id || !item?.type) return snapshot;

  const nextItem = migrateUnifiedFavoriteItem({
    ...item,
    id: String(item.id),
    title: String(item.title || "Untitled"),
  });
  const key = libraryFavoriteCompoundKey(nextItem.type, nextItem.id);
  const existing = snapshot.lookup.get(key);
  nextItem.addedAt = existing?.addedAt || item.addedAt || new Date().toISOString();

  const without = snapshot.items.filter(
    (entry) => libraryFavoriteCompoundKey(entry.type, entry.id) !== key
  );
  const updated = dedupeFavorites([nextItem, ...without]);

  applySnapshot(updated);
  await persistFavorites(updated);
  return snapshot;
}

export async function removeFavorite(type: FavoriteItemType, id: string) {
  await hydrateUnifiedFavorites();
  if (!id) return snapshot;

  const key = libraryFavoriteCompoundKey(type, id);
  const bareRadio =
    type === "radio_station" ? normalizeRadioFavoriteStationId(id) : "";
  const prefixedRadio = bareRadio ? `radio-${bareRadio}` : "";

  const updated = snapshot.items.filter((entry) => {
    const entryKey = libraryFavoriteCompoundKey(entry.type, entry.id);
    if (entryKey === key) return false;
    if (
      type === "radio_station" &&
      entry.type === "radio_station" &&
      (entry.id === bareRadio || entry.id === prefixedRadio)
    ) {
      return false;
    }
    return true;
  });

  applySnapshot(updated);
  await persistFavorites(updated);
  return snapshot;
}

export async function toggleFavorite(item: UnifiedFavoriteItem) {
  await hydrateUnifiedFavorites();
  if (!item?.id || !item?.type) return snapshot;

  if (isFavorite(item.type, item.id)) {
    return removeFavorite(item.type, item.id);
  }

  return addFavorite(item);
}

void hydrateUnifiedFavorites();
