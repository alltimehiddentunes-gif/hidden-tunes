import { MEDIA_DISCOVERY_PAGE_SIZE } from "./mediaDiscovery";

/** Shows per home lane on first paint (mobile never loads full catalog). */
export const PODCAST_HOME_LANE_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;

/** Minimum quality_score for Featured lane curation. */
export const PODCAST_FEATURED_MIN_QUALITY = 45;

/** Minimum quality_score for Popular lane curation. */
export const PODCAST_POPULAR_MIN_QUALITY = 30;

export const PODCAST_CATALOG_TARGETS = {
  featured: 500,
  trending: 500,
  popular: 500,
  heartbreakRecovery: 100,
  nightDrive: 100,
  sundayWorship: 200,
  deepFocus: 200,
  afroHeat: 300,
  hiddenTreasures: 500,
  africanVoices: 300,
} as const;

export type PodcastHomeLaneId = "featured" | "trending" | "popular" | "recommended";

export const PODCAST_HOME_LANE_IDS: PodcastHomeLaneId[] = [
  "featured",
  "trending",
  "popular",
  "recommended",
];

export function podcastHomeLaneCacheKey(laneId: PodcastHomeLaneId) {
  return `podcast-lane:${laneId}`;
}
