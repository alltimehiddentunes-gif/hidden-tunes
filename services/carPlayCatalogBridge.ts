import { Platform } from "react-native";

import { isHiddenAudioEnabledOnIOS } from "../constants/playbackConfig";
import {
  getCachedHiddenTunesCatalog,
  hydrateCachedHiddenTunesCatalog,
} from "./hiddenTunes";
import {
  type AndroidAutoBrowseItem,
  type AndroidAutoCatalogSnapshot,
  type AndroidAutoTrackPayload,
} from "./androidAutoCatalogSync";
import {
  buildCarPlayCatalogSnapshot as buildParentClosedCarPlaySnapshot,
  buildCarPlayInitialCatalogSnapshot,
  carPlayCatalogSignature,
} from "./carPlayCatalogSnapshot";
import { rememberCarPlayCatalogSnapshot } from "./carPlayMediaResolver";
export {
  buildCarPlayCatalogSnapshot,
  buildCarPlayInitialCatalogSnapshot,
  carPlayCatalogSignature,
} from "./carPlayCatalogSnapshot";
import { getFavorites } from "./favorites/unifiedFavorites";
import { loadRecentlyPlayed } from "./recentlyPlayedEngine";
import {
  ensureHiddenAudioNativeSetup,
  isHiddenAudioNativeEngineAvailable,
  subscribeHiddenAudioNativeDiagnostics,
  syncHiddenAudioCarPlayCatalog,
} from "../src/hidden-audio/hiddenAudioBridge";

let lastSyncSignature = "";
let runtimeReadyLogged = false;

/** Single logical CarPlay / HiddenAudio bridge owner for this JS runtime. */
let bindingRefCount = 0;
let bindingCleanup: (() => void) | null = null;
let bindingReuseLogged = false;
let initialCatalogPublishPromise: Promise<void> | null = null;
let inFlightCatalogPublishPromise: Promise<void> | null = null;
let lastCarPlayStatus: Record<string, unknown> = {};
let carPlaySnapshotGeneration = 0;
let carPlayCacheHydrationAttempted = false;

type CarPlayBrowseNode = {
  mediaId: string;
  title: string;
  subtitle: string;
  playable: boolean;
};

function logCarPlayJs(message: string, extra?: Record<string, unknown>) {
  if (extra && Object.keys(extra).length) {
    console.log(`[HTCarPlayJS] ${message}`, extra);
  } else {
    console.log(`[HTCarPlayJS] ${message}`);
  }
}

/** Favorites sanitizer — mirrors native HiddenAudioCarPlayCatalog.sanitizedFavoritesNodes. */
export function sanitizeCarPlayFavorites(
  raw: Array<{ mediaId?: string; title?: string; subtitle?: string; playable?: boolean }>
): CarPlayBrowseNode[] {
  const seen = new Set<string>();
  const out: CarPlayBrowseNode[] = [];

  for (const node of raw || []) {
    const mediaId = String(node.mediaId || "").trim();
    const title = String(node.title || "").trim();
    if (!mediaId || !title) continue;
    if (mediaId.startsWith("empty:")) continue;
    if (seen.has(mediaId)) continue;
    seen.add(mediaId);
    out.push({
      mediaId,
      title,
      subtitle: String(node.subtitle || "").trim(),
      playable: !!node.playable,
    });
    if (out.length >= 25) break;
  }

  return out;
}

/** Build playable CarPlay favorite nodes + track payloads from phone favorites (bounded). */
function collectCarPlayFavoriteEntries(): {
  items: CarPlayBrowseNode[];
  tracks: AndroidAutoTrackPayload[];
} {
  const items: CarPlayBrowseNode[] = [];
  const tracks: AndroidAutoTrackPayload[] = [];
  const seen = new Set<string>();

  try {
    for (const fav of getFavorites().slice(0, 48)) {
      if (items.length >= 25) break;
      if (fav.type === "song") {
        const id = String(fav.id || "").trim();
        const title = String(fav.title || "").trim();
        const url = String(fav.metadata?.streamUrl || "").trim();
        if (!id || !title || !url) continue;
        const mediaId = `fav:song:${id}`;
        if (seen.has(mediaId)) continue;
        seen.add(mediaId);
        items.push({
          mediaId,
          title,
          subtitle: String(fav.subtitle || "Favorite").trim() || "Favorite",
          playable: true,
        });
        tracks.push({
          mediaId,
          id,
          url,
          title,
          artist: String(fav.subtitle || "Hidden Tunes").trim() || "Hidden Tunes",
          album: "",
          artworkUrl: String(fav.artwork || ""),
          durationSeconds: 0,
          contentType: "music",
          isLive: false,
        });
      } else if (fav.type === "radio_station") {
        const id = String(fav.id || "").trim();
        const title = String(fav.title || "").trim();
        const url = String(fav.metadata?.streamUrl || "").trim();
        if (!id || !title || !url) continue;
        const mediaId = `fav:radio:${id}`;
        if (seen.has(mediaId)) continue;
        seen.add(mediaId);
        items.push({
          mediaId,
          title,
          subtitle: String(fav.subtitle || "Live radio").trim() || "Live radio",
          playable: true,
        });
        tracks.push({
          mediaId,
          id,
          url,
          title,
          artist: String(fav.subtitle || "Live radio").trim() || "Live radio",
          album: "Radio",
          artworkUrl: String(fav.artwork || ""),
          durationSeconds: 0,
          contentType: "radio",
          isLive: true,
        });
      }
    }
  } catch {
    // Favorites unavailable — native empty-state is fine.
  }

  return { items: sanitizeCarPlayFavorites(items), tracks };
}

function handleCarPlayNativeDiagnostic(event: {
  eventName?: string;
  data?: Record<string, unknown>;
}) {
  const name = String(event.eventName || "");
  const data = (event.data || {}) as Record<string, unknown>;
  const nestedEvent = String(data.event || "");
  const isCarPlay =
    name.toLowerCase().includes("carplay")
    || nestedEvent.toLowerCase().includes("carplay");
  if (!isCarPlay) return;

  // Merge latest known visible-root fields from any CarPlay diagnostic.
  lastCarPlayStatus = {
    ...lastCarPlayStatus,
    eventName: name,
    event: nestedEvent || name,
    success: data.success,
    connected: data.connected ?? data.hasInterfaceController,
    hasInterfaceController: data.hasInterfaceController,
    hasWindow: data.hasWindow,
    rootType: data.rootType,
    tabCount: data.tabCount,
    itemCount: data.itemCount,
    sectionCount: data.sectionCount,
    trackCount: data.trackCount,
    message: data.message,
    fallback: data.fallback,
    preinstalledRoot: data.preinstalledRoot,
    generation: data.generation,
  };

  if (name === "ios_carplay_play_from_media_id" || nestedEvent === "carplay_item_selected") {
    const command = String(data.mediaId || data.command || "play_from_media_id");
    logCarPlayJs(`playback command received=${command}`);
  }

  // Log the full native CarPlay diagnostic surface — catalog_synced alone is not UI success.
  logCarPlayJs(`native diagnostic=${name || nestedEvent || "unknown"}`, {
    ...data,
    event: nestedEvent || name,
  });
}

/**
 * Idempotent HiddenAudio / CarPlay diagnostic binding.
 * First acquire mounts once; later acquires reuse and log once until release.
 * Fast Refresh / full release can dispose and remount cleanly.
 */
function acquireCarPlayBinding(): () => void {
  if (Platform.OS !== "ios" || !isCarPlayCatalogSyncEnabled()) {
    return () => {};
  }

  bindingRefCount += 1;

  if (bindingCleanup) {
    if (!bindingReuseLogged) {
      bindingReuseLogged = true;
      logCarPlayJs("HiddenAudio binding reused");
    }
    return releaseCarPlayBinding;
  }

  if (!runtimeReadyLogged) {
    runtimeReadyLogged = true;
    logCarPlayJs("app runtime ready");
  }

  if (isHiddenAudioNativeEngineAvailable()) {
    logCarPlayJs("HiddenAudio binding mounted");
  } else {
    logCarPlayJs("HiddenAudio binding pending");
  }

  bindingReuseLogged = false;
  bindingCleanup = subscribeHiddenAudioNativeDiagnostics(handleCarPlayNativeDiagnostic);
  // Wire manager→JS diagnostics (onCarPlayDiagnostic). Without setup(), only
  // ios_carplay_catalog_synced from the module method reaches Metro.
  void ensureHiddenAudioNativeSetup();
  return releaseCarPlayBinding;
}

function releaseCarPlayBinding() {
  if (bindingRefCount > 0) bindingRefCount -= 1;
  if (bindingRefCount > 0) return;

  if (bindingCleanup) {
    bindingCleanup();
    bindingCleanup = null;
  }
  bindingReuseLogged = false;
}

function ensureCarPlayBindingMounted() {
  // Startup callers only need the singleton live; they do not own a React lifetime.
  if (bindingCleanup) {
    if (!bindingReuseLogged) {
      bindingReuseLogged = true;
      logCarPlayJs("HiddenAudio binding reused");
    }
    return;
  }
  acquireCarPlayBinding();
}

async function collectCarPlayRecentlyPlayedEntries(): Promise<{
  items: AndroidAutoBrowseItem[];
  tracks: AndroidAutoTrackPayload[];
}> {
  const items: AndroidAutoBrowseItem[] = [];
  const tracks: AndroidAutoTrackPayload[] = [];
  const seen = new Set<string>();
  for (const entry of (await loadRecentlyPlayed()).slice(0, 24)) {
    const id = String(entry.id || "").trim();
    const title = String(entry.title || "").trim();
    const url = String(entry.streamUrl || "").trim();
    if (!id || !title || !url) continue;
    const mediaId = `recent:song:${id}`;
    if (seen.has(mediaId)) continue;
    seen.add(mediaId);
    const artist = String(entry.artist || entry.channelTitle || "Hidden Tunes").trim() || "Hidden Tunes";
    items.push({ mediaId, title, subtitle: artist, playable: true, contentType: "music" });
    tracks.push({ mediaId, id, url, title, artist, album: "",
      artworkUrl: String(entry.artwork || entry.thumbnail || entry.coverUrl || ""),
      durationSeconds: 0, contentType: "music", isLive: false });
  }
  return { items, tracks };
}

function countSection(snapshot: AndroidAutoCatalogSnapshot, parentId: string) {
  const section = snapshot.sections.find((entry) => entry.parentId === parentId);
  return section?.items?.length || 0;
}

export function isCarPlayCatalogSyncEnabled() {
  return Platform.OS === "ios" && isHiddenAudioEnabledOnIOS();
}

/**
 * Fail-safe CarPlay catalog publish.
 * Publishes cached/minimal data immediately — never waits on auth, artwork, or full hydration.
 * Concurrent callers share one in-flight publish so startup (PlayerContext + catalogFetchLayer)
 * only logs and ships a single initial catalog.
 */
export async function syncCarPlayCatalogFromDerived(): Promise<void> {
  if (!isCarPlayCatalogSyncEnabled()) return;

  ensureCarPlayBindingMounted();

  if (inFlightCatalogPublishPromise) {
    return inFlightCatalogPublishPromise;
  }

  const publishPromise = publishCarPlayCatalogSnapshot().finally(() => {
    if (inFlightCatalogPublishPromise === publishPromise) {
      inFlightCatalogPublishPromise = null;
    }
  });

  inFlightCatalogPublishPromise = publishPromise;
  if (!initialCatalogPublishPromise) {
    initialCatalogPublishPromise = publishPromise;
  }

  // Cold CarPlay launch: install the native/minimal root immediately, then
  // hydrate the existing persisted bounded catalog without waiting for Home
  // hydration or starting a network/full-catalog request.
  if (!getCachedHiddenTunesCatalog() && !carPlayCacheHydrationAttempted) {
    carPlayCacheHydrationAttempted = true;
    void publishPromise.then(async () => {
      const hydrated = await hydrateCachedHiddenTunesCatalog();
      if (!hydrated?.songs?.length) {
        logCarPlayJs("persisted catalog hydration completed", { playable: false });
        return;
      }
      logCarPlayJs("persisted catalog hydration completed", {
        playable: true,
        songCount: hydrated.songs.length,
      });
      await publishCarPlayCatalogSnapshot();
    }).catch((error) => {
      logCarPlayJs("persisted catalog hydration failed", {
        message: String((error as Error)?.message || error),
      });
    });
  }

  return publishPromise;
}

async function publishCarPlayCatalogSnapshot(): Promise<void> {
  logCarPlayJs("catalog publish started");

  try {
    let catalog = getCachedHiddenTunesCatalog();

    let snapshot: AndroidAutoCatalogSnapshot;
    try {
      const favorites = collectCarPlayFavoriteEntries();
      const recentlyPlayed = await collectCarPlayRecentlyPlayedEntries();
      snapshot = catalog?.songs?.length
        ? buildParentClosedCarPlaySnapshot(catalog, {
            favoriteItems: favorites.items as AndroidAutoBrowseItem[],
            favoriteTracks: favorites.tracks,
            recentlyPlayedItems: recentlyPlayed.items,
            recentlyPlayedTracks: recentlyPlayed.tracks,
          })
        : buildCarPlayInitialCatalogSnapshot({
            favoriteItems: favorites.items as AndroidAutoBrowseItem[],
            favoriteTracks: favorites.tracks,
            recentlyPlayedItems: recentlyPlayed.items,
            recentlyPlayedTracks: recentlyPlayed.tracks,
          });
    } catch (buildError) {
      logCarPlayJs("catalog publish completed", { success: false, reason: "build_failed" });
      snapshot = buildCarPlayInitialCatalogSnapshot();
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[HTCarPlayJS] catalog build failed; using minimal snapshot", buildError);
      }
    }

    const favoritesCount = countSection(snapshot, "favorites");
    const radioCount = countSection(snapshot, "radio");
    const libraryCount =
      countSection(snapshot, "music") +
      countSection(snapshot, "playlists") +
      countSection(snapshot, "podcasts") +
      countSection(snapshot, "audiobooks");

    logCarPlayJs(`favorites count=${favoritesCount}`);
    logCarPlayJs(`radio count=${radioCount}`);
    logCarPlayJs(`library count=${libraryCount}`);

    const signature = carPlayCatalogSignature(snapshot);
    if (signature === lastSyncSignature) {
      console.log("[HTCarPlayBrowse] snapshot_unchanged", {
        generation: carPlaySnapshotGeneration,
        publishTimestamp: Date.now(),
      });
      logCarPlayJs("catalog publish completed", { success: true, skipped: "unchanged" });
      return;
    }

    const replacedPreviousSnapshot = lastSyncSignature.length > 0;
    const nextGeneration = carPlaySnapshotGeneration + 1;
    console.log("[HTCarPlayBrowse] snapshot_publish", {
      generation: nextGeneration,
      publishTimestamp: Date.now(),
      sectionCount: snapshot.sections.length,
      trackCount: snapshot.tracks.length,
      rootNodeIds: snapshot.roots.map((node) => node.mediaId),
      childCounts: snapshot.sections.map((entry) => `${entry.parentId}:${entry.items.length}`),
      replacedPreviousSnapshot,
    });
    await syncHiddenAudioCarPlayCatalog(snapshot as unknown as Record<string, unknown>);
    // Accept selections only after native has accepted this exact bounded snapshot.
    rememberCarPlayCatalogSnapshot(snapshot);
    lastSyncSignature = signature;
    carPlaySnapshotGeneration = nextGeneration;
    logCarPlayJs("catalog publish completed", {
      success: true,
      trackCount: snapshot.tracks.length,
      sectionCount: snapshot.sections.length,
    });
  } catch (error) {
    logCarPlayJs("catalog publish completed", { success: false });
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[HTCarPlayJS] catalog sync failed", error);
    }
    // Last-resort minimal publish so native never depends on a thrown JS catalog.
    try {
      const minimal = buildCarPlayInitialCatalogSnapshot();
      await syncHiddenAudioCarPlayCatalog(minimal as unknown as Record<string, unknown>);
      rememberCarPlayCatalogSnapshot(minimal);
      logCarPlayJs("catalog publish completed", { success: true, fallback: "minimal" });
    } catch {
      // Native safe root already installed — do not throw into app runtime.
    }
  }
}
