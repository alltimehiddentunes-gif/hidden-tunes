import type { Track } from "../types/music";
import { catalogSongsToTracks } from "../utils/worldCatalogAdapter";
import {
  getHydratedCatalogSnapshot,
  loadHydratedCatalogOnce,
} from "./catalogFetchLayer";

let cachedTracks: Track[] = [];

export function getEmotionalQueueCatalogTracks(): Track[] {
  const snapshot = getHydratedCatalogSnapshot();

  if (snapshot.length) {
    cachedTracks = catalogSongsToTracks(snapshot);
  }

  return cachedTracks;
}

export async function ensureEmotionalQueueCatalogTracks(): Promise<Track[]> {
  const songs = await loadHydratedCatalogOnce();
  cachedTracks = catalogSongsToTracks(songs);
  return cachedTracks;
}
