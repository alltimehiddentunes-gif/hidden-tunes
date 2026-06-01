import type { HiddenTunesTrack, Track } from "../types/music";
import { hydrateTrackIfNeeded } from "./trackHydration";

const hydratedById = new Map<string, Track>();
const hydratedByRef = new WeakMap<object, Track>();

function resolveTrackId(track: HiddenTunesTrack): string {
  return String(track.id ?? "").trim();
}

/** Hydrate a catalog track once; reuse cached instances on re-renders. */
export function getHydratedCatalogTrackOnce<T extends HiddenTunesTrack>(
  track: T
): Track & T {
  if (!track || typeof track !== "object") {
    return track as Track & T;
  }

  const cachedRef = hydratedByRef.get(track);
  if (cachedRef) {
    return cachedRef as Track & T;
  }

  const id = resolveTrackId(track);
  if (id) {
    const cachedId = hydratedById.get(id);
    if (cachedId) {
      hydratedByRef.set(track, cachedId);
      return cachedId as Track & T;
    }
  }

  const hydrated = hydrateTrackIfNeeded(track) as Track & T;

  if (id) {
    hydratedById.set(id, hydrated);
  }
  hydratedByRef.set(track, hydrated);

  return hydrated;
}

/** Hydrate a catalog list once per track id without duplicate work. */
export function getHydratedCatalogTracksOnce<T extends HiddenTunesTrack>(
  tracks: T[]
): Array<Track & T> {
  return tracks.map((track) => getHydratedCatalogTrackOnce(track));
}

export function clearCatalogHydrationCache() {
  hydratedById.clear();
}
