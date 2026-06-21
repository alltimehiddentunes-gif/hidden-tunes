import { resolvePodcastCategoryId } from "../../constants/podcastCategories";
import { readCachedPodcastShows } from "../../utils/podcastDiscoveryCache";
import { loadPodcastCategoryPage } from "../podcastDiscoveryApi";

type AvailabilityEntry = {
  hasShows: boolean;
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
  const resolvedId = resolvePodcastCategoryId(categoryId);
  const cached = readCachedPodcastShows(resolvedId);
  if (cached?.length) {
    availabilityCache.set(categoryId, {
      hasShows: true,
      checkedAt: Date.now(),
    });
    return true;
  }

  const result = await loadPodcastCategoryPage(resolvedId, 0, {
    forceRefresh: false,
  }).catch(() => ({ shows: [], hasMore: false }));

  const hasShows = result.shows.length > 0;
  availabilityCache.set(categoryId, {
    hasShows,
    checkedAt: Date.now(),
  });
  return hasShows;
}

export async function probePodcastCategoryHasShows(categoryId: string) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return false;

  const cached = readAvailability(safeId);
  if (cached) return cached.hasShows;

  const inflight = inflightProbes.get(safeId);
  if (inflight) return inflight;

  const promise = probeCategory(safeId).finally(() => {
    inflightProbes.delete(safeId);
  });
  inflightProbes.set(safeId, promise);
  return promise;
}

export async function filterAvailablePodcastCategoryIds(categoryIds: string[]) {
  const uniqueIds = [...new Set(categoryIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const results = await mapWithConcurrency(uniqueIds, 2, probePodcastCategoryHasShows);
  return uniqueIds.filter((_, index) => results[index]);
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
