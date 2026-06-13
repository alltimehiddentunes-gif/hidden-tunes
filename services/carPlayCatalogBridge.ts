import { Platform } from "react-native";

import { isHiddenAudioEnabledOnIOS } from "../constants/playbackConfig";
import { fetchHiddenTunesCatalog, getCachedHiddenTunesCatalog } from "./hiddenTunes";
import {
  buildAndroidAutoCatalogSnapshot,
  buildAndroidAutoMinimalCatalogSnapshot,
} from "./androidAutoCatalogSync";
import { syncHiddenAudioCarPlayCatalog } from "../src/hidden-audio/hiddenAudioBridge";

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

export function isCarPlayCatalogSyncEnabled() {
  return Platform.OS === "ios" && isHiddenAudioEnabledOnIOS();
}

export async function syncCarPlayCatalogFromDerived(): Promise<void> {
  if (!isCarPlayCatalogSyncEnabled()) return;

  try {
    const catalog = getCachedHiddenTunesCatalog() || (await fetchHiddenTunesCatalog());
    const snapshot = catalog?.songs?.length
      ? buildAndroidAutoCatalogSnapshot(catalog)
      : buildAndroidAutoMinimalCatalogSnapshot();
    const signature = catalogSignature(snapshot);
    if (signature === lastSyncSignature) return;

    lastSyncSignature = signature;
    await syncHiddenAudioCarPlayCatalog(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[CarPlay] catalog sync failed", error);
    }
  }
}
