import type { Track } from "../types/music";
import { hydrateTrackIfNeeded } from "./trackHydration";

type CatalogHydratable = {
  id?: string | number;
  emotionalMetadataRaw?: Track["emotionalMetadataRaw"];
  emotionalVector?: Track["emotionalVector"];
  emotionalTags?: Track["emotionalTags"];
};

const hydratedById = new Map<string, CatalogHydratable>();
const hydratedByRef = new WeakMap<object, CatalogHydratable>();

function resolveTrackId(track: CatalogHydratable): string {
  return String(track.id ?? "").trim();
}

/** Hydrate a catalog track once; reuse cached instances on re-renders. */
export function getHydratedCatalogTrackOnce<T extends CatalogHydratable>(
  track: T
): T {
  if (!track || typeof track !== "object") {
    return track;
  }

  const cachedRef = hydratedByRef.get(track);
  if (cachedRef) {
    return cachedRef as T;
  }

  const id = resolveTrackId(track);
  if (id) {
    const cachedId = hydratedById.get(id);
    if (cachedId) {
      hydratedByRef.set(track, cachedId);
      return cachedId as T;
    }
  }

  const hydrated = hydrateTrackIfNeeded(track as unknown as Track) as unknown as T;

  if (id) {
    hydratedById.set(id, hydrated);
  }
  hydratedByRef.set(track, hydrated);

  return hydrated;
}

/** Hydrate a catalog list once per track id without duplicate work. */
export function getHydratedCatalogTracksOnce<T extends CatalogHydratable>(
  tracks: T[]
): T[] {
  return tracks.map((track) => getHydratedCatalogTrackOnce(track));
}

export function clearCatalogHydrationCache() {
  hydratedById.clear();
}
