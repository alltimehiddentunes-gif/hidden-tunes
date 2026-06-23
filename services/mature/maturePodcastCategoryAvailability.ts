import { PODCAST_MATURE_SUBCATEGORIES } from "../../constants/podcastMatureCategories";
import {
  buildMaturePodcastKeywordQuery,
  getMaturePodcastQueryGroup,
} from "../../constants/maturePodcastQueryGroups";
import { fetchPodcastShows } from "../podcastCatalogApi";

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

async function probeMatureCategory(categoryId: string, queryGroupId: string) {
  const group = getMaturePodcastQueryGroup(queryGroupId);
  if (!group) {
    availabilityCache.set(categoryId, { hasShows: false, checkedAt: Date.now() });
    return false;
  }

  const keyword = group.keywords[0] || group.primaryQuery;
  const response = await fetchPodcastShows(
    buildMaturePodcastKeywordQuery(keyword, 1, 1)
  ).catch(() => ({ success: false, shows: [] }));

  const hasShows = Boolean(response.success && response.shows.length > 0);
  availabilityCache.set(categoryId, { hasShows, checkedAt: Date.now() });
  return hasShows;
}

export async function probeMaturePodcastCategoryHasShows(categoryId: string, queryGroupId: string) {
  const cached = readAvailability(categoryId);
  if (cached) return cached.hasShows;

  const inflight = inflightProbes.get(categoryId);
  if (inflight) return inflight;

  const promise = probeMatureCategory(categoryId, queryGroupId).finally(() => {
    inflightProbes.delete(categoryId);
  });
  inflightProbes.set(categoryId, promise);
  return promise;
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

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export async function filterAvailableMaturePodcastCategories() {
  const categories = PODCAST_MATURE_SUBCATEGORIES;
  const results = await mapWithConcurrency(categories, 2, (category) =>
    probeMaturePodcastCategoryHasShows(category.id, category.queryGroupId)
  );

  return categories.filter((_, index) => results[index]);
}
