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
};

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
      if (options?.language) {
        url.searchParams.set("country", options.language.slice(0, 2).toUpperCase());
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
}) {
  const target = Math.max(1, Number(options?.limit || 120));
  const perQuery = Math.min(200, Math.max(5, Number(options?.per_query || 100)));
  const offsets = options?.offsets?.length ? options.offsets : [0, 100];
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
      if (options?.language) {
        url.searchParams.set("country", options.language.slice(0, 2).toUpperCase());
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
        if (!explicit) continue;
        const key = feedUrl.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        discovered.push({
          title,
          feedUrl,
          category: entry.category,
          publisher: cleanText(item.artistName, 120) || undefined,
          is_mature: true,
          mature_category: "adult-lifestyle",
          language: options?.language,
        });

        if (discovered.length >= target) break;
      }
    }
  }

  return discovered;
}
