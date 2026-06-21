import { MEDIA_DISCOVERY_PAGE_SIZE } from "./mediaDiscovery";

/** Stations shown per home lane on first paint (mobile never loads full catalog). */
export const RADIO_HOME_LANE_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;

/** Minimum quality_score for Featured lane curation (client-side until backend index). */
export const RADIO_FEATURED_MIN_QUALITY = 45;

/** Minimum quality_score for Popular / general lanes. */
export const RADIO_POPULAR_MIN_QUALITY = 30;

/** Backend catalog targets (Phase 1A — mobile loads 40/page only). */
export const RADIO_CATALOG_TARGETS = {
  featured: 500,
  trending: 500,
  popular: 500,
  nightDrive: 100,
  heartbreakRecovery: 100,
  sundayWorship: 200,
  deepFocus: 200,
  afroHeat: 300,
  hiddenTreasures: 500,
} as const;

export type RadioHomeLaneId =
  | "featured"
  | "trending"
  | "popular"
  | "recommended";

export const RADIO_HOME_LANE_IDS: RadioHomeLaneId[] = [
  "featured",
  "trending",
  "popular",
  "recommended",
];

export function radioHomeLaneCacheKey(laneId: RadioHomeLaneId) {
  return `lane:${laneId}`;
}
