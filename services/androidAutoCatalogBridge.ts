import { Platform } from "react-native";

import { isHiddenAudioEnabledOnAndroid } from "../constants/playbackConfig";
import { getCachedHiddenTunesCatalog } from "./hiddenTunes";
import {
  buildAndroidAutoCatalogSnapshot,
  buildAndroidAutoMinimalCatalogSnapshot,
  ANDROID_AUTO_SNAPSHOT_SCHEMA_VERSION,
  isAndroidAutoCatalogSyncEnabled,
  rememberAndroidAutoCatalogSnapshot,
  type AndroidAutoCatalogExtras,
} from "./androidAutoCatalogSync";
import { isAndroidAutoContentVisible } from "./androidAutoVisibility";
import { getCurrentSupabaseProfileNamespace } from "./mobileSupabaseAuth";
import { shouldIncludeMatureInApi, subscribeMatureContentSettings } from "../utils/matureContentSettings";
import { shouldIncludeMaturePodcasts, subscribeMaturePodcastSettings } from "../utils/maturePodcastSettings";
import { collectCarPlayPremiumCatalog } from "./carPlayPremiumCatalog";
import { configureCarPlayMatureVisibility } from "./carPlayCatalogSnapshot";
import { mergeAndroidAutoPremiumSnapshot } from "./androidAutoPremiumSnapshot";
import { getFavorites } from "./favorites/unifiedFavorites";
import { loadRecentlyPlayed } from "./recentlyPlayedEngine";
import { loadRecentlyPlayedRadioItems } from "./radio/recentlyPlayedRadio";
import { loadPodcastRecentlyPlayed } from "./podcastRecentlyPlayed";
import {
  notifyHiddenAudioReactHostReady,
  syncHiddenAudioAndroidAutoCatalog,
} from "../src/hidden-audio/hiddenAudioBridge";

let lastSyncSignature = "";
let reactReadyNotified = false;
let matureVisibilityCleanup: (() => void) | null = null;
let maturePodcastVisibilityCleanup: (() => void) | null = null;
configureCarPlayMatureVisibility(shouldIncludeMatureInApi);

function catalogSignature(snapshot: ReturnType<typeof buildAndroidAutoCatalogSnapshot>) {
  return [
    snapshot.profileNamespace || "missing-profile",
    snapshot.matureAllowed ? "mature-on" : "mature-off",
    snapshot.maturePodcastAllowed ? "mature-podcast-on" : "mature-podcast-off",
    snapshot.tracks.length,
    snapshot.sections.length,
    snapshot.roots.length,
    snapshot.tracks[0]?.mediaId || "",
    snapshot.tracks[snapshot.tracks.length - 1]?.mediaId || "",
    snapshot.sections.map((s) => `${s.parentId}:${s.items.length}`).join("|"),
  ].join(":");
}

async function buildExtras(): Promise<AndroidAutoCatalogExtras> {
  const extras: AndroidAutoCatalogExtras = {};
  try {
    extras.recentlyPlayed = (await loadRecentlyPlayed()).filter((item) =>
      isAndroidAutoContentVisible(item, "music")
    ).slice(0, 24);
  } catch {
    extras.recentlyPlayed = [];
  }
  try {
    extras.favorites = getFavorites().filter((item) => {
      const domain = item.type === "radio_station" ? "radio" : "music";
      return isAndroidAutoContentVisible({ ...item.metadata, url: item.metadata?.streamUrl }, domain);
    }).slice(0, 48);
  } catch {
    extras.favorites = [];
  }
  try {
    const radioRecent = await loadRecentlyPlayedRadioItems(16);
    extras.radioStations = (radioRecent.stations || [])
      .map((station) => ({
        id: String(station.id || "").trim(),
        title: String(station.name || "Radio"),
        subtitle: station.country ? String(station.country) : "Live",
        streamUrl: String(station.streamUrl || ""),
        artworkUrl: String(station.favicon || ""),
      }))
      .filter((station) => station.id && isAndroidAutoContentVisible({
        ...station,
        url: station.streamUrl,
      }, "radio"));
    if (!extras.radioStations.length) {
      extras.radioStations = (extras.favorites || [])
        .filter((item) => item.type === "radio_station")
        .map((item) => ({
          id: String(item.id),
          title: item.title,
          subtitle: item.subtitle || "Live",
          streamUrl: String(item.metadata?.streamUrl || ""),
          artworkUrl: item.artwork || "",
        }));
    }
  } catch {
    extras.radioStations = (extras.favorites || [])
      .filter((item) => item.type === "radio_station")
      .map((item) => ({
        id: String(item.id),
        title: item.title,
        subtitle: item.subtitle || "Live",
        streamUrl: String(item.metadata?.streamUrl || ""),
        artworkUrl: item.artwork || "",
      }));
  }
  try {
    const podcasts = await loadPodcastRecentlyPlayed();
    extras.podcastEpisodes = (podcasts || []).filter((episode: any) =>
      isAndroidAutoContentVisible({ ...episode, url: episode.audioUrl }, "podcast")
    ).slice(0, 16).map((episode: any) => ({
      id: String(episode.id || ""),
      title: String(episode.title || "Episode"),
      subtitle: String(episode.showTitle || episode.publisher || "Podcast"),
      audioUrl: String(episode.audioUrl || ""),
      artworkUrl: String(episode.artworkUrl || episode.image || ""),
      durationSeconds:
        typeof episode.durationSeconds === "number" ? episode.durationSeconds : 0,
    }));
  } catch {
    extras.podcastEpisodes = [];
  }
  return extras;
}

function withSnapshotEnvelope(
  snapshot: ReturnType<typeof buildAndroidAutoCatalogSnapshot>,
  profileNamespace: string
) {
  const enriched = {
    ...snapshot,
    schemaVersion: ANDROID_AUTO_SNAPSHOT_SCHEMA_VERSION,
    profileNamespace,
    generatedAt: Date.now(),
    matureAllowed: shouldIncludeMatureInApi(),
    maturePodcastAllowed: shouldIncludeMaturePodcasts(),
  };
  return { ...enriched, signature: catalogSignature(enriched) };
}

function ensureMatureVisibilityBinding() {
  if (matureVisibilityCleanup) return;
  matureVisibilityCleanup = subscribeMatureContentSettings(() => {
    lastSyncSignature = "";
    void syncAndroidAutoCatalogFromDerived();
  });
  maturePodcastVisibilityCleanup = subscribeMaturePodcastSettings(() => {
    lastSyncSignature = "";
    void syncAndroidAutoCatalogFromDerived();
  });
}

export async function invalidateAndroidAutoProfileSnapshot() {
  lastSyncSignature = "";
  if (!isAndroidAutoCatalogSyncEnabled()) return;
  const minimal = withSnapshotEnvelope(buildAndroidAutoMinimalCatalogSnapshot(), "anonymous");
  await syncHiddenAudioAndroidAutoCatalog(minimal as unknown as Record<string, unknown>);
}

export async function syncAndroidAutoCatalogFromDerived(): Promise<void> {
  if (!isAndroidAutoCatalogSyncEnabled()) return;

  try {
    ensureMatureVisibilityBinding();
    if (!reactReadyNotified) {
      reactReadyNotified = true;
      await notifyHiddenAudioReactHostReady().catch(() => undefined);
    }

    // Android Auto must never trigger a full catalog walk. Native receives a
    // minimal snapshot until a catalog is already available in memory.
    const profileNamespace = await getCurrentSupabaseProfileNamespace();
    const catalog = getCachedHiddenTunesCatalog();
    const extras = profileNamespace === "anonymous" ? {} : await buildExtras();
    const base = catalog?.songs?.length
      ? buildAndroidAutoCatalogSnapshot(catalog, extras)
      : buildAndroidAutoMinimalCatalogSnapshot();
    // Do not expose premium data cached while a previous account was active.
    const premium = profileNamespace === "anonymous"
      ? { premiumTracks: [], premiumSections: [] }
      : await collectCarPlayPremiumCatalog({ allowNetwork: true });
    const built = mergeAndroidAutoPremiumSnapshot(base, premium);
    const snapshot = withSnapshotEnvelope(built, profileNamespace);
    // Keep JS resolution and the native persisted registry on the exact same
    // merged snapshot. This is required for premium taps after React attaches.
    rememberAndroidAutoCatalogSnapshot(snapshot);
    const signature = catalogSignature(snapshot);
    if (signature === lastSyncSignature) return;

    lastSyncSignature = signature;
    await syncHiddenAudioAndroidAutoCatalog(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[AndroidAuto] catalog sync failed", error);
    }
  }
}

export function isAndroidAutoBridgeEnabled() {
  return Platform.OS === "android" && isHiddenAudioEnabledOnAndroid();
}
