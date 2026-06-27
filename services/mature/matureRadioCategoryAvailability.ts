import { MATURE_RADIO_MIN_CATEGORY_STATIONS } from "../../constants/matureDiscoveryFoundation";
import { MATURE_CATEGORY_PREFETCH } from "../../constants/discoveryPerformanceBudget";
import {
  MATURE_RADIO_MERGED_TALK_GROUP,
  MATURE_RADIO_PRIMARY_GROUPS,
  MATURE_RADIO_SUPPLEMENT_GROUPS,
  getMatureRadioGroupsForAvailabilityProbe,
  getMatureRadioQueryGroup,
  MATURE_RADIO_MERGED_TALK_ID,
  type MatureRadioQueryGroup,
} from "../../constants/matureRadioQueryGroups";
import type { RadioCategory } from "../../constants/radioCategories";
import { matureRadioGroupToCategory } from "../../constants/radioCategories";
import { loadMatureRadioCategoryPage } from "./matureRadioDiscovery";

type StationCountEntry = {
  count: number;
  checkedAt: number;
};

export type MatureRadioCategoryVisibility = {
  visibleCategories: RadioCategory[];
  mergedCategory: RadioCategory | null;
  hiddenCategoryIds: string[];
  mergedSourceIds: string[];
  stationCounts: Record<string, number>;
};

const AVAILABILITY_TTL_MS = 30 * 60 * 1000;
const stationCountCache = new Map<string, StationCountEntry>();
const inflightCounts = new Map<string, Promise<number>>();
let visibilityCache: { value: MatureRadioCategoryVisibility; checkedAt: number } | null = null;
let inflightVisibility: Promise<MatureRadioCategoryVisibility> | null = null;

function readStationCount(categoryId: string) {
  const entry = stationCountCache.get(categoryId);
  if (!entry) return null;
  if (Date.now() - entry.checkedAt > AVAILABILITY_TTL_MS) {
    stationCountCache.delete(categoryId);
    return null;
  }
  return entry.count;
}

function writeStationCount(categoryId: string, count: number) {
  stationCountCache.set(categoryId, { count, checkedAt: Date.now() });
}

function countPlayableStations(stations: Awaited<ReturnType<typeof loadMatureRadioCategoryPage>>["stations"]) {
  return stations.filter((station) =>
    String(station.streamUrl || "").trim().startsWith("https://")
  ).length;
}

export async function probeMatureRadioCategoryStationCount(categoryId: string) {
  const cached = readStationCount(categoryId);
  if (cached !== null) return cached;

  const inflight = inflightCounts.get(categoryId);
  if (inflight) return inflight;

  const promise = loadMatureRadioCategoryPage(categoryId, 0)
    .then((result) => {
      const count = countPlayableStations(result.stations);
      writeStationCount(categoryId, count);
      return count;
    })
    .catch(() => {
      writeStationCount(categoryId, 0);
      return 0;
    })
    .finally(() => {
      inflightCounts.delete(categoryId);
    });

  inflightCounts.set(categoryId, promise);
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

async function resolveVisibilityUncached(): Promise<MatureRadioCategoryVisibility> {
  const probeGroups = getMatureRadioGroupsForAvailabilityProbe();
  const counts = await mapWithConcurrency(probeGroups, 2, async (group) => ({
    group,
    count: await probeMatureRadioCategoryStationCount(group.id),
  }));

  const stationCounts: Record<string, number> = {};
  const visibleGroups: MatureRadioQueryGroup[] = [];
  const mergedSourceIds: string[] = [];
  const hiddenCategoryIds: string[] = [];

  counts.forEach(({ group, count }) => {
    stationCounts[group.id] = count;
    if (count >= MATURE_RADIO_MIN_CATEGORY_STATIONS) {
      visibleGroups.push(group);
      return;
    }

    hiddenCategoryIds.push(group.id);
    if (count > 0) {
      mergedSourceIds.push(group.id);
    }
  });

  let mergedCategory: RadioCategory | null = null;
  if (mergedSourceIds.length > 0) {
    const mergedCount = await probeMatureRadioCategoryStationCount(MATURE_RADIO_MERGED_TALK_ID);
    stationCounts[MATURE_RADIO_MERGED_TALK_ID] = mergedCount;
    if (mergedCount >= MATURE_RADIO_MIN_CATEGORY_STATIONS) {
      mergedCategory = matureRadioGroupToCategory(MATURE_RADIO_MERGED_TALK_GROUP);
    } else {
      hiddenCategoryIds.push(MATURE_RADIO_MERGED_TALK_ID);
    }
  }

  return {
    visibleCategories: visibleGroups.map(matureRadioGroupToCategory),
    mergedCategory,
    hiddenCategoryIds,
    mergedSourceIds,
    stationCounts,
  };
}

export async function resolveMatureRadioCategoryVisibility(forceRefresh = false) {
  if (
    !forceRefresh &&
    visibilityCache &&
    Date.now() - visibilityCache.checkedAt <= AVAILABILITY_TTL_MS
  ) {
    return visibilityCache.value;
  }

  if (!forceRefresh && inflightVisibility) {
    return inflightVisibility;
  }

  inflightVisibility = resolveVisibilityUncached()
    .then((value) => {
      visibilityCache = { value, checkedAt: Date.now() };
      return value;
    })
    .finally(() => {
      inflightVisibility = null;
    });

  return inflightVisibility;
}

export async function filterAvailableMatureRadioCategories() {
  if (!MATURE_CATEGORY_PREFETCH) {
    return MATURE_RADIO_PRIMARY_GROUPS.map(matureRadioGroupToCategory);
  }

  const visibility = await resolveMatureRadioCategoryVisibility();
  const categories = [...visibility.visibleCategories];
  if (visibility.mergedCategory) {
    categories.push(visibility.mergedCategory);
  }
  return categories;
}

export function getMatureRadioQueryGroupById(categoryId: string) {
  return getMatureRadioQueryGroup(categoryId);
}
