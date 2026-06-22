import { loadRecentlyPlayed } from "../recentlyPlayedEngine";
import type { HiddenTunesPodcastShow } from "../podcastCatalogApi";
import type { PodcastShowListItem } from "../../types/podcastDiscovery";
import { readCachedPodcastShows } from "../../utils/podcastDiscoveryCache";
import { isDiscoverablePodcastShow } from "./podcastDiscoverability";
import { toPodcastShowListItem } from "./podcastNormalizer";

function stripPodcastPrefix(id: string) {
  return String(id || "").replace(/^podcast-/i, "").trim();
}

function findCachedShow(showId: string, showTitle?: string) {
  const cacheKeys = [
    "featured",
    "trending",
    "popular",
    "recommended",
    "business",
    "relationships",
    "health",
    "comedy",
    "news",
    "faith",
    "african-voices",
  ];

  for (const cacheKey of cacheKeys) {
    const cached = readCachedPodcastShows(cacheKey);
    const match = cached?.find(
      (show) =>
        show.id === showId ||
        (showTitle &&
          show.title.trim().toLowerCase() === showTitle.trim().toLowerCase())
    );
    if (match && isDiscoverablePodcastShow(match)) {
      return match;
    }
  }

  return null;
}

export async function loadRecentlyPlayedPodcastItems(limit = 40) {
  const recent = await loadRecentlyPlayed();
  const podcastEntries = recent.filter((entry) =>
    String(entry.id || "").startsWith("podcast-")
  );

  const seenShows = new Set<string>();
  const items: PodcastShowListItem[] = [];
  const shows: HiddenTunesPodcastShow[] = [];

  for (const entry of podcastEntries) {
    const showId = String(entry.showId || "").trim();
    const showTitle = String(entry.artist || entry.title || "").trim();
    const showKey = (showId || showTitle).toLowerCase();
    if (!showKey || seenShows.has(showKey)) continue;

    const cached = showId
      ? findCachedShow(showId, showTitle)
      : findCachedShow("", showTitle);

    if (!cached) continue;

    seenShows.add(showKey);
    shows.push(cached);
    items.push(toPodcastShowListItem(cached));

    if (items.length >= limit) break;
  }

  return { items, shows };
}
