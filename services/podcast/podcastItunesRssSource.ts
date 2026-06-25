import type {
  HiddenTunesPodcastEpisode,
  HiddenTunesPodcastShow,
  PodcastEpisodesQuery,
  PodcastShowsQuery,
} from "../podcastCatalogApi";

export const ITUNES_SHOW_ID_PREFIX = "itunes-";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const MAX_ITUNES_RESULTS = 200;

/** Cap RSS item scan depth — parse only what the current page needs. */
const RSS_PARSE_BUFFER_ITEMS = 8;

const feedUrlByShowId = new Map<string, string>();

type RssEpisodeCacheEntry = {
  episodes: HiddenTunesPodcastEpisode[];
  feedFullyScanned: boolean;
};

const rssEpisodeCache = new Map<string, RssEpisodeCacheEntry>();
const rssInflightByShowId = new Map<string, Promise<RssEpisodeCacheEntry>>();

export function isItunesPodcastShowId(showId: string) {
  return String(showId || "").startsWith(ITUNES_SHOW_ID_PREFIX);
}

export function registerPodcastFeedUrl(showId: string, feedUrl: string) {
  const id = String(showId || "").trim();
  const url = String(feedUrl || "").trim();
  if (id && url) feedUrlByShowId.set(id, url);
}

export function resolvePodcastFeedUrl(showId: string) {
  return feedUrlByShowId.get(String(showId || "").trim()) || null;
}

export function clearRssEpisodeCacheForShow(showId?: string) {
  if (showId) {
    rssEpisodeCache.delete(String(showId).trim());
    rssInflightByShowId.delete(String(showId).trim());
    return;
  }
  rssEpisodeCache.clear();
  rssInflightByShowId.clear();
}

function buildItunesShowId(collectionId: number | string) {
  return `${ITUNES_SHOW_ID_PREFIX}${collectionId}`;
}

function extractTag(block: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").trim();
}

function extractEnclosureUrl(block: string) {
  const match = block.match(/<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
  return match ? match[1].trim().replace(/&amp;/g, "&") : "";
}

function stableEpisodeId(showId: string, guid: string, title: string, index: number) {
  const seed = `${showId}:${guid || title}:${index}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `${showId}-ep-${hash.toString(16)}`;
}

function parseRssItemBlock(
  showId: string,
  block: string,
  index: number
): HiddenTunesPodcastEpisode | null {
  const audioUrl = extractEnclosureUrl(block);
  if (!audioUrl.startsWith("https://")) return null;

  const title = extractTag(block, "title") || "Episode";
  const guid = extractTag(block, "guid");
  return {
    id: stableEpisodeId(showId, guid, title, index),
    show_id: showId,
    title,
    audio_url: audioUrl,
    published_at: extractTag(block, "pubDate") || undefined,
    sourceName: "Hidden Tunes",
  };
}

function parseRssItemsUpTo(showId: string, xml: string, maxPlayableItems: number) {
  const episodes: HiddenTunesPodcastEpisode[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null = null;
  let itemIndex = 0;

  while ((match = re.exec(xml))) {
    const episode = parseRssItemBlock(showId, match[0], itemIndex);
    itemIndex += 1;
    if (!episode) continue;

    episodes.push(episode);
    if (episodes.length >= maxPlayableItems) {
      return { episodes, feedFullyScanned: false };
    }
  }

  return { episodes, feedFullyScanned: true };
}

async function loadRssEpisodesForShow(
  showId: string,
  feedUrl: string,
  minPlayableItems: number,
  signal?: AbortSignal
): Promise<RssEpisodeCacheEntry> {
  const existing = rssEpisodeCache.get(showId);
  if (existing && (existing.feedFullyScanned || existing.episodes.length >= minPlayableItems)) {
    return existing;
  }

  const inflight = rssInflightByShowId.get(showId);
  if (inflight) return inflight;

  const promise = (async () => {
    const response = await fetch(feedUrl, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal,
    });

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (!response.ok) {
      return { episodes: [] as HiddenTunesPodcastEpisode[], feedFullyScanned: true };
    }

    const xml = await response.text();

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const priorCount = existing?.episodes.length || 0;
    const target = Math.max(minPlayableItems, priorCount);
    const parsed = parseRssItemsUpTo(showId, xml, target + RSS_PARSE_BUFFER_ITEMS);

    const entry: RssEpisodeCacheEntry = {
      episodes: parsed.episodes,
      feedFullyScanned: parsed.feedFullyScanned,
    };

    rssEpisodeCache.set(showId, entry);
    return entry;
  })();

  rssInflightByShowId.set(showId, promise);

  try {
    return await promise;
  } finally {
    rssInflightByShowId.delete(showId);
  }
}

function buildItunesSearchTerm(query: PodcastShowsQuery) {
  if (query.q?.trim()) {
    const term = query.q.trim();
    return term.toLowerCase().includes("podcast") ? term : `${term} podcast`;
  }
  if (query.category?.trim()) {
    return `${query.category.trim()} podcast`;
  }
  if (query.collection === "trending") return "trending podcasts";
  if (query.collection === "popular") return "popular podcasts";
  if (query.collection === "featured" || query.is_featured) return "top podcasts";
  if (query.collection === "new-releases" || query.collection === "new-this-week") {
    return "new podcast episodes";
  }
  return "podcast";
}

type ItunesPodcastResult = {
  collectionId: number;
  collectionName: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  genres?: string[];
  trackCount?: number;
  releaseDate?: string;
  description?: string;
};

async function searchItunesPodcasts(term: string, limit: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    term,
    media: "podcast",
    entity: "podcast",
    limit: String(Math.min(limit, MAX_ITUNES_RESULTS)),
  });

  const response = await fetch(`${ITUNES_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as { results?: ItunesPodcastResult[] };
  return Array.isArray(payload.results) ? payload.results : [];
}

function mapItunesShow(raw: ItunesPodcastResult): HiddenTunesPodcastShow | null {
  if (!raw.collectionId || !raw.collectionName || !raw.feedUrl) return null;

  const id = buildItunesShowId(raw.collectionId);
  registerPodcastFeedUrl(id, raw.feedUrl);

  return {
    id,
    slug: id,
    title: raw.collectionName,
    description: raw.description,
    artwork_url: raw.artworkUrl600 || raw.artworkUrl100,
    host_name: raw.artistName,
    primary_category: raw.primaryGenreName,
    categories: raw.genres || (raw.primaryGenreName ? [raw.primaryGenreName] : []),
    episode_count: raw.trackCount,
    last_published_at: raw.releaseDate,
    sourceName: "Hidden Tunes",
  };
}

export async function fetchItunesPodcastShows(query: PodcastShowsQuery = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(query.limit || 40)));
  const term = buildItunesSearchTerm(query);

  try {
    const results = await searchItunesPodcasts(
      term,
      Math.min(page * limit, MAX_ITUNES_RESULTS),
      query.signal
    );
    const shows = results
      .map(mapItunesShow)
      .filter((show): show is HiddenTunesPodcastShow => show !== null);

    const start = (page - 1) * limit;
    const pageShows = shows.slice(start, start + limit);

    return {
      success: pageShows.length > 0,
      shows: pageShows,
      pagination: {
        page,
        limit,
        total: shows.length,
        totalPages: Math.ceil(shows.length / limit),
        hasMore: start + limit < shows.length,
      },
      source: "itunes" as const,
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    return {
      success: false,
      shows: [] as HiddenTunesPodcastShow[],
      pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      source: "itunes" as const,
    };
  }
}

export async function fetchItunesPodcastEpisodes(query: PodcastEpisodesQuery = {}) {
  const showId = String(query.show_id || "").trim();
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(query.limit || 40)));
  const signal = query.signal;

  const feedUrl = resolvePodcastFeedUrl(showId);
  if (!feedUrl) {
    return {
      success: false,
      episodes: [] as HiddenTunesPodcastEpisode[],
      pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      source: "itunes-rss" as const,
    };
  }

  try {
    const minNeeded = page * limit;
    const cacheEntry = await loadRssEpisodesForShow(showId, feedUrl, minNeeded, signal);

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const start = (page - 1) * limit;
    const pageEpisodes = cacheEntry.episodes.slice(start, start + limit);
    const total = cacheEntry.episodes.length;
    const hasMore =
      start + limit < total ||
      (!cacheEntry.feedFullyScanned && pageEpisodes.length >= limit);

    return {
      success: pageEpisodes.length > 0,
      episodes: pageEpisodes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore,
      },
      source: "itunes-rss" as const,
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    return {
      success: false,
      episodes: [] as HiddenTunesPodcastEpisode[],
      pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      source: "itunes-rss" as const,
    };
  }
}

export async function probeItunesPodcastPipeline() {
  const shows = await fetchItunesPodcastShows({ q: "love podcast", page: 1, limit: 5 });
  const firstShow = shows.shows[0];
  if (!firstShow) return { shows, episodes: null };

  const episodes = await fetchItunesPodcastEpisodes({
    show_id: firstShow.id,
    page: 1,
    limit: 5,
  });

  return { shows, episodes, firstShow };
}
