import { Platform } from "react-native";

import { isHiddenAudioEnabledOnIOS } from "../constants/playbackConfig";
import {
  fetchHiddenTunesCatalog,
  getCachedHiddenTunesCatalog,
  type HiddenTunesDerivedCatalog,
  type HiddenTunesSong,
} from "./hiddenTunes";
import {
  buildAndroidAutoCatalogSnapshot,
  buildAndroidAutoMinimalCatalogSnapshot,
  type AndroidAutoBrowseItem,
  type AndroidAutoCatalogSnapshot,
  type AndroidAutoTrackPayload,
} from "./androidAutoCatalogSync";
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
let visibleRootProbeScheduled = false;
let lastCarPlayStatus: Record<string, unknown> = {};

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

function catalogSignature(snapshot: AndroidAutoCatalogSnapshot) {
  return [
    snapshot.tracks.length,
    snapshot.sections.length,
    snapshot.roots.length,
    snapshot.tracks[0]?.mediaId || "",
    snapshot.tracks[snapshot.tracks.length - 1]?.mediaId || "",
  ].join(":");
}

function songMediaId(song: HiddenTunesSong) {
  return `song:${String(song.id || "").trim()}`;
}

function playableSongItem(song: HiddenTunesSong): CarPlayBrowseNode | null {
  const id = String(song.id || "").trim();
  const title = String(song.title || "").trim();
  const url = String(song.streamUrl || song.url || "").trim();
  if (!id || !title || !url) return null;
  if (id.startsWith("empty:")) return null;
  return {
    mediaId: songMediaId(song),
    title,
    subtitle: String(song.artist || "Hidden Tunes").trim() || "Hidden Tunes",
    playable: true,
  };
}

function trackPayload(song: HiddenTunesSong): AndroidAutoTrackPayload | null {
  const url = String(song.streamUrl || song.url || "").trim();
  const id = String(song.id || "").trim();
  const title = String(song.title || "").trim();
  if (!url || !id || !title) return null;
  if (id.startsWith("empty:")) return null;

  return {
    mediaId: songMediaId(song),
    id,
    url,
    title,
    artist: String(song.artist || "Hidden Tunes").trim() || "Hidden Tunes",
    album: String(song.album || ""),
    artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""),
    durationSeconds:
      typeof song.duration === "number" && song.duration > 0 ? song.duration : 0,
  };
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

function buildMinimalOneItemCatalogSnapshot(): AndroidAutoCatalogSnapshot {
  const mediaId = "song:carplay-probe-1";
  return {
    roots: [
      {
        mediaId: "recently_played",
        title: "Recently Played",
        subtitle: "Probe",
        playable: false,
      },
    ],
    sections: [
      {
        parentId: "recently_played",
        items: [
          {
            mediaId,
            title: "CarPlay Probe Track",
            subtitle: "Minimal one-item catalog",
            playable: true,
          },
        ],
      },
      { parentId: "favorites", items: [] },
      { parentId: "made_for_you", items: [] },
      { parentId: "radio", items: [] },
      { parentId: "playlists", items: [] },
      { parentId: "music", items: [] },
      { parentId: "podcasts", items: [] },
      { parentId: "audiobooks", items: [] },
    ],
    tracks: [
      {
        mediaId,
        id: "carplay-probe-1",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        title: "CarPlay Probe Track",
        artist: "Hidden Tunes",
        album: "Probe",
        artworkUrl: "",
        durationSeconds: 30,
      },
    ],
  };
}

/**
 * Metro-only visible-root probe.
 * There is no JS-exposed refreshCarPlay/reloadTemplates — only syncCarPlayCatalog.
 * Re-publishing triggers native applyCatalogSnapshot → reloadTemplates when connected.
 */
async function runVisibleRootProbeOnce(): Promise<void> {
  if (visibleRootProbeScheduled) return;
  visibleRootProbeScheduled = true;

  logCarPlayJs("visible-root probe scheduled", {
    note: "no JS getCarPlayStatus/reloadTemplates; using setup + syncCarPlayCatalog only",
    lastStatus: lastCarPlayStatus,
  });

  const setupOk = await ensureHiddenAudioNativeSetup();
  logCarPlayJs("visible-root probe setup", { setupOk });

  // Allow scene connect diagnostics (if any) to arrive after setup wires onCarPlayDiagnostic.
  await new Promise((resolve) => setTimeout(resolve, 750));

  logCarPlayJs("visible-root probe status before refresh", { ...lastCarPlayStatus });

  try {
    const minimal = buildMinimalOneItemCatalogSnapshot();
    lastSyncSignature = ""; // force native apply even if identical to prior probe
    await syncHiddenAudioCarPlayCatalog(minimal as unknown as Record<string, unknown>);
    logCarPlayJs("visible-root probe minimal catalog published", {
      sectionCount: minimal.sections.length,
      trackCount: minimal.tracks.length,
      listenItems: minimal.sections.find((s) => s.parentId === "recently_played")?.items.length ?? 0,
    });
  } catch (error) {
    logCarPlayJs("visible-root probe minimal catalog failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
  logCarPlayJs("visible-root probe status after refresh", { ...lastCarPlayStatus });
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

function collectPlayableSongs(catalog: HiddenTunesDerivedCatalog | null | undefined, limit: number) {
  const songs: HiddenTunesSong[] = [];
  const seen = new Set<string>();
  for (const song of catalog?.songs || []) {
    const id = String(song.id || "").trim();
    const url = String(song.streamUrl || song.url || "").trim();
    const title = String(song.title || "").trim();
    if (!id || !url || !title || seen.has(id)) continue;
    seen.add(id);
    songs.push(song);
    if (songs.length >= limit) break;
  }
  return songs;
}

/**
 * CarPlay-shaped snapshot for native Listen / Radio / Library tabs.
 * Uses only known-playable cached catalog audio — no fake stream URLs.
 */
export function buildCarPlayCatalogSnapshot(
  catalog: HiddenTunesDerivedCatalog | null | undefined
): AndroidAutoCatalogSnapshot {
  const listenSongs = collectPlayableSongs(catalog, 12);
  const librarySongs = collectPlayableSongs(catalog, 24);
  const tracks: AndroidAutoTrackPayload[] = [];
  const sections: AndroidAutoCatalogSnapshot["sections"] = [];

  const pushTracks = (songs: HiddenTunesSong[]) => {
    for (const song of songs) {
      const payload = trackPayload(song);
      if (payload) tracks.push(payload);
    }
  };

  pushTracks(listenSongs);
  pushTracks(librarySongs);

  const listenItems = listenSongs
    .map(playableSongItem)
    .filter((item): item is CarPlayBrowseNode => !!item);

  const favorites = sanitizeCarPlayFavorites([]);
  // Empty favorites is valid — native supplies "No favorites yet".

  sections.push({ parentId: "recently_played", items: listenItems.slice(0, 8) });
  sections.push({ parentId: "favorites", items: favorites as AndroidAutoBrowseItem[] });
  sections.push({
    parentId: "made_for_you",
    items: listenItems.slice(0, 8) as AndroidAutoBrowseItem[],
  });

  // Radio: only include live-stream songs already in catalog (verified playable urls).
  // Radio: prefer radio-prefixed catalog entries with real stream URLs.
  const radioSongs = (catalog?.songs || []).filter((song) => {
    const id = String(song.id || "");
    const url = String(song.streamUrl || song.url || "").trim();
    return !!url && id.startsWith("radio-");
  }).slice(0, 12);
  pushTracks(radioSongs);
  const radioItems = radioSongs
    .map(playableSongItem)
    .filter((item): item is CarPlayBrowseNode => !!item);
  sections.push({
    parentId: "radio",
    items: (radioItems.length
      ? radioItems
      : listenItems.slice(0, 1).map((item) => ({
          ...item,
          subtitle: item.subtitle || "Playable audio",
        }))) as AndroidAutoBrowseItem[],
  });

  const libraryItems = librarySongs
    .map(playableSongItem)
    .filter((item): item is CarPlayBrowseNode => !!item);
  sections.push({ parentId: "playlists", items: libraryItems.slice(0, 8) as AndroidAutoBrowseItem[] });
  sections.push({ parentId: "music", items: libraryItems.slice(0, 12) as AndroidAutoBrowseItem[] });
  sections.push({ parentId: "podcasts", items: [] as AndroidAutoBrowseItem[] });
  sections.push({ parentId: "audiobooks", items: [] as AndroidAutoBrowseItem[] });

  const roots: AndroidAutoBrowseItem[] = [
    {
      mediaId: "recently_played",
      title: "Recently Played",
      subtitle: "Pick up where you left off",
      playable: false,
    },
    {
      mediaId: "made_for_you",
      title: "Made for You",
      subtitle: "Recommended listening",
      playable: false,
    },
    {
      mediaId: "playlists",
      title: "Playlists",
      subtitle: "Collections",
      playable: false,
    },
    {
      mediaId: "radio",
      title: "Radio",
      subtitle: "Live stations",
      playable: false,
    },
  ];

  // Dedupe tracks by mediaId.
  const seen = new Set<string>();
  const dedupedTracks = tracks.filter((track) => {
    if (!track.mediaId || seen.has(track.mediaId)) return false;
    seen.add(track.mediaId);
    return true;
  });

  return {
    roots,
    sections,
    tracks: dedupedTracks.slice(0, 80),
  };
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

  return publishPromise;
}

async function publishCarPlayCatalogSnapshot(): Promise<void> {
  logCarPlayJs("catalog publish started");

  try {
    // Prefer cache first so CarPlay is not blocked on network.
    let catalog = getCachedHiddenTunesCatalog();
    if (!catalog?.songs?.length) {
      try {
        catalog = await fetchHiddenTunesCatalog();
      } catch {
        catalog = null;
      }
    }

    let snapshot: AndroidAutoCatalogSnapshot;
    try {
      snapshot = catalog?.songs?.length
        ? buildCarPlayCatalogSnapshot(catalog)
        : buildAndroidAutoMinimalCatalogSnapshot();
      // If CarPlay-shaped build somehow yields zero tracks, fall back to AA snapshot.
      if (!snapshot.tracks.length && catalog?.songs?.length) {
        snapshot = buildAndroidAutoCatalogSnapshot(catalog);
      }
    } catch (buildError) {
      logCarPlayJs("catalog publish completed", { success: false, reason: "build_failed" });
      snapshot = buildAndroidAutoMinimalCatalogSnapshot();
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

    const signature = catalogSignature(snapshot);
    if (signature === lastSyncSignature) {
      logCarPlayJs("catalog publish completed", { success: true, skipped: "unchanged" });
      return;
    }

    lastSyncSignature = signature;
    await syncHiddenAudioCarPlayCatalog(snapshot as unknown as Record<string, unknown>);
    logCarPlayJs("catalog publish completed", {
      success: true,
      trackCount: snapshot.tracks.length,
      sectionCount: snapshot.sections.length,
    });
    // Catalog acceptance ≠ visible root. Probe existing sync path + wire setup diagnostics.
    void runVisibleRootProbeOnce();
  } catch (error) {
    logCarPlayJs("catalog publish completed", { success: false });
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[HTCarPlayJS] catalog sync failed", error);
    }
    // Last-resort minimal publish so native never depends on a thrown JS catalog.
    try {
      const minimal = buildAndroidAutoMinimalCatalogSnapshot();
      await syncHiddenAudioCarPlayCatalog(minimal as unknown as Record<string, unknown>);
      logCarPlayJs("catalog publish completed", { success: true, fallback: "minimal" });
    } catch {
      // Native safe root already installed — do not throw into app runtime.
    }
  }
}
