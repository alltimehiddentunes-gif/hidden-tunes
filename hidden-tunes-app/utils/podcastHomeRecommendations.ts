import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { loadFollowedPodcastShows } from "../services/podcastLibrary";
import { listCachedPodcastShows } from "./podcastDiscoveryCache";
import { PODCAST_HOME_RAIL_LIMIT } from "./podcastPerformanceLimits";

function followedToShow(entry: {
  id: string;
  title: string;
  artworkUrl?: string;
  hostName?: string;
  primaryCategory?: string;
}): HiddenTunesPodcastShow {
  return {
    id: entry.id,
    slug: entry.id,
    title: entry.title,
    artwork_url: entry.artworkUrl,
    host_name: entry.hostName,
    primary_category: entry.primaryCategory,
    categories: entry.primaryCategory ? [entry.primaryCategory] : [],
    sourceName: "Hidden Tunes",
  };
}

export async function getFollowedShowsRail(limit = PODCAST_HOME_RAIL_LIMIT) {
  const followed = await loadFollowedPodcastShows();
  return followed.slice(0, limit).map(followedToShow);
}

export function getRecommendedShowsFromCache(limit = PODCAST_HOME_RAIL_LIMIT) {
  const pool = listCachedPodcastShows();
  if (!pool.length) return [];

  const scored = pool
    .map((show) => {
      let score = 0;
      if (show.is_featured) score += 12;
      if (show.is_exclusive) score += 8;
      score += Math.min(show.episode_count || 0, 40);
      return { show, score };
    })
    .sort((left, right) => right.score - left.score);

  const seen = new Set<string>();
  const picks: HiddenTunesPodcastShow[] = [];

  for (const entry of scored) {
    if (seen.has(entry.show.id)) continue;
    seen.add(entry.show.id);
    picks.push(entry.show);
    if (picks.length >= limit) break;
  }

  return picks;
}
