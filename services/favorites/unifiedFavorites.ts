import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  FavoriteItemType,
  UnifiedFavoriteItem,
} from "../../types/favorites";
import { favoriteStorageKey } from "../../types/favorites";
import { isMatureContentItem } from "../../types/matureContent";
import { buildSongFavoriteItem } from "./favoriteItemBuilders";

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
    lookup.set(favoriteStorageKey(item.type, item.id), item);
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
    const key = favoriteStorageKey(item.type, item.id);
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
    "podcast_show",
    "podcast_episode",
    "video",
  ];

  if (!allowed.includes(type)) return null;

  const title = String(item.title || item.subtitle || "Untitled").trim() || "Untitled";

  return {
    id,
    type,
    title,
    subtitle: item.subtitle ? String(item.subtitle) : undefined,
    artwork: item.artwork ? String(item.artwork) : undefined,
    source: item.source ? String(item.source) : undefined,
    addedAt: item.addedAt || new Date().toISOString(),
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
  };
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
    item.source === "youtube" ||
    metadata.legacyType === "youtube_video" ||
    Boolean(metadata.videoId);

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
    videoId: metadata.videoId ? String(metadata.videoId) : undefined,
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
  return snapshot.lookup.has(favoriteStorageKey(type, id));
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
      const [unifiedRaw, legacyItems] = await Promise.all([
        AsyncStorage.getItem(UNIFIED_FAVORITES_KEY),
        readLegacySongFavorites(),
      ]);

      let items: UnifiedFavoriteItem[] = [];

      if (unifiedRaw) {
        const parsed = JSON.parse(unifiedRaw);
        if (Array.isArray(parsed)) {
          items = parsed
            .map((item) => normalizeFavoriteItem(item))
            .filter(Boolean) as UnifiedFavoriteItem[];
        }
      }

      if (!items.length && legacyItems.length) {
        items = legacyItems;
        await persistFavorites(items);
      } else if (legacyItems.length) {
        const merged = dedupeFavorites([...items, ...legacyItems]);
        if (merged.length !== items.length) {
          items = merged;
          await persistFavorites(items);
        }
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

  const key = favoriteStorageKey(item.type, item.id);
  const existing = snapshot.lookup.get(key);
  const nextItem: UnifiedFavoriteItem = {
    ...item,
    id: String(item.id),
    title: String(item.title || "Untitled"),
    addedAt: existing?.addedAt || item.addedAt || new Date().toISOString(),
  };

  const without = snapshot.items.filter(
    (entry) => favoriteStorageKey(entry.type, entry.id) !== key
  );
  const updated = dedupeFavorites([nextItem, ...without]);

  applySnapshot(updated);
  await persistFavorites(updated);
  return snapshot;
}

export async function removeFavorite(type: FavoriteItemType, id: string) {
  await hydrateUnifiedFavorites();
  if (!id) return snapshot;

  const key = favoriteStorageKey(type, id);
  const updated = snapshot.items.filter(
    (entry) => favoriteStorageKey(entry.type, entry.id) !== key
  );

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
