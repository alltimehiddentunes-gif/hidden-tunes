import { loadRecentlyPlayed } from "../recentlyPlayedEngine";
import type { HiddenTunesPodcastShow } from "../podcastCatalogApi";
import type { PodcastShowListItem } from "../../types/podcastDiscovery";
import { readCachedPodcastShows } from "../../utils/podcastDiscoveryCache";
import { toPodcastShowListItem } from "./podcastNormalizer";

function stripPodcastPrefix(id: string) {
  return String(id || "").replace(/^podcast-/i, "").trim();
}

function buildFallbackShow(entry: {
  id: string;
  title?: string;
  artist?: string;
  artworkUrl?: string;
  coverUrl?: string;
  thumbnail?: string;
}): HiddenTunesPodcastShow {
  const episodeId = stripPodcastPrefix(entry.id);
  return {
    id: episodeId,
    slug: episodeId,
    title: entry.title || "Podcast Show",
    host_name: entry.artist || undefined,
    artwork_url:
      entry.artworkUrl || entry.coverUrl || entry.thumbnail || undefined,
    categories: [],
    sourceName: "Hidden Tunes",
  };
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
    const episodeId = stripPodcastPrefix(entry.id);
    const showKey = String(entry.artist || entry.title || episodeId).trim().toLowerCase();
    if (seenShows.has(showKey)) continue;
    seenShows.add(showKey);

    const cached =
      readCachedPodcastShows("featured")?.find(
        (show) => show.id === episodeId || show.title === entry.artist
      ) ||
      readCachedPodcastShows("trending")?.find(
        (show) => show.title === entry.artist || show.id === episodeId
      );

    if (cached) {
      shows.push(cached);
      items.push(toPodcastShowListItem(cached));
    } else {
      const fallback = buildFallbackShow({
        id: entry.id,
        title: entry.artist || entry.title,
        artist: entry.artist,
        artworkUrl: entry.artworkUrl,
        coverUrl: entry.coverUrl,
        thumbnail: entry.thumbnail,
      });
      shows.push(fallback);
      items.push(toPodcastShowListItem(fallback));
    }

    if (items.length >= limit) break;
  }

  return { items, shows };
}
