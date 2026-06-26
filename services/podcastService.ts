import {
  ALL_PODCAST_SEEDS,
  getSafePodcastSeeds,
  getSeedsForCategory,
} from "../data/podcastSeeds";
import {
  getBrowsablePodcastCategories,
  getPodcastCategories,
  PODCAST_ROOT_SECTIONS,
} from "../constants/podcastCategories";
import type {
  PodcastEpisode,
  PodcastMatureLevel,
  PodcastSearchResult,
  PodcastSeed,
  PodcastShow,
} from "../types/podcast";
import { isPlayablePodcastAudioUrl } from "../utils/podcastPlaybackAdapter";
import { logPodcastDiagnostic } from "../utils/podcastDiagnostics";
import { shouldIncludeMaturePodcasts } from "../utils/maturePodcastSettings";
import {
  getCachedEpisodes,
  getCachedMetadata,
  invalidateCachedEpisodes,
  invalidateCachedMetadata,
  runSingleFlight,
  setCachedEpisodes,
  setCachedMetadata,
} from "./podcast/podcastCache";
import {
  fetchRssXml,
  parseRssFeed,
  PODCAST_PAGE_SIZE,
  type ParsedRssFeed,
} from "./podcast/rssParser";
import { loadPodcastRecentlyPlayed } from "./podcastRecentlyPlayed";

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function feedUrlToShowId(feedUrl: string) {
  return `show-${hashString(feedUrl)}`;
}

export function episodeGuidToId(showId: string, guid: string) {
  return `${showId}-${hashString(guid)}`;
}

function seedToShow(seed: PodcastSeed, feed?: ParsedRssFeed | null): PodcastShow {
  const id = feedUrlToShowId(seed.feedUrl);
  return {
    id,
    title: feed?.title || seed.title,
    publisher: feed?.title || seed.title,
    description: feed?.description || "",
    artworkUrl: feed?.imageUrl || "",
    feedUrl: seed.feedUrl,
    websiteUrl: feed?.link,
    language: feed?.language || seed.language,
    country: seed.country,
    categories: [seed.category],
    emotionalWorld: seed.emotionalWorld,
    isExplicit: seed.isExplicit || Boolean(feed?.isExplicit),
    matureLevel: seed.matureLevel,
    lastEpisodeDate: feed?.episodes[0]?.pubDate,
    source: "rss",
  };
}

function mapEpisode(
  show: PodcastShow,
  seed: PodcastSeed,
  item: ParsedRssFeed["episodes"][number]
): PodcastEpisode | null {
  const audioUrl = String(item.audioUrl || "").trim();
  if (!audioUrl || !isPlayablePodcastAudioUrl(audioUrl)) {
    logPodcastDiagnostic("podcast_episode_missing_audio", {
      showId: show.id,
      title: item.title,
    });
    return null;
  }

  const matureLevel: PodcastMatureLevel =
    seed.matureLevel !== "safe"
      ? seed.matureLevel
      : item.isExplicit
      ? "explicit"
      : "safe";

  return {
    id: episodeGuidToId(show.id, item.guid),
    showId: show.id,
    showTitle: show.title,
    publisher: show.publisher,
    title: item.title,
    description: item.description,
    artworkUrl: item.imageUrl || show.artworkUrl,
    audioUrl,
    durationSeconds: item.durationSeconds,
    publishedAt: item.pubDate,
    episodeUrl: item.link,
    language: show.language,
    categories: show.categories,
    emotionalWorld: show.emotionalWorld,
    isExplicit: show.isExplicit || Boolean(item.isExplicit),
    matureLevel,
    source: "podcast_rss",
  };
}

function filterMatureShow(show: PodcastShow, includeMature: boolean) {
  if (includeMature) return true;
  return show.matureLevel === "safe";
}

function filterMatureEpisode(episode: PodcastEpisode, includeMature: boolean) {
  if (includeMature) return true;
  return episode.matureLevel === "safe";
}

export async function getPodcastShow(feedUrl: string, seed?: PodcastSeed) {
  const cacheKey = `show:${feedUrl}`;
  const cached = getCachedMetadata<PodcastShow>(cacheKey);
  if (cached) return cached;

  return runSingleFlight(cacheKey, async () => {
    const resolvedSeed =
      seed || ALL_PODCAST_SEEDS.find((entry) => entry.feedUrl === feedUrl) || null;
    if (!resolvedSeed) return null;

    const xml = await fetchRssXml(feedUrl);
    if (!xml) {
      logPodcastDiagnostic("podcast_feed_parse_failed", { feedUrl });
      return null;
    }

    const parsed = parseRssFeed(xml);
    if (!parsed) {
      logPodcastDiagnostic("podcast_feed_parse_failed", { feedUrl });
      return null;
    }

    const show = seedToShow(resolvedSeed, parsed);
    setCachedMetadata(cacheKey, show);
    setCachedEpisodes(`episodes:${show.id}`, {
      show,
      seed: resolvedSeed,
      episodes: parsed.episodes,
    });
    return show;
  });
}

export async function refreshPodcastFeed(feedUrl: string) {
  const showId = feedUrlToShowId(feedUrl);
  invalidateCachedMetadata(`show:${feedUrl}`);
  invalidateCachedEpisodes(`episodes:${showId}`);
  return getPodcastShow(feedUrl);
}

export async function getPodcastEpisodes(
  showId: string,
  options?: { offset?: number; limit?: number; includeMature?: boolean }
) {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? PODCAST_PAGE_SIZE;
  const includeMature = options?.includeMature ?? shouldIncludeMaturePodcasts();

  const seed = ALL_PODCAST_SEEDS.find((entry) => feedUrlToShowId(entry.feedUrl) === showId);
  if (!seed) return { show: null, episodes: [], hasMore: false };

  const cacheKey = `episodes:${showId}`;
  let bundle = getCachedEpisodes<{
    show: PodcastShow;
    seed: PodcastSeed;
    episodes: ParsedRssFeed["episodes"];
  }>(cacheKey);

  if (!bundle) {
    const show = await getPodcastShow(seed.feedUrl, seed);
    if (!show) return { show: null, episodes: [], hasMore: false };
    bundle = getCachedEpisodes(cacheKey) as typeof bundle;
  }

  if (!bundle) return { show: null, episodes: [], hasMore: false };

  const mapped = bundle.episodes
    .map((item) => mapEpisode(bundle.show, bundle.seed, item))
    .filter((episode): episode is PodcastEpisode => Boolean(episode))
    .filter((episode) => filterMatureEpisode(episode, includeMature));

  const page = mapped.slice(offset, offset + limit);
  return {
    show: bundle.show,
    episodes: page,
    hasMore: offset + limit < mapped.length,
    total: mapped.length,
  };
}

export async function getPodcastShowsByCategory(categoryId: string, includeMature?: boolean) {
  const mature = includeMature ?? shouldIncludeMaturePodcasts();
  const seeds = getSeedsForCategory(categoryId, mature);
  const shows = await Promise.all(
    seeds.map(async (seed) => {
      try {
        return await getPodcastShow(seed.feedUrl, seed);
      } catch {
        return null;
      }
    })
  );

  const withEpisodes = await Promise.all(
    shows.map(async (show) => {
      if (!show || !filterMatureShow(show, mature)) return null;
      const { episodes } = await getPodcastEpisodes(show.id, {
        offset: 0,
        limit: 1,
        includeMature: mature,
      });
      return episodes.length > 0 ? show : null;
    })
  );

  return withEpisodes.filter((show): show is PodcastShow => Boolean(show));
}

export function getPodcastCategoriesList(includeMature?: boolean) {
  return getPodcastCategories(includeMature ?? shouldIncludeMaturePodcasts());
}

export async function getPodcastHome(includeMature?: boolean) {
  const mature = includeMature ?? shouldIncludeMaturePodcasts();
  logPodcastDiagnostic("podcast_home_load_start");

  try {
    const seeds = getSafePodcastSeeds(mature).slice(0, 12);
    const shows = (
      await Promise.all(
        seeds.map(async (seed) => {
          try {
            return await getPodcastShow(seed.feedUrl, seed);
          } catch {
            return null;
          }
        })
      )
    ).filter((show): show is PodcastShow => Boolean(show && filterMatureShow(show, mature)));

    const playableShows = (
      await Promise.all(
        shows.map(async (show) => {
          const result = await getPodcastEpisodes(show.id, {
            offset: 0,
            limit: 1,
            includeMature: mature,
          });
          return result.episodes.length > 0 ? show : null;
        })
      )
    ).filter((show): show is PodcastShow => Boolean(show));

    const episodePairs = await Promise.all(
      playableShows.slice(0, 8).map(async (show) => {
        const result = await getPodcastEpisodes(show.id, { offset: 0, limit: 1, includeMature: mature });
        return result.episodes[0] || null;
      })
    );

    const newEpisodes = episodePairs.filter((episode): episode is PodcastEpisode => Boolean(episode));
    const recent = await loadPodcastRecentlyPlayed(8);

    const browseCategories = getBrowsablePodcastCategories(mature).filter((category) => {
      const count = getSeedsForCategory(category.id, mature).length;
      return count > 0;
    });

    const rootSections = PODCAST_ROOT_SECTIONS.filter((section) => {
      if (!mature && section.matureOnly) return false;
      if (section.matureOnly) return true;
      return section.children?.some((child) => getSeedsForCategory(child.id, mature).length > 0);
    });

    logPodcastDiagnostic("podcast_home_load_success", {
      shows: playableShows.length,
      newEpisodes: newEpisodes.length,
    });

    return {
      featured: playableShows.slice(0, 6),
      trending: [...playableShows].sort((a, b) =>
        String(b.lastEpisodeDate || "").localeCompare(String(a.lastEpisodeDate || ""))
      ).slice(0, 6),
      newEpisodes,
      popularShows: playableShows.slice(0, 8),
      recommended: playableShows.slice(2, 10),
      recentlyPlayed: recent,
      rootSections,
      browseCategories,
    };
  } catch (error) {
    logPodcastDiagnostic("podcast_home_load_failed", {
      message: String((error as Error)?.message || error),
    });
    return {
      featured: [] as PodcastShow[],
      trending: [] as PodcastShow[],
      newEpisodes: [] as PodcastEpisode[],
      popularShows: [] as PodcastShow[],
      recommended: [] as PodcastShow[],
      recentlyPlayed: [] as PodcastEpisode[],
      rootSections: getPodcastCategoriesList(mature),
      browseCategories: [] as ReturnType<typeof getBrowsablePodcastCategories>,
    };
  }
}

export async function searchPodcasts(
  query: string,
  options?: { includeMature?: boolean; limit?: number }
) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [] as PodcastSearchResult[];

  const includeMature = options?.includeMature ?? shouldIncludeMaturePodcasts();
  const limit = options?.limit ?? 20;
  const needle = trimmed.toLowerCase();
  const results: PodcastSearchResult[] = [];
  const seeds = getSafePodcastSeeds(includeMature);

  for (const seed of seeds) {
    if (results.length >= limit) break;

    const haystack = `${seed.title} ${seed.category} ${seed.language}`.toLowerCase();
    if (!haystack.includes(needle)) continue;

    const show = await getPodcastShow(seed.feedUrl, seed);
    if (!show || !filterMatureShow(show, includeMature)) continue;

    results.push({ kind: "show", show });

    const episodes = await getPodcastEpisodes(show.id, {
      offset: 0,
      limit: 3,
      includeMature,
    });

    for (const episode of episodes.episodes) {
      if (results.length >= limit) break;
      const episodeHaystack = `${episode.title} ${episode.showTitle}`.toLowerCase();
      if (episodeHaystack.includes(needle)) {
        results.push({ kind: "episode", episode, show });
      }
    }
  }

  return results;
}

export function normalizePodcastEpisodeForPlayback(episode: PodcastEpisode) {
  if (!episode.audioUrl?.trim()) return null;
  if (!isPlayablePodcastAudioUrl(episode.audioUrl)) return null;
  return episode;
}

export async function resolvePodcastShowById(showId: string) {
  const seed = ALL_PODCAST_SEEDS.find((entry) => feedUrlToShowId(entry.feedUrl) === showId);
  if (!seed) return null;
  return getPodcastShow(seed.feedUrl, seed);
}

export async function resolvePodcastEpisodeById(episodeId: string, includeMature?: boolean) {
  const mature = includeMature ?? shouldIncludeMaturePodcasts();

  for (const seed of ALL_PODCAST_SEEDS) {
    const showId = feedUrlToShowId(seed.feedUrl);
    const { episodes } = await getPodcastEpisodes(showId, {
      offset: 0,
      limit: PODCAST_PAGE_SIZE,
      includeMature: mature,
    });
    const match = episodes.find((episode) => episode.id === episodeId);
    if (match) return match;
  }

  return null;
}
