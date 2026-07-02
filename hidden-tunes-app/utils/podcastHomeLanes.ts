import type { PodcastShowsQuery } from "../services/podcastCatalogApi";
import {
  PODCAST_CATEGORY_PAGE_SIZE,
  PODCAST_HOME_RAIL_LIMIT,
} from "./podcastPerformanceLimits";

export type PodcastCatalogLane = {
  id: string;
  title: string;
  query: PodcastShowsQuery;
  /** Optional category screen for See all */
  seeAllCategoryId?: string;
};

export const PODCAST_HOME_LANES: PodcastCatalogLane[] = [
  {
    id: "featured",
    title: "Featured Shows",
    query: { page: 1, limit: PODCAST_HOME_RAIL_LIMIT, is_featured: true },
    seeAllCategoryId: "business",
  },
  {
    id: "trending",
    title: "Trending",
    query: { page: 1, limit: PODCAST_HOME_RAIL_LIMIT, collection: "trending" },
    seeAllCategoryId: "technology",
  },
  {
    id: "editors-picks",
    title: "Editor's Picks",
    query: {
      page: 1,
      limit: PODCAST_HOME_RAIL_LIMIT,
      collection: "editors-picks",
    },
    seeAllCategoryId: "education",
  },
  {
    id: "new-releases",
    title: "New Releases",
    query: {
      page: 1,
      limit: PODCAST_HOME_RAIL_LIMIT,
      collection: "new-releases",
    },
    seeAllCategoryId: "news",
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    query: { page: 1, limit: PODCAST_HOME_RAIL_LIMIT, collection: "hidden-gems" },
    seeAllCategoryId: "personal-development",
  },
  {
    id: "originals",
    title: "Hidden Tunes Originals",
    query: { page: 1, limit: PODCAST_HOME_RAIL_LIMIT, is_exclusive: true },
    seeAllCategoryId: "artist-interviews",
  },
  {
    id: "recently-updated",
    title: "Recently Updated",
    query: { page: 2, limit: PODCAST_HOME_RAIL_LIMIT },
    seeAllCategoryId: "technology",
  },
  {
    id: "recommended",
    title: "Recommended For You",
    query: { page: 1, limit: PODCAST_HOME_RAIL_LIMIT, collection: "recommended" },
    seeAllCategoryId: "motivation",
  },
];

export const PODCAST_BROWSE_ALL_QUERY: PodcastShowsQuery = {
  page: 1,
  limit: PODCAST_CATEGORY_PAGE_SIZE,
};

export function getPodcastLaneCacheKey(laneId: string) {
  return `lane:${laneId}`;
}
