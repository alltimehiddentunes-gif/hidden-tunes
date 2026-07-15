import {
  listRecentPodcastIndexFeeds,
  searchPodcastIndexFeeds,
  type PodcastIndexFeed,
} from "@/lib/podcastIndexClient";
import type { PodcastExpansionFeed } from "@/lib/podcastExpansionFeedsBatch1";
import type { PodcastSeedCategorySlug } from "@/lib/podcastSeedFeeds";
import type { PodcastCatalogKind } from "@/lib/podcastSourceRegistry";
import { cleanText } from "@/lib/tvCatalog";

const PODCAST_INDEX_CATEGORY_MAP: Record<string, PodcastSeedCategorySlug> = {
  "55": "music",
  "57": "education",
  "58": "business",
  "59": "news",
  "60": "faith",
  "61": "society-culture",
  "62": "sports",
  "63": "technology",
  "64": "comedy",
  "67": "health",
  "68": "true-crime",
  "69": "history",
  "70": "science",
};

export function mapPodcastIndexCategory(feed: PodcastIndexFeed): PodcastSeedCategorySlug {
  const categoryIds = Object.keys(feed.categories || {});
  for (const id of categoryIds) {
    const mapped = PODCAST_INDEX_CATEGORY_MAP[id];
    if (mapped) return mapped;
  }

  const haystack = Object.values(feed.categories || {})
    .map((entry) => cleanText(entry, 120)?.toLowerCase() || "")
    .join(" ");

  if (/music/.test(haystack)) return "music";
  if (/news|journalism|politics/.test(haystack)) return "news";
  if (/business|finance|invest/.test(haystack)) return "business";
  if (/tech|software|gaming/.test(haystack)) return "technology";
  if (/health|fitness|medical/.test(haystack)) return "health";
  if (/sport/.test(haystack)) return "sports";
  if (/comedy|humor/.test(haystack)) return "comedy";
  if (/history/.test(haystack)) return "history";
  if (/science/.test(haystack)) return "science";
  if (/religion|faith|spiritual/.test(haystack)) return "faith";
  if (/crime/.test(haystack)) return "true-crime";
  if (/education|learning|language/.test(haystack)) return "education";
  return "society-culture";
}

export function mapPodcastIndexFeedToExpansionFeed(
  feed: PodcastIndexFeed,
  options: { catalog: PodcastCatalogKind }
): PodcastExpansionFeed {
  const category = mapPodcastIndexCategory(feed);
  const isMature = options.catalog === "mature";

  return {
    title: cleanText(feed.title, 200) || "Podcast",
    feedUrl: cleanText(feed.url, 2000) || cleanText(feed.originalUrl, 2000) || "",
    category,
    publisher: cleanText(feed.author, 120) || cleanText(feed.ownerName, 120) || undefined,
    is_mature: isMature,
    mature_category: isMature ? "adult-lifestyle" : undefined,
    language: cleanText(feed.language, 40) || undefined,
    source_type: "podcast_index",
    source_id: String(feed.id),
  };
}

export async function discoverPodcastIndexFeedsByTerm(options: {
  query: string;
  lang?: string;
  catalog: PodcastCatalogKind;
  limit: number;
  start?: number;
}): Promise<PodcastExpansionFeed[]> {
  const perPage = Math.min(100, Math.max(1, options.limit));
  const payload = await searchPodcastIndexFeeds({
    query: options.query,
    lang: options.lang,
    max: perPage,
    start: options.start || 0,
  });

  const feeds: PodcastExpansionFeed[] = [];
  for (const feed of payload.feeds) {
    if (options.catalog === "mature" && !isMaturePodcastIndexFeed(feed)) continue;
    if (options.catalog === "standard" && isMaturePodcastIndexFeed(feed)) continue;
    feeds.push(
      mapPodcastIndexFeedToExpansionFeed(feed, {
        catalog: options.catalog,
      })
    );
    if (feeds.length >= options.limit) break;
  }

  return feeds;
}

export async function discoverRecentPodcastIndexFeeds(options: {
  catalog: PodcastCatalogKind;
  limit: number;
  since?: number;
}) {
  const payload = await listRecentPodcastIndexFeeds({
    max: Math.min(100, Math.max(1, options.limit)),
    since: options.since,
  });

  const results: Array<{ feed: PodcastExpansionFeed; since: number }> = [];

  for (const feed of payload.feeds) {
    if (options.catalog === "mature" && !isMaturePodcastIndexFeed(feed)) continue;
    if (options.catalog === "standard" && isMaturePodcastIndexFeed(feed)) continue;
    results.push({
      feed: mapPodcastIndexFeedToExpansionFeed(feed, { catalog: options.catalog }),
      since: Number(feed.newestItemPubdate || 0),
    });
    if (results.length >= options.limit) break;
  }

  return results;
}

function isMaturePodcastIndexFeed(feed: PodcastIndexFeed) {
  if (feed.explicit === true) return true;
  const haystack = [
    feed.title,
    feed.description,
    feed.author,
    ...Object.values(feed.categories || {}),
  ]
    .map((entry) => cleanText(entry, 500)?.toLowerCase() || "")
    .join(" ");
  return /\b(explicit|18\+|adult only|mature|nsfw|sex)\b/.test(haystack);
}
