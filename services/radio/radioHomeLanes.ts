import { RADIO_HOME_LANE_PAGE_SIZE, radioHomeLaneCacheKey } from "../../constants/radioFoundation";
import type { HiddenTunesStation } from "../../types/radio";
import { readCachedRadioStations, writeCachedRadioStations } from "./radioCache";
import { loadRadioCategoryPage, RADIO_STATION_PAGE_SIZE } from "./radioBrowserApi";
import { sortStationsByQuality } from "./radioQualityScore";

type LaneLoadOptions = {
  offset?: number;
  limit?: number;
  forceRefresh?: boolean;
  append?: boolean;
};

function dedupeById(stations: HiddenTunesStation[]) {
  const seen = new Set<string>();
  return stations.filter((station) => {
    if (seen.has(station.id)) return false;
    seen.add(station.id);
    return true;
  });
}

export function buildRecommendedRadioStations(
  featured: HiddenTunesStation[],
  trending: HiddenTunesStation[],
  recentIds: Set<string>,
  limit = RADIO_HOME_LANE_PAGE_SIZE
) {
  const pool = dedupeById([...trending, ...featured]).filter(
    (station) => !recentIds.has(station.id)
  );

  const recentTagSet = new Set<string>();
  featured
    .filter((station) => recentIds.has(station.id))
    .forEach((station) => {
      station.tags.forEach((tag) => recentTagSet.add(tag.toLowerCase()));
    });

  const scored = pool.map((station) => {
    let score = station.quality_score || 0;
    station.tags.forEach((tag) => {
      if (recentTagSet.has(tag.toLowerCase())) score += 8;
    });
    return { station, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return sortStationsByQuality(scored.map((entry) => entry.station)).slice(0, limit);
}

export async function loadRecommendedRadioLanePage(options?: LaneLoadOptions) {
  const offset = Math.max(0, Number(options?.offset) || 0);
  const limit = Math.max(
    1,
    Math.min(Number(options?.limit) || RADIO_STATION_PAGE_SIZE, RADIO_HOME_LANE_PAGE_SIZE)
  );
  const cacheKey = radioHomeLaneCacheKey("recommended");

  if (!options?.forceRefresh) {
    const cached = readCachedRadioStations(cacheKey);
    if (cached?.length) {
      const page = cached.slice(offset, offset + limit);
      return {
        stations: page,
        hasMore: cached.length > offset + page.length,
        fromCache: true,
      };
    }
  }

  const [featuredResult, trendingResult] = await Promise.all([
    loadRadioCategoryPage("featured", { offset: 0, forceRefresh: false }),
    loadRadioCategoryPage("trending", { offset: 0, forceRefresh: false }),
  ]);

  const recommended = buildRecommendedRadioStations(
    featuredResult.stations,
    trendingResult.stations,
    new Set()
  );

  await writeCachedRadioStations(cacheKey, recommended, { append: false });

  const page = recommended.slice(offset, offset + limit);
  return {
    stations: page,
    hasMore: recommended.length > offset + page.length,
    fromCache: false,
  };
}

export async function loadRadioHomeLanePage(
  laneId: "featured" | "trending" | "popular",
  options?: LaneLoadOptions
) {
  return loadRadioCategoryPage(laneId, options);
}

export function rememberRecommendedLane(
  featured: HiddenTunesStation[],
  trending: HiddenTunesStation[],
  recentIds: Set<string>
) {
  const recommended = buildRecommendedRadioStations(featured, trending, recentIds);
  void writeCachedRadioStations(radioHomeLaneCacheKey("recommended"), recommended, {
    append: false,
  });
  return recommended;
}
