import type {
  HiddenTunesPodcastEpisode,
  HiddenTunesPodcastShow,
  PodcastEpisodesQuery,
  PodcastShowsQuery,
} from "../podcastCatalogApi";

export const ITUNES_SHOW_ID_PREFIX = "itunes-";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const MAX_ITUNES_RESULTS = 200;

const feedUrlByShowId = new Map<string, string>();

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

function parseRssItems(xml: string) {
  const items: Array<{ title: string; guid: string; audioUrl: string; publishedAt?: string }> = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const block = match[0];
    const audioUrl = extractEnclosureUrl(block);
    if (!audioUrl.startsWith("https://")) continue;
    items.push({
      title: extractTag(block, "title") || "Episode",
      guid: extractTag(block, "guid"),
      audioUrl,
      publishedAt: extractTag(block, "pubDate") || undefined,
    });
  }
  return items;
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

function mapRssEpisode(
  showId: string,
  item: { title: string; guid: string; audioUrl: string; publishedAt?: string },
  index: number
): HiddenTunesPodcastEpisode | null {
  if (!item.audioUrl.startsWith("https://")) return null;
  return {
    id: stableEpisodeId(showId, item.guid, item.title, index),
    show_id: showId,
    title: item.title,
    audio_url: item.audioUrl,
    published_at: item.publishedAt,
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
  } catch {
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
    const response = await fetch(feedUrl, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
    if (!response.ok) {
      return {
        success: false,
        episodes: [] as HiddenTunesPodcastEpisode[],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        source: "itunes-rss" as const,
      };
    }

    const xml = await response.text();
    const parsed = parseRssItems(xml);
    const episodes = parsed
      .map((item, index) => mapRssEpisode(showId, item, index))
      .filter((episode): episode is HiddenTunesPodcastEpisode => episode !== null);

    const start = (page - 1) * limit;
    const pageEpisodes = episodes.slice(start, start + limit);

    return {
      success: pageEpisodes.length > 0,
      episodes: pageEpisodes,
      pagination: {
        page,
        limit,
        total: episodes.length,
        totalPages: Math.ceil(episodes.length / limit),
        hasMore: start + limit < episodes.length,
      },
      source: "itunes-rss" as const,
    };
  } catch {
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
