import { MATURE_DISCOVERY_PAGE_SIZE } from "../../constants/matureDiscoveryFoundation";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { readCachedRadioPage, writeCachedRadioStations } from "../radio/radioCache";
import type { HiddenTunesStation } from "../../types/radio";
import { dedupeMatureRadioStations, filterAndRankMatureRadioStations } from "./matureQualityFilters";
import { loadMatureRadioCategoryPage } from "./matureRadioDiscovery";

const HUB_RADIO_CACHE_KEY = "mature-hub:live-radio";
const HUB_RADIO_PRIMARY_CATEGORY = "adult-talk";

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

  const result = await loadMatureRadioCategoryPage(HUB_RADIO_PRIMARY_CATEGORY, 0).catch(() => ({
    stations: [],
    hasMore: false,
  }));

  const ranked = filterAndRankMatureRadioStations(dedupeById(result.stations), {
    categoryId: "hub:live-mature-talk",
  }).filter((station) => String(station.streamUrl || "").trim().startsWith("https://"));

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
