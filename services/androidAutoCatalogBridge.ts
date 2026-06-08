import { Platform } from "react-native";

import { isHiddenAudioEnabledOnAndroid } from "../constants/playbackConfig";
import { fetchHiddenTunesCatalog, getCachedHiddenTunesCatalog } from "./hiddenTunes";
import {
  buildAndroidAutoCatalogSnapshot,
  isAndroidAutoCatalogSyncEnabled,
} from "./androidAutoCatalogSync";
import { syncHiddenAudioAndroidAutoCatalog } from "../src/hidden-audio/hiddenAudioBridge";

let lastSyncSignature = "";

function catalogSignature(snapshot: ReturnType<typeof buildAndroidAutoCatalogSnapshot>) {
  return [
    snapshot.tracks.length,
    snapshot.sections.length,
    snapshot.roots.length,
    snapshot.tracks[0]?.mediaId || "",
    snapshot.tracks[snapshot.tracks.length - 1]?.mediaId || "",
  ].join(":");
}

export async function syncAndroidAutoCatalogFromDerived(): Promise<void> {
  if (!isAndroidAutoCatalogSyncEnabled()) return;

  try {
    const catalog = getCachedHiddenTunesCatalog() || (await fetchHiddenTunesCatalog());
    if (!catalog?.songs?.length) return;

    const snapshot = buildAndroidAutoCatalogSnapshot(catalog);
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
