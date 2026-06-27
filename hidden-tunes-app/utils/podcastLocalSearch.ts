import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import { searchMaturePodcastSeeds } from "../services/podcastService";
import { listCachedPodcastShows } from "./podcastDiscoveryCache";
import { PODCAST_MAX_SEARCH_RESULTS } from "./podcastPerformanceLimits";

function tokenizeQuery(query: string) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function showHaystack(show: HiddenTunesPodcastShow) {
  return [
    show.title,
    show.host_name,
    show.description,
    show.primary_category,
    ...(show.categories || []),
  ]
    .join(" ")
    .toLowerCase();
}

function searchCachedShows(query: string, limit = PODCAST_MAX_SEARCH_RESULTS) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return [];

  return listCachedPodcastShows()
    .filter((show) => {
      const haystack = showHaystack(show);
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, limit);
}

export function searchLocalPodcastDiscovery(
  query: string,
  matureEnabled: boolean
) {
  const safeLimit = PODCAST_MAX_SEARCH_RESULTS;
  const cached = searchCachedShows(query, safeLimit);
  const mature = searchMaturePodcastSeeds(query, matureEnabled).slice(0, safeLimit);

  const seen = new Set<string>();
  const merged: HiddenTunesPodcastShow[] = [];

  for (const show of [...cached, ...mature]) {
    if (seen.has(show.id)) continue;
    seen.add(show.id);
    merged.push(show);
    if (merged.length >= safeLimit) break;
  }

  return merged;
}
