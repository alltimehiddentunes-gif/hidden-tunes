import {
  getRadioEmotionalWorld,
  stationMatchesEmotionalWorld,
} from "../../constants/radioEmotionalWorlds";
import type { HiddenTunesStation } from "../../types/radio";
import { logRadioDiscoveryFetch } from "../../utils/radioDiscoveryDiagnostics";
import { readCachedRadioPage } from "./radioCache";
import { loadRadioCategoryPage } from "./radioBrowserApi";

type AvailabilityEntry = {
  hasStations: boolean;
  checkedAt: number;
};

const AVAILABILITY_TTL_MS = 30 * 60 * 1000;
const availabilityCache = new Map<string, AvailabilityEntry>();
const inflightProbes = new Map<string, Promise<boolean>>();

function readAvailability(categoryId: string) {
  const entry = availabilityCache.get(categoryId);
  if (!entry) return null;
  if (Date.now() - entry.checkedAt > AVAILABILITY_TTL_MS) {
    availabilityCache.delete(categoryId);
    return null;
  }
  return entry;
}

async function probeCategory(categoryId: string) {
  const cachedPage = readCachedRadioPage(categoryId, 0, 1);
  if (cachedPage.length > 0) {
    availabilityCache.set(categoryId, {
      hasStations: true,
      checkedAt: Date.now(),
    });
    return true;
  }

  logRadioDiscoveryFetch("category-probe", categoryId);
  const result = await loadRadioCategoryPage(categoryId, {
    offset: 0,
    limit: 1,
    forceRefresh: false,
  }).catch(() => ({ stations: [], hasMore: false, fromCache: false }));

  const hasStations = result.stations.length > 0;
  availabilityCache.set(categoryId, {
    hasStations,
    checkedAt: Date.now(),
  });
  return hasStations;
}

export async function probeRadioCategoryHasStations(categoryId: string) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return false;

  const cached = readAvailability(safeId);
  if (cached) return cached.hasStations;

  const inflight = inflightProbes.get(safeId);
  if (inflight) return inflight;

  const promise = probeCategory(safeId).finally(() => {
    inflightProbes.delete(safeId);
  });
  inflightProbes.set(safeId, promise);
  return promise;
}

export async function filterAvailableRadioCategoryIds(categoryIds: string[]) {
  const uniqueIds = [...new Set(categoryIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const results = await mapWithConcurrency(uniqueIds, 2, probeRadioCategoryHasStations);
  return uniqueIds.filter((_, index) => results[index]);
}

export function invalidateRadioCategoryAvailability(categoryId?: string) {
  if (categoryId) {
    availabilityCache.delete(categoryId);
    return;
  }
  availabilityCache.clear();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function pickStationsForEmotionalWorld(
  pool: HiddenTunesStation[],
  worldId: string,
  limit = 8
) {
  const emotionalWorld = getRadioEmotionalWorld(worldId);
  if (!emotionalWorld) return [];

  return pool
    .filter((station) => stationMatchesEmotionalWorld(station.tags || [], emotionalWorld))
    .slice(0, limit);
}
