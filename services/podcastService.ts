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
import { fetchRssXml, parseRssFeed, type ParsedRssFeed } from "./podcast/rssParser";
import { loadPodcastRecentlyPlayed } from "./podcastRecentlyPlayed";

export const ENABLE_PODCAST_RSS_HOME_LOADING = false;
export const PODCAST_SHOW_EPISODE_LIMIT = 10;
export const PODCAST_FEED_TIMEOUT_MS = 5000;

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

function seedToStaticShow(seed: PodcastSeed): PodcastShow {
  return {
    id: feedUrlToShowId(seed.feedUrl),
    title: seed.title,
    publisher: seed.title,
    description: "",
    artworkUrl: "",
    feedUrl: seed.feedUrl,
    language: seed.language,
    country: seed.country,
    categories: [seed.category],
    emotionalWorld: seed.emotionalWorld,
    isExplicit: seed.isExplicit,
    matureLevel: seed.matureLevel,
    source: "rss",
  };
}

function seedToShow(seed: PodcastSeed, feed?: ParsedRssFeed | null): PodcastShow {
  const base = seedToStaticShow(seed);
  if (!feed) return base;

  return {
    ...base,
    title: feed.title || base.title,
    publisher: feed.title || base.publisher,
    description: feed.description || base.description,
    artworkUrl: feed.imageUrl || base.artworkUrl,
    websiteUrl: feed.link,
    language: feed.language || base.language,
    isExplicit: seed.isExplicit || Boolean(feed.isExplicit),
    lastEpisodeDate: feed.episodes[0]?.pubDate,
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

export function getStaticPodcastShow(showId: string): PodcastShow | null {
  const seed = ALL_PODCAST_SEEDS.find((entry) => feedUrlToShowId(entry.feedUrl) === showId);
  if (!seed) return null;
  return seedToStaticShow(seed);
}

function findSeedByShowId(showId: string) {
  return ALL_PODCAST_SEEDS.find((entry) => feedUrlToShowId(entry.feedUrl) === showId) || null;
}

async function fetchShowFeedFromRss(seed: PodcastSeed, showId: string) {
  logPodcastDiagnostic("podcast_show_feed_load_start", { showId, feedUrl: seed.feedUrl });

  const cacheKey = `show:${seed.feedUrl}`;
  const cached = getCachedMetadata<PodcastShow>(cacheKey);
  if (cached) {
    logPodcastDiagnostic("podcast_show_feed_load_success", { showId, cached: true });
    return cached;
  }

  return runSingleFlight(cacheKey, async () => {
    const xml = await fetchRssXml(seed.feedUrl, PODCAST_FEED_TIMEOUT_MS);
    if (!xml) {
      logPodcastDiagnostic("podcast_show_feed_timeout", { showId });
      logPodcastDiagnostic("podcast_show_feed_load_failed", { showId, reason: "timeout_or_fetch" });
      return null;
    }

    const parsed = parseRssFeed(xml, PODCAST_SHOW_EPISODE_LIMIT);
    if (!parsed) {
      logPodcastDiagnostic("podcast_feed_parse_failed", { feedUrl: seed.feedUrl });
      logPodcastDiagnostic("podcast_show_feed_load_failed", { showId, reason: "parse" });
      return null;
    }

    const show = seedToShow(seed, parsed);
    setCachedMetadata(cacheKey, show);
    setCachedEpisodes(`episodes:${show.id}`, {
      show,
      seed,
      episodes: parsed.episodes,
    });
    logPodcastDiagnostic("podcast_show_feed_load_success", { showId, episodeCount: parsed.episodes.length });
    return show;
  });
}

export async function refreshPodcastFeed(feedUrl: string) {
  const showId = feedUrlToShowId(feedUrl);
  invalidateCachedMetadata(`show:${feedUrl}`);
  invalidateCachedEpisodes(`episodes:${showId}`);
  const seed = ALL_PODCAST_SEEDS.find((entry) => entry.feedUrl === feedUrl);
  if (!seed) return null;
  return fetchShowFeedFromRss(seed, showId);
}

export async function getPodcastEpisodes(
  showId: string,
  options?: { offset?: number; limit?: number; includeMature?: boolean }
) {
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? PODCAST_SHOW_EPISODE_LIMIT;
  const includeMature = options?.includeMature ?? shouldIncludeMaturePodcasts();

  const seed = findSeedByShowId(showId);
  if (!seed) return { show: null, episodes: [], hasMore: false, error: "unavailable" as const };

  if (!includeMature && seed.matureLevel !== "safe") {
    return { show: null, episodes: [], hasMore: false, error: "mature_blocked" as const };
  }

  const cacheKey = `episodes:${showId}`;
  let bundle = getCachedEpisodes<{
    show: PodcastShow;
    seed: PodcastSeed;
    episodes: ParsedRssFeed["episodes"];
  }>(cacheKey);

  if (!bundle) {
    const show = await fetchShowFeedFromRss(seed, showId);
    if (!show) {
      return { show: getStaticPodcastShow(showId), episodes: [], hasMore: false, error: "unavailable" as const };
    }
    bundle = getCachedEpisodes(cacheKey) as typeof bundle;
  }

  if (!bundle) {
    return { show: getStaticPodcastShow(showId), episodes: [], hasMore: false, error: "unavailable" as const };
  }

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
    error: undefined as undefined,
  };
}

export function getPodcastShowsByCategory(categoryId: string, includeMature?: boolean) {
  const mature = includeMature ?? shouldIncludeMaturePodcasts();
  return getSeedsForCategory(categoryId, mature)
    .map(seedToStaticShow)
    .filter((show) => filterMatureShow(show, mature));
}

export function getPodcastCategoriesList(includeMature?: boolean) {
  return getPodcastCategories(includeMature ?? shouldIncludeMaturePodcasts());
}

export function buildStaticPodcastHomeSync(includeMature?: boolean) {
  const mature = includeMature ?? shouldIncludeMaturePodcasts();
  logPodcastDiagnostic("podcast_static_home_rendered");
  if (!ENABLE_PODCAST_RSS_HOME_LOADING) {
    logPodcastDiagnostic("podcast_home_rss_disabled");
  }

  const seeds = getSafePodcastSeeds(mature);
  const shows = seeds.map(seedToStaticShow).filter((show) => filterMatureShow(show, mature));

  const browseCategories = getBrowsablePodcastCategories(mature).filter((category) => {
    return getSeedsForCategory(category.id, mature).length > 0;
  });

  const rootSections = PODCAST_ROOT_SECTIONS.filter((section) => {
    if (!mature && section.matureOnly) return false;
    if (section.matureOnly) return true;
    return section.children?.some((child) => getSeedsForCategory(child.id, mature).length > 0);
  });

  return {
    featured: shows.slice(0, 6),
    trending: shows.slice(0, 6),
    newEpisodes: [] as PodcastEpisode[],
    popularShows: shows.slice(0, 8),
    recommended: shows.slice(2, 10),
    recentlyPlayed: [] as PodcastEpisode[],
    rootSections,
    browseCategories,
  };
}

export async function getStaticPodcastHomeFromSeeds(includeMature?: boolean) {
  const home = buildStaticPodcastHomeSync(includeMature);
  const recent = await loadPodcastRecentlyPlayed(8);
  return {
    ...home,
    recentlyPlayed: recent,
  };
}

export async function getPodcastHome(includeMature?: boolean) {
  if (!ENABLE_PODCAST_RSS_HOME_LOADING) {
    return getStaticPodcastHomeFromSeeds(includeMature);
  }

  logPodcastDiagnostic("podcast_home_load_start");
  try {
    return await getStaticPodcastHomeFromSeeds(includeMature);
  } catch (error) {
    logPodcastDiagnostic("podcast_home_load_failed", {
      message: String((error as Error)?.message || error),
    });
    return getStaticPodcastHomeFromSeeds(includeMature);
  }
}

export function searchPodcasts(
  query: string,
  options?: { includeMature?: boolean; limit?: number }
) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [] as PodcastSearchResult[];

  const includeMature = options?.includeMature ?? shouldIncludeMaturePodcasts();
  const limit = options?.limit ?? 20;
  const needle = trimmed.toLowerCase();
  const results: PodcastSearchResult[] = [];

  for (const seed of getSafePodcastSeeds(includeMature)) {
    if (results.length >= limit) break;

    const haystack = `${seed.title} ${seed.category} ${seed.language}`.toLowerCase();
    if (!haystack.includes(needle)) continue;

    const show = seedToStaticShow(seed);
    if (!filterMatureShow(show, includeMature)) continue;

    results.push({ kind: "show", show });
  }

  return results;
}

export function normalizePodcastEpisodeForPlayback(episode: PodcastEpisode) {
  if (!episode.audioUrl?.trim()) return null;
  if (!isPlayablePodcastAudioUrl(episode.audioUrl)) return null;
  return episode;
}

export function resolvePodcastShowById(showId: string) {
  return getStaticPodcastShow(showId);
}

export async function resolvePodcastEpisodeById(episodeId: string, includeMature?: boolean) {
  const mature = includeMature ?? shouldIncludeMaturePodcasts();

  const seed = ALL_PODCAST_SEEDS.find((entry) => {
    const showId = feedUrlToShowId(entry.feedUrl);
    return episodeId.startsWith(`${showId}-`);
  });

  if (!seed) return null;

  const showId = feedUrlToShowId(seed.feedUrl);
  const { episodes } = await getPodcastEpisodes(showId, {
    offset: 0,
    limit: PODCAST_SHOW_EPISODE_LIMIT,
    includeMature: mature,
  });

  return episodes.find((episode) => episode.id === episodeId) || null;
}

/** @deprecated RSS show fetch — use getStaticPodcastShow + getPodcastEpisodes */
export async function getPodcastShow(feedUrl: string, seed?: PodcastSeed) {
  const resolvedSeed =
    seed || ALL_PODCAST_SEEDS.find((entry) => entry.feedUrl === feedUrl) || null;
  if (!resolvedSeed) return null;
  const showId = feedUrlToShowId(feedUrl);
  return fetchShowFeedFromRss(resolvedSeed, showId);
}
