import {
  getHiddenTunesCatalogSnapshot,
  hydrateHiddenTunesCatalogCache,
  type HiddenTunesNormalizedSong,
} from "../services/hiddenTunesApi";
import { syncAndroidAutoCatalogFromDerived } from "../services/androidAutoCatalogBridge";
import { syncCarPlayCatalogFromDerived } from "../services/carPlayCatalogBridge";

import {
  clearCatalogHydrationCache,
  getHydratedCatalogTracksOnce,
} from "./catalogHydrationCache";

let inflightLoad: Promise<HiddenTunesNormalizedSong[]> | null = null;
let hydratedSnapshot: HiddenTunesNormalizedSong[] = [];
let hydratedSnapshotLength = 0;
let hydratedSnapshotHeadId = "";
let hydratedSnapshotTailId = "";

function catalogSignature(tracks: HiddenTunesNormalizedSong[]) {
  if (!tracks.length) {
    return { length: 0, headId: "", tailId: "" };
  }

  return {
    length: tracks.length,
    headId: String(tracks[0]?.id ?? ""),
    tailId: String(tracks[tracks.length - 1]?.id ?? ""),
  };
}

function isSameCatalogSnapshot(tracks: HiddenTunesNormalizedSong[]) {
  const signature = catalogSignature(tracks);
  return (
    signature.length === hydratedSnapshotLength &&
    signature.headId === hydratedSnapshotHeadId &&
    signature.tailId === hydratedSnapshotTailId
  );
}

function rememberHydratedSnapshot(tracks: HiddenTunesNormalizedSong[]) {
  const signature = catalogSignature(tracks);
  hydratedSnapshot = tracks;
  hydratedSnapshotLength = signature.length;
  hydratedSnapshotHeadId = signature.headId;
  hydratedSnapshotTailId = signature.tailId;
}

/** Memoized in-memory catalog with one hydration pass per track id. */
export function getHydratedCatalogSnapshot(): HiddenTunesNormalizedSong[] {
  const raw = getHiddenTunesCatalogSnapshot();
  if (!raw.length) {
    return hydratedSnapshot.length ? hydratedSnapshot : raw;
  }

  if (isSameCatalogSnapshot(raw) && hydratedSnapshot.length === raw.length) {
    return hydratedSnapshot;
  }

  rememberHydratedSnapshot(getHydratedCatalogTracksOnce(raw));
  return hydratedSnapshot;
}

/** Load catalog once; dedupe concurrent callers and skip redundant hydration. */
export async function loadHydratedCatalogOnce(): Promise<
  HiddenTunesNormalizedSong[]
> {
  if (inflightLoad) {
    return inflightLoad;
  }

  inflightLoad = hydrateHiddenTunesCatalogCache()
    .then((tracks) => {
      if (!tracks.length) {
        return hydratedSnapshot.length ? hydratedSnapshot : tracks;
      }

      if (isSameCatalogSnapshot(tracks) && hydratedSnapshot.length === tracks.length) {
        return hydratedSnapshot;
      }


      rememberHydratedSnapshot(getHydratedCatalogTracksOnce(tracks));
      void syncAndroidAutoCatalogFromDerived();
      void syncCarPlayCatalogFromDerived();
      return hydratedSnapshot;

    })
    .finally(() => {
      inflightLoad = null;
    });

  return inflightLoad;
}

export function invalidateHydratedCatalogSnapshot() {
  hydratedSnapshot = [];
  hydratedSnapshotLength = 0;
  hydratedSnapshotHeadId = "";
  hydratedSnapshotTailId = "";
  clearCatalogHydrationCache();
}
