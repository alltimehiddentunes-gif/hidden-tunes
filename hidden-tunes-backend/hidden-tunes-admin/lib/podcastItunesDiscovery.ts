import { cleanText } from "@/lib/tvCatalog";

import type { PodcastExpansionFeed } from "@/lib/podcastExpansionFeedsBatch1";
import type { PodcastSeedCategorySlug } from "@/lib/podcastSeedFeeds";
import { PODCAST_MATURE_ITUNES_QUERIES } from "@/lib/podcastSourceRegistry";

type ItunesPodcastResult = {
  collectionName?: string;
  artistName?: string;
  feedUrl?: string;
  primaryGenreName?: string;
  trackExplicitness?: string;
  contentAdvisoryRating?: string;
  collectionId?: number;
};

type ItunesChartEntry = {
  id?: { attributes?: { "im:id"?: string }; label?: string };
  "im:name"?: { label?: string };
  "im:artist"?: { label?: string };
};

function isExplicitItunesResult(item: ItunesPodcastResult) {
  return (
    item.trackExplicitness === "explicit" || item.contentAdvisoryRating === "Explicit"
  );
}

function mapExplicitItunesResult(
  item: ItunesPodcastResult,
  options?: { language?: string; category?: PodcastSeedCategorySlug; require_mature_subject?: boolean }
): PodcastExpansionFeed | null {
  const feedUrl = cleanText(item.feedUrl, 2000);
  const title = cleanText(item.collectionName, 200) || "Podcast";
  if (!feedUrl) return null;
  if (!isExplicitItunesResult(item)) return null;

  if (options?.require_mature_subject) {
    const genre = cleanText(item.primaryGenreName, 120) || "";
    const haystack = `${title} ${genre}`.toLowerCase();
    const falsePositive =
      /\b(adhd|maintenance phase|mind pump|fitness|yoga|nutrition|biohack|mindset mentor|joint dynamics|sober|wellbeing|wellness coach)\b/i.test(
        haystack
      );
    const matureSubject =
      /\b(sex|sexual|erotic|intimacy|intimate|kink|fetish|nsfw|18\+|after dark|adult(?:s)?(?:\s|$)|swingers?|pornog?r?a?p?h?|orgasm|bdsm|hookup|polyamor|tantra|sexting|bedroom talk|dirty talk|raunchy|spicy stories?|onlyfans|sugar dat|open relationship|queer sex|affairs?)\b/i.test(
        haystack
      ) || /sexuality/i.test(genre);
    if (falsePositive || !matureSubject) return null;
  }

  return {
    title,
    feedUrl,
    category: options?.category || "comedy",
    publisher: cleanText(item.artistName, 120) || undefined,
    is_mature: true,
    mature_category: "adult-lifestyle",
    language: options?.language,
  };
}

async function lookupItunesPodcastsByIds(options: {
  ids: string[];
  country?: string;
}) {
  const ids = options.ids.filter(Boolean);
  if (ids.length === 0) return [] as ItunesPodcastResult[];

  const results: ItunesPodcastResult[] = [];
  for (let index = 0; index < ids.length; index += 40) {
    const chunk = ids.slice(index, index + 40);
    const url = new URL("https://itunes.apple.com/lookup");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("entity", "podcast");
    if (options.country) url.searchParams.set("country", options.country.toUpperCase());

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) continue;
    const payload = (await response.json()) as { results?: ItunesPodcastResult[] };
    results.push(...(payload.results || []));
  }
  return results;
}

/** Apple Podcasts chart discovery for mature genre storefronts (public RSS JSON). */
export async function discoverMaturePodcastFeedsFromItunesGenreChart(options: {
  country: string;
  genre_id: string;
  limit?: number;
}) {
  const target = Math.max(1, Number(options.limit || 100));
  const country = options.country.toLowerCase();
  const genreId = cleanText(options.genre_id, 20) || "1512";
  const chartUrl = `https://itunes.apple.com/${country}/rss/toppodcasts/limit=100/genre=${genreId}/json`;

  const response = await fetch(chartUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return [] as PodcastExpansionFeed[];

  let payload: {
    feed?: { entry?: ItunesChartEntry | ItunesChartEntry[] };
  };
  try {
    payload = (await response.json()) as {
      feed?: { entry?: ItunesChartEntry | ItunesChartEntry[] };
    };
  } catch {
    return [] as PodcastExpansionFeed[];
  }
  const entries = Array.isArray(payload.feed?.entry)
    ? payload.feed.entry
    : payload.feed?.entry
      ? [payload.feed.entry]
      : [];

  const ids = entries
    .map((entry) => cleanText(entry.id?.attributes?.["im:id"], 40) || "")
    .filter(Boolean);

  const lookup = await lookupItunesPodcastsByIds({
    ids,
    country: options.country,
  });

  const discovered: PodcastExpansionFeed[] = [];
  const seen = new Set<string>();
  for (const item of lookup) {
    const mapped = mapExplicitItunesResult(item, { require_mature_subject: true });
    if (!mapped) continue;
    const key = mapped.feedUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    discovered.push(mapped);
    if (discovered.length >= target) break;
  }
  return discovered;
}

const CATEGORY_QUERIES: Array<{ category: PodcastSeedCategorySlug; query: string }> = [
  { category: "music", query: "music podcast" },
  { category: "news", query: "news podcast" },
  { category: "comedy", query: "comedy podcast" },
  { category: "society-culture", query: "culture podcast" },
  { category: "education", query: "education podcast" },
  { category: "technology", query: "technology podcast" },
  { category: "business", query: "business podcast" },
  { category: "health", query: "health podcast" },
  { category: "sports", query: "sports podcast" },
  { category: "true-crime", query: "true crime podcast" },
  { category: "science", query: "science podcast" },
  { category: "history", query: "history podcast" },
  { category: "faith", query: "faith podcast" },
  { category: "society-culture", query: "interview podcast" },
  { category: "education", query: "learning podcast" },
  { category: "business", query: "entrepreneur podcast" },
  { category: "technology", query: "software podcast" },
  { category: "health", query: "wellness podcast" },
  { category: "sports", query: "football podcast" },
  { category: "comedy", query: "humor podcast" },
];

const EXPANSION_QUERY_TERMS: Array<{ category: PodcastSeedCategorySlug; query: string }> = [
  { category: "business", query: "startup podcast" },
  { category: "business", query: "finance podcast" },
  { category: "business", query: "marketing podcast" },
  { category: "business", query: "leadership podcast" },
  { category: "business", query: "investing podcast" },
  { category: "education", query: "history podcast" },
  { category: "education", query: "science podcast" },
  { category: "education", query: "language podcast" },
  { category: "education", query: "college podcast" },
  { category: "education", query: "teaching podcast" },
  { category: "technology", query: "AI podcast" },
  { category: "technology", query: "cybersecurity podcast" },
  { category: "technology", query: "programming podcast" },
  { category: "technology", query: "gadget podcast" },
  { category: "technology", query: "tech news podcast" },
  { category: "health", query: "fitness podcast" },
  { category: "health", query: "nutrition podcast" },
  { category: "health", query: "mental health podcast" },
  { category: "health", query: "medical podcast" },
  { category: "health", query: "doctor podcast" },
  { category: "news", query: "politics podcast" },
  { category: "news", query: "world news podcast" },
  { category: "news", query: "daily news podcast" },
  { category: "news", query: "journalism podcast" },
  { category: "sports", query: "basketball podcast" },
  { category: "sports", query: "soccer podcast" },
  { category: "sports", query: "baseball podcast" },
  { category: "sports", query: "nfl podcast" },
  { category: "sports", query: "sports talk podcast" },
  { category: "music", query: "rock podcast" },
  { category: "music", query: "hip hop podcast" },
  { category: "music", query: "classical podcast" },
  { category: "music", query: "songwriting podcast" },
  { category: "society-culture", query: "relationship podcast" },
  { category: "society-culture", query: "storytelling podcast" },
  { category: "society-culture", query: "documentary podcast" },
  { category: "society-culture", query: "philosophy podcast" },
  { category: "comedy", query: "standup podcast" },
  { category: "comedy", query: "improv podcast" },
  { category: "true-crime", query: "murder podcast" },
  { category: "true-crime", query: "detective podcast" },
  { category: "true-crime", query: "investigation podcast" },
  { category: "science", query: "space podcast" },
  { category: "science", query: "biology podcast" },
  { category: "science", query: "physics podcast" },
  { category: "science", query: "climate podcast" },
  { category: "history", query: "ancient history podcast" },
  { category: "history", query: "military history podcast" },
  { category: "history", query: "world war podcast" },
  { category: "faith", query: "christian podcast" },
  { category: "faith", query: "bible podcast" },
  { category: "faith", query: "spirituality podcast" },
  { category: "news", query: "economy podcast" },
  { category: "business", query: "real estate podcast" },
  { category: "technology", query: "gaming podcast" },
  { category: "health", query: "yoga podcast" },
  { category: "sports", query: "golf podcast" },
  { category: "music", query: "jazz podcast" },
  { category: "society-culture", query: "travel podcast" },
  { category: "education", query: "book podcast" },
  { category: "comedy", query: "sketch podcast" },
  { category: "true-crime", query: "missing persons podcast" },
];

function buildQueryList(batch = 1) {
  const combined = [...CATEGORY_QUERIES, ...EXPANSION_QUERY_TERMS];
  const rotate = ((batch - 1) * 7) % combined.length;
  return [...combined.slice(rotate), ...combined.slice(0, rotate)];
}

export async function discoverPodcastFeedsFromItunes(options?: {
  limit?: number;
  per_query?: number;
  offsets?: number[];
  batch?: number;
  query?: string;
  language?: string;
  country?: string;
}) {
  const target = Math.max(1, Number(options?.limit || 120));
  const perQuery = Math.min(200, Math.max(5, Number(options?.per_query || 100)));
  const offsets = options?.offsets?.length ? options.offsets : [0, 100];
  const queries = options?.query
    ? [{ category: "news" as PodcastSeedCategorySlug, query: options.query }]
    : buildQueryList(options?.batch || 1);
  const discovered: PodcastExpansionFeed[] = [];
  const seen = new Set<string>();

  for (const entry of queries) {
    if (discovered.length >= target) break;

    for (const offset of offsets) {
      if (discovered.length >= target) break;

      const url = new URL("https://itunes.apple.com/search");
      url.searchParams.set("term", entry.query);
      url.searchParams.set("media", "podcast");
      url.searchParams.set("entity", "podcast");
      url.searchParams.set("limit", String(perQuery));
      if (offset > 0) url.searchParams.set("offset", String(offset));
      if (options?.country) {
        url.searchParams.set("country", options.country.toUpperCase());
      }

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) continue;

      const payload = (await response.json()) as { results?: ItunesPodcastResult[] };
      for (const item of payload.results || []) {
        const feedUrl = cleanText(item.feedUrl, 2000);
        const title = cleanText(item.collectionName, 200) || "Podcast";
        if (!feedUrl) continue;
        const explicit =
          item.trackExplicitness === "explicit" ||
          item.contentAdvisoryRating === "Explicit";
        if (explicit) continue;
        const key = feedUrl.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        discovered.push({
          title,
          feedUrl,
          category: entry.category,
          publisher: cleanText(item.artistName, 120) || undefined,
          is_mature: false,
          language: options?.language,
        });

        if (discovered.length >= target) break;
      }
    }
  }

  return discovered;
}

export async function discoverMaturePodcastFeedsFromItunes(options?: {
  limit?: number;
  per_query?: number;
  offsets?: number[];
  query?: string;
  language?: string;
  country?: string;
}) {
  const target = Math.max(1, Number(options?.limit || 120));
  const perQuery = Math.min(200, Math.max(5, Number(options?.per_query || 100)));
  const offsets = options?.offsets?.length ? options.offsets : [0, 100];
  const queryText = cleanText(options?.query, 200) || "";

  if (queryText.startsWith("__genre_chart:")) {
    const genreId = queryText.slice("__genre_chart:".length).trim() || "1512";
    return discoverMaturePodcastFeedsFromItunesGenreChart({
      country: options?.country || "US",
      genre_id: genreId,
      limit: target,
    });
  }

  const queries = options?.query
    ? [{ category: "comedy" as PodcastSeedCategorySlug, query: options.query }]
    : PODCAST_MATURE_ITUNES_QUERIES.map((query) => ({
        category: "comedy" as PodcastSeedCategorySlug,
        query,
      }));
  const discovered: PodcastExpansionFeed[] = [];
  const seen = new Set<string>();

  for (const entry of queries) {
    if (discovered.length >= target) break;

    for (const offset of offsets) {
      if (discovered.length >= target) break;

      const url = new URL("https://itunes.apple.com/search");
      url.searchParams.set("term", entry.query);
      url.searchParams.set("media", "podcast");
      url.searchParams.set("entity", "podcast");
      url.searchParams.set("limit", String(perQuery));
      if (offset > 0) url.searchParams.set("offset", String(offset));
      if (options?.country) {
        url.searchParams.set("country", options.country.toUpperCase());
      }

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) continue;

      const payload = (await response.json()) as { results?: ItunesPodcastResult[] };
      for (const item of payload.results || []) {
        const mapped = mapExplicitItunesResult(item, {
          language: options?.language,
          category: entry.category,
        });
        if (!mapped) continue;
        const key = mapped.feedUrl.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        discovered.push(mapped);
        if (discovered.length >= target) break;
      }
    }
  }

  // Supplement term search with Apple Sexuality chart only (extra chart hops were too slow).
  if (discovered.length < target && options?.country) {
    const chartFeeds = await discoverMaturePodcastFeedsFromItunesGenreChart({
      country: options.country,
      genre_id: "1512",
      limit: target,
    });
    for (const feed of chartFeeds) {
      const key = feed.feedUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      discovered.push(feed);
      if (discovered.length >= target) break;
    }
  }

  return discovered;
}
