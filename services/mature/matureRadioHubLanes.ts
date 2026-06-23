import { MATURE_DISCOVERY_PAGE_SIZE } from "../../constants/matureDiscoveryFoundation";
import {
  MATURE_RADIO_MERGED_TALK_ID,
  MATURE_RADIO_PRIMARY_GROUPS,
} from "../../constants/matureRadioQueryGroups";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { readCachedRadioPage, writeCachedRadioStations } from "../radio/radioCache";
import type { HiddenTunesStation } from "../../types/radio";
import { dedupeMatureRadioStations } from "./matureQualityFilters";
import { loadMatureRadioCategoryPage } from "./matureRadioDiscovery";
import { resolveMatureRadioCategoryVisibility } from "./matureRadioCategoryAvailability";

const HUB_RADIO_CACHE_KEY = "mature-hub:live-radio";

function dedupeById(stations: HiddenTunesStation[]) {
  return dedupeMatureRadioStations(stations);
}

export async function loadMatureRadioHubLanePage(options?: { forceRefresh?: boolean }) {
  if (!shouldIncludeMatureInApi()) {
    return { stations: [] as HiddenTunesStation[], hasMore: false };
  }

  if (!options?.forceRefresh) {
    const cached = readCachedRadioPage(HUB_RADIO_CACHE_KEY, 0, MATURE_DISCOVERY_PAGE_SIZE);
    if (cached.length > 0) {
      return {
        stations: cached.slice(0, MATURE_DISCOVERY_PAGE_SIZE),
        hasMore: cached.length >= MATURE_DISCOVERY_PAGE_SIZE,
      };
    }
  }

  const visibility = await resolveMatureRadioCategoryVisibility().catch(() => ({
    visibleCategories: [],
    mergedCategory: null,
    hiddenCategoryIds: [],
    mergedSourceIds: [],
    stationCounts: {},
  }));

  const sourceIds = [
    ...visibility.visibleCategories.map((category) => category.id),
    visibility.mergedCategory?.id,
  ].filter((id): id is string => Boolean(id));

  const fallbackIds = MATURE_RADIO_PRIMARY_GROUPS.map((group) => group.id);
  const categoryIds = [...new Set(sourceIds.length ? sourceIds : fallbackIds)].slice(0, 3);

  let merged: HiddenTunesStation[] = [];
  for (const categoryId of categoryIds) {
    const result = await loadMatureRadioCategoryPage(categoryId, 0).catch(() => ({
      stations: [],
      hasMore: false,
    }));
    merged = [...merged, ...result.stations];
    if (merged.length >= MATURE_DISCOVERY_PAGE_SIZE) break;
  }

  const ranked = dedupeById(merged).filter((station) =>
    String(station.streamUrl || "").trim().startsWith("https://")
  );

  if (ranked.length > 0) {
    writeCachedRadioStations(HUB_RADIO_CACHE_KEY, ranked.slice(0, MATURE_DISCOVERY_PAGE_SIZE), {
      append: false,
    });
  }

  return {
    stations: ranked.slice(0, MATURE_DISCOVERY_PAGE_SIZE),
    hasMore: ranked.length >= MATURE_DISCOVERY_PAGE_SIZE,
  };
}

export function matureRadioHubMergedCategoryId() {
  return MATURE_RADIO_MERGED_TALK_ID;
}
