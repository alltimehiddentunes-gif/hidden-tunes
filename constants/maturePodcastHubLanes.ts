import { MATURE_DISCOVERY_PAGE_SIZE } from "./matureDiscoveryFoundation";

export type MaturePodcastHubLaneId =
  | "featured"
  | "trending"
  | "new-episodes"
  | "relationships-dating"
  | "after-dark"
  | "real-stories"
  | "adult-comedy"
  | "sexual-health"
  | "hidden-gems";

export type MaturePodcastHubLaneKind = "search" | "categories";

export type MaturePodcastHubLane = {
  id: MaturePodcastHubLaneId;
  title: string;
  eyebrow: string;
  kind: MaturePodcastHubLaneKind;
  searchQuery: string;
  /** Query group ids merged for mixed rails (categories kind). */
  categoryGroupIds?: string[];
};

/** Podcast-first hub rails — weak categories merge into mixed rails below. */
export const MATURE_PODCAST_HUB_LANES: MaturePodcastHubLane[] = [
  {
    id: "featured",
    title: "Featured Mature",
    eyebrow: "FEATURED",
    kind: "search",
    searchQuery: "relationships dating intimacy podcast",
  },
  {
    id: "trending",
    title: "Trending Mature",
    eyebrow: "TRENDING",
    kind: "search",
    searchQuery: "trending love advice relationships podcast",
  },
  {
    id: "new-episodes",
    title: "New Mature Episodes",
    eyebrow: "NEW",
    kind: "search",
    searchQuery: "new dating relationships podcast episodes",
  },
  {
    id: "relationships-dating",
    title: "Relationships & Dating",
    eyebrow: "LOVE",
    kind: "categories",
    searchQuery: "relationships dating love advice podcast",
    categoryGroupIds: ["dating", "relationships", "love-advice", "marriage"],
  },
  {
    id: "after-dark",
    title: "After Dark",
    eyebrow: "NIGHT",
    kind: "categories",
    searchQuery: "after dark late night uncensored podcast",
    categoryGroupIds: ["after-dark-conversations", "late-night-talk", "lifestyle-18"],
  },
  {
    id: "real-stories",
    title: "Real Stories",
    eyebrow: "STORIES",
    kind: "categories",
    searchQuery: "confessions real stories personal stories podcast",
    categoryGroupIds: ["real-stories", "confessions", "unfiltered-interviews"],
  },
  {
    id: "adult-comedy",
    title: "Adult Comedy",
    eyebrow: "COMEDY",
    kind: "categories",
    searchQuery: "adult comedy uncensored comedy podcast",
    categoryGroupIds: ["adult-comedy"],
  },
  {
    id: "sexual-health",
    title: "Sexual Health",
    eyebrow: "WELLNESS",
    kind: "categories",
    searchQuery: "sexual health intimacy wellness podcast",
    categoryGroupIds: ["sexual-health", "intimacy-communication"],
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    eyebrow: "GEMS",
    kind: "search",
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
