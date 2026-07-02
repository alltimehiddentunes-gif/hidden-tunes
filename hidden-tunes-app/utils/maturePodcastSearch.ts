import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { rankMaturePodcastSeeds } from "../services/podcastService";
import { MATURE_PODCAST_SEARCH_PAGE_SIZE } from "./podcastPerformanceLimits";

export type MaturePodcastSearchPage = {
  results: HiddenTunesPodcastShow[];
  total: number;
  page: number;
  hasMore: boolean;
};

/**
 * Mature-only search with pagination. Returns empty when mature access is disabled.
 * Does not touch standard podcast search paths.
 */
export function searchMaturePodcastDiscoveryPage(
  query: string,
  matureEnabled: boolean,
  page = 1,
  pageSize = MATURE_PODCAST_SEARCH_PAGE_SIZE
): MaturePodcastSearchPage {
  if (!matureEnabled) {
    return { results: [], total: 0, page: 1, hasMore: false };
  }

  const safePage = Math.max(1, page);
  const ranked = rankMaturePodcastSeeds(query);
  const offset = (safePage - 1) * pageSize;
  const results = ranked.slice(offset, offset + pageSize);

  return {
    results,
    total: ranked.length,
    page: safePage,
    hasMore: offset + pageSize < ranked.length,
  };
}
