import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CatalogResolverType } from "../utils/catalogResolver";
import type { HiddenTunesNormalizedSong } from "./hiddenTunesApi";
import { isHeavyPerfDiagnosticsEnabled } from "../utils/devDiagnostics";
import { logPerformanceStorageWriteThrottled } from "../utils/performanceLogs";

const STORAGE_KEY = "hidden_tunes_catalog_view_cache_v1";
const STORE_VERSION = 1;
const MAX_PERSISTED_VIEWS = 28;
export const MEMORY_VIEW_TTL_MS = 1000 * 60 * 10;
export const PERSISTED_VIEW_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export type CatalogViewFreshness = "fresh" | "stale" | "expired";

export type CompactCatalogSong = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  artistId?: string;
  artwork?: string;
  cover?: string;
  thumbnail?: string;
  url?: string;
  streamUrl?: string;
  genre?: string;
  mood?: string;
  duration?: number;
};

export type PersistedCatalogViewRecord = {
  cacheKey: string;
  targetType: CatalogResolverType;
  targetId: string;
  targetTitle: string;
  targetQuery: string;
  songs: CompactCatalogSong[];
  hasMore: boolean;
  fallbackUsed: boolean;
  cachedAt: number;
  source: "api" | "cache_hydrate" | "persisted" | "memory";
  matchedCount: number;
};

type PersistedCatalogViewStore = {
  version: number;
  views: PersistedCatalogViewRecord[];
};

const persistedViewCache = new Map<string, PersistedCatalogViewRecord>();
let hydratePromise: Promise<number> | null = null;
let hasHydratedPersistedViews = false;
let persistCatalogViewsTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersistedCatalogPayload = "";

function shouldLogCatalogViewDiagnostics() {
  return isHeavyPerfDiagnosticsEnabled();
}

export function logCatalogViewDiagnostics(
  event: string,
  details: Record<string, string | number | boolean | undefined> = {}
) {
  if (!shouldLogCatalogViewDiagnostics()) return;

  console.log("[HiddenTunes:catalogView]", event, {
    at: Date.now(),
    ...details,
  });
}

export function getCatalogViewFreshness(cachedAt: number): CatalogViewFreshness {
  const ageMs = Date.now() - cachedAt;

  if (ageMs <= MEMORY_VIEW_TTL_MS) return "fresh";
  if (ageMs <= PERSISTED_VIEW_MAX_AGE_MS) return "stale";
  return "expired";
}

export function toCompactCatalogSong(
  song: HiddenTunesNormalizedSong
): CompactCatalogSong {
  return {
    id: String(song.id),
    title: String(song.title || "Unknown Song"),
    artist: String(song.artist || "Hidden Tunes"),
    album: song.album,
    albumId: song.albumId,
    artistId: song.artistId,
    artwork: song.artwork,
    cover: song.cover,
    thumbnail: song.thumbnail,
    url: song.url,
    streamUrl: song.streamUrl,
    genre: song.genre,
    mood: song.mood,
    duration: song.duration,
  };
}

export function fromCompactCatalogSong(
  song: CompactCatalogSong
): HiddenTunesNormalizedSong {
  const artwork = String(song.artwork || song.cover || song.thumbnail || "");
  const streamUrl = String(song.streamUrl || song.url || "");

  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album || "Singles",
    albumId: song.albumId,
    artistId: song.artistId,
    artwork,
    cover: artwork,
    thumbnail: artwork,
    url: streamUrl,
    streamUrl,
    genre: song.genre,
    mood: song.mood,
    duration: song.duration,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
  };
}

export function hasHydratedPersistedCatalogViews() {
  return hasHydratedPersistedViews;
}

export async function hydratePersistedCatalogViewCache() {
  if (hasHydratedPersistedViews) {
    logCatalogViewDiagnostics("persisted_hydrate_skipped_already_loaded", {
      loaded: persistedViewCache.size,
    });
    return persistedViewCache.size;
  }

  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        hasHydratedPersistedViews = true;
        logCatalogViewDiagnostics("persisted_hydrate_empty");
        return 0;
      }

      const parsed = JSON.parse(raw) as PersistedCatalogViewStore;
      const views = Array.isArray(parsed?.views) ? parsed.views : [];
      let loaded = 0;

      views.forEach((record) => {
        if (!record?.cacheKey || !Array.isArray(record.songs) || !record.songs.length) {
          return;
        }

        if (getCatalogViewFreshness(record.cachedAt) === "expired") {
          return;
        }

        persistedViewCache.set(record.cacheKey, record);
        loaded += 1;
      });

      hasHydratedPersistedViews = true;
      logCatalogViewDiagnostics("persisted_hydrate_complete", {
        loaded,
        total: views.length,
      });

      return loaded;
    } catch (error) {
      hasHydratedPersistedViews = true;
      logCatalogViewDiagnostics("persisted_hydrate_error", {
        message: String((error as Error)?.message || "unknown"),
      });
      return 0;
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

export function readPersistedCatalogView(cacheKey: string) {
  const record = persistedViewCache.get(cacheKey);
  if (!record?.songs.length) return null;

  const freshness = getCatalogViewFreshness(record.cachedAt);
  if (freshness === "expired") {
    persistedViewCache.delete(cacheKey);
    return null;
  }

  return {
    record,
    freshness,
  };
}

async function flushPersistedCatalogViews() {
  try {
    const views = Array.from(persistedViewCache.values())
      .sort((a, b) => b.cachedAt - a.cachedAt)
      .slice(0, MAX_PERSISTED_VIEWS);

    const payload: PersistedCatalogViewStore = {
      version: STORE_VERSION,
      views,
    };

    const serialized = JSON.stringify(payload);
    if (serialized === lastPersistedCatalogPayload) {
      logPerformanceStorageWriteThrottled("catalog_view_persist_skip", {
        viewCount: views.length,
      });
      return;
    }

    lastPersistedCatalogPayload = serialized;
    await AsyncStorage.setItem(STORAGE_KEY, serialized);

    logCatalogViewDiagnostics("persisted_write", {
      viewCount: views.length,
      freshness: views[0] ? getCatalogViewFreshness(views[0].cachedAt) : "unknown",
    });
  } catch (error) {
    logCatalogViewDiagnostics("persisted_write_error", {
      message: String((error as Error)?.message || "unknown"),
    });
  }
}

function schedulePersistedCatalogViews() {
  if (persistCatalogViewsTimer) {
    clearTimeout(persistCatalogViewsTimer);
  }
  persistCatalogViewsTimer = setTimeout(() => {
    persistCatalogViewsTimer = null;
    void flushPersistedCatalogViews();
  }, 1200);
}

export async function writePersistedCatalogView(record: PersistedCatalogViewRecord) {
  if (!record.songs.length) return;

  persistedViewCache.set(record.cacheKey, record);
  schedulePersistedCatalogViews();
}

export async function clearPersistedCatalogViewCache() {
  persistedViewCache.clear();
  hasHydratedPersistedViews = false;
  hydratePromise = null;

  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}
