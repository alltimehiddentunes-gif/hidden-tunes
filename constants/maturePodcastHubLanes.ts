import { MATURE_DISCOVERY_PAGE_SIZE } from "./matureDiscoveryFoundation";

export type MaturePodcastHubLaneId =
  | "featured"
  | "trending"
  | "popular"
  | "new-episodes"
  | "dating-relationships"
  | "sexual-health"
  | "adult-psychology"
  | "adult-comedy"
  | "real-stories"
  | "after-dark"
  | "hidden-gems";

export type MaturePodcastHubLane = {
  id: MaturePodcastHubLaneId;
  title: string;
  eyebrow: string;
  searchQuery: string;
  categoryLinkId?: string;
};

export const MATURE_PODCAST_HUB_LANES: MaturePodcastHubLane[] = [
  {
    id: "featured",
    title: "Featured Mature Podcasts",
    eyebrow: "FEATURED",
    searchQuery: "relationships dating advice podcast",
  },
  {
    id: "trending",
    title: "Trending Mature Podcasts",
    eyebrow: "TRENDING",
    searchQuery: "trending relationships podcast",
  },
  {
    id: "popular",
    title: "Popular Mature Podcasts",
    eyebrow: "POPULAR",
    searchQuery: "popular love advice podcast",
  },
  {
    id: "new-episodes",
    title: "New Episodes",
    eyebrow: "NEW",
    searchQuery: "new relationship podcast episodes",
  },
  {
    id: "dating-relationships",
    title: "Dating & Relationships",
    eyebrow: "DATING",
    searchQuery: "dating relationships podcast",
    categoryLinkId: "mature-dating",
  },
  {
    id: "sexual-health",
    title: "Sexual Health",
    eyebrow: "HEALTH",
    searchQuery: "sexual health intimacy podcast",
    categoryLinkId: "mature-sexual-health",
  },
  {
    id: "adult-psychology",
    title: "Adult Psychology",
    eyebrow: "MIND",
    searchQuery: "psychology relationships podcast",
    categoryLinkId: "mature-adult-psychology",
  },
  {
    id: "adult-comedy",
    title: "Adult Comedy",
    eyebrow: "COMEDY",
    searchQuery: "adult comedy uncensored podcast",
    categoryLinkId: "mature-adult-comedy",
  },
  {
    id: "real-stories",
    title: "Real Stories",
    eyebrow: "STORIES",
    searchQuery: "confessions real stories podcast",
    categoryLinkId: "mature-real-stories",
  },
  {
    id: "after-dark",
    title: "After Dark",
    eyebrow: "AFTER DARK",
    searchQuery: "after dark late night talk podcast",
    categoryLinkId: "mature-after-dark-conversations",
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    eyebrow: "GEMS",
    searchQuery: "underrated relationships podcast",
  },
];

export const MATURE_PODCAST_HUB_LANE_PAGE_SIZE = MATURE_DISCOVERY_PAGE_SIZE;

export function maturePodcastHubLaneCacheKey(laneId: string) {
  return `mature-hub:${laneId}`;
}

export function getMaturePodcastHubLane(id: string) {
  return MATURE_PODCAST_HUB_LANES.find((lane) => lane.id === id) || null;
}
