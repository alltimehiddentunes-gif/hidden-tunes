import { MATURE_DISCOVERY_PAGE_SIZE } from "./matureDiscoveryFoundation";

export type MaturePodcastHubLaneId =
  | "featured"
  | "trending"
  | "new-episodes"
  | "popular"
  | "hidden-gems";

export type MaturePodcastHubLane = {
  id: MaturePodcastHubLaneId;
  title: string;
  eyebrow: string;
  searchQuery: string;
};

/** Podcast-first hub rails — category browsing lives in the grid below. */
export const MATURE_PODCAST_HUB_LANES: MaturePodcastHubLane[] = [
  {
    id: "featured",
    title: "Featured Mature",
    eyebrow: "FEATURED",
    searchQuery: "relationships dating intimacy podcast",
  },
  {
    id: "trending",
    title: "Trending Mature",
    eyebrow: "TRENDING",
    searchQuery: "trending love advice relationships podcast",
  },
  {
    id: "new-episodes",
    title: "New Episodes",
    eyebrow: "NEW",
    searchQuery: "new dating relationships podcast episodes",
  },
  {
    id: "popular",
    title: "Most Popular",
    eyebrow: "POPULAR",
    searchQuery: "popular relationships love advice podcast",
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    eyebrow: "GEMS",
    searchQuery: "underrated mature relationships podcast",
  },
];

export const MATURE_PODCAST_HUB_LANE_PAGE_SIZE = MATURE_DISCOVERY_PAGE_SIZE;

export function maturePodcastHubLaneCacheKey(laneId: string) {
  return `mature-hub:${laneId}`;
}

export function getMaturePodcastHubLane(id: string) {
  return MATURE_PODCAST_HUB_LANES.find((lane) => lane.id === id) || null;
}
