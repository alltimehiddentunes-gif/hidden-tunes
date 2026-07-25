import { Platform } from "react-native";

import { isHiddenAudioEnabledOnAndroid } from "../constants/playbackConfig";
import { fetchHiddenTunesCatalog, getCachedHiddenTunesCatalog } from "./hiddenTunes";
import {
  buildAndroidAutoCatalogSnapshot,
  buildAndroidAutoMinimalCatalogSnapshot,
  isAndroidAutoCatalogSyncEnabled,
  type AndroidAutoCatalogExtras,
} from "./androidAutoCatalogSync";
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

function catalogSignature(snapshot: ReturnType<typeof buildAndroidAutoCatalogSnapshot>) {
  return [
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
    extras.recentlyPlayed = (await loadRecentlyPlayed()).slice(0, 24);
  } catch {
    extras.recentlyPlayed = [];
  }
  try {
    extras.favorites = getFavorites().slice(0, 48);
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
      .filter((station) => station.id);
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
    extras.podcastEpisodes = (podcasts || []).slice(0, 16).map((episode: any) => ({
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

export async function syncAndroidAutoCatalogFromDerived(): Promise<void> {
  if (!isAndroidAutoCatalogSyncEnabled()) return;

  try {
    if (!reactReadyNotified) {
      reactReadyNotified = true;
      await notifyHiddenAudioReactHostReady().catch(() => undefined);
    }

    const catalog = getCachedHiddenTunesCatalog() || (await fetchHiddenTunesCatalog());
    const extras = await buildExtras();
    const snapshot = catalog?.songs?.length
      ? buildAndroidAutoCatalogSnapshot(catalog, extras)
      : buildAndroidAutoMinimalCatalogSnapshot();
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
