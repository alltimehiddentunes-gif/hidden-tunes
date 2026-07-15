import type { PodcastExpansionFeed } from "@/lib/podcastExpansionFeedsBatch1";
import {
  discoverMaturePodcastFeedsFromItunes,
  discoverPodcastFeedsFromItunes,
} from "@/lib/podcastItunesDiscovery";
import {
  discoverPodcastIndexFeedsByTerm,
  discoverRecentPodcastIndexFeeds,
} from "@/lib/podcastIndexDiscovery";
import type { PodcastCatalogKind, PodcastSourceRegistryEntry } from "@/lib/podcastSourceRegistry";
import {
  formatSourceCursor,
  parseSourceCursor,
  PODCAST_EXPANSION_LANGUAGES,
  PODCAST_MATURE_INDEX_QUERIES,
  PODCAST_MATURE_ITUNES_QUERIES,
  PODCAST_STANDARD_INDEX_QUERIES,
  PODCAST_STANDARD_ITUNES_QUERIES,
} from "@/lib/podcastSourceRegistry";

export type PodcastDiscoveryResult = {
  feeds: PodcastExpansionFeed[];
  next_cursor: string;
  exhausted: boolean;
  query_used: string | null;
  language_used: string | null;
};

function queriesForSource(source: PodcastSourceRegistryEntry) {
  if (source.source_key.startsWith("podcast_index:")) {
    return source.catalog === "mature"
      ? PODCAST_MATURE_INDEX_QUERIES
      : PODCAST_STANDARD_INDEX_QUERIES;
  }
  return source.catalog === "mature"
    ? PODCAST_MATURE_ITUNES_QUERIES
    : PODCAST_STANDARD_ITUNES_QUERIES;
}

async function discoverFromItunes(
  source: PodcastSourceRegistryEntry,
  limit: number
): Promise<PodcastDiscoveryResult> {
  const queries = queriesForSource(source);
  const cursor = parseSourceCursor(source.checkpoint_cursor || "0:0:0");
  const query = queries[cursor.queryIndex % queries.length] || queries[0];
  const language = PODCAST_EXPANSION_LANGUAGES[cursor.languageIndex % PODCAST_EXPANSION_LANGUAGES.length];

  const discover =
    source.catalog === "mature"
      ? discoverMaturePodcastFeedsFromItunes
      : discoverPodcastFeedsFromItunes;

  const feeds = await discover({
    limit,
    per_query: 100,
    offsets: [cursor.offset, cursor.offset + 100, cursor.offset + 200],
    query,
    language,
  });

  let nextQueryIndex = cursor.queryIndex;
  let nextLanguageIndex = cursor.languageIndex;
  let nextOffset = cursor.offset + 300;
  let exhausted = false;

  if (feeds.length === 0) {
    nextOffset = 0;
    nextQueryIndex += 1;
    if (nextQueryIndex >= queries.length) {
      nextQueryIndex = 0;
      nextLanguageIndex += 1;
      if (nextLanguageIndex >= PODCAST_EXPANSION_LANGUAGES.length) {
        exhausted = true;
      }
    }
  }

  return {
    feeds,
    next_cursor: formatSourceCursor({
      queryIndex: nextQueryIndex,
      languageIndex: nextLanguageIndex,
      offset: nextOffset,
    }),
    exhausted,
    query_used: query,
    language_used: language,
  };
}

async function discoverFromPodcastIndexByTerm(
  source: PodcastSourceRegistryEntry,
  limit: number
): Promise<PodcastDiscoveryResult> {
  const queries = queriesForSource(source);
  const cursor = parseSourceCursor(source.checkpoint_cursor || "0:0:0");
  const query = queries[cursor.queryIndex % queries.length] || queries[0];
  const language = PODCAST_EXPANSION_LANGUAGES[cursor.languageIndex % PODCAST_EXPANSION_LANGUAGES.length];

  const feeds = await discoverPodcastIndexFeedsByTerm({
    query,
    lang: language,
    catalog: source.catalog,
    limit,
    start: cursor.offset,
  });

  let nextQueryIndex = cursor.queryIndex;
  let nextLanguageIndex = cursor.languageIndex;
  let nextOffset = cursor.offset + feeds.length;
  let exhausted = false;

  if (feeds.length === 0) {
    nextOffset = 0;
    nextQueryIndex += 1;
    if (nextQueryIndex >= queries.length) {
      nextQueryIndex = 0;
      nextLanguageIndex += 1;
      if (nextLanguageIndex >= PODCAST_EXPANSION_LANGUAGES.length) {
        exhausted = true;
      }
    }
  }

  return {
    feeds,
    next_cursor: formatSourceCursor({
      queryIndex: nextQueryIndex,
      languageIndex: nextLanguageIndex,
      offset: nextOffset,
    }),
    exhausted,
    query_used: query,
    language_used: language,
  };
}

async function discoverFromPodcastIndexRecent(
  source: PodcastSourceRegistryEntry,
  limit: number
): Promise<PodcastDiscoveryResult> {
  const since = Math.max(0, Number(source.checkpoint_cursor || 0));
  const feeds = await discoverRecentPodcastIndexFeeds({
    catalog: source.catalog,
    limit,
    since,
  });

  const newestSince =
    feeds.reduce((max, feed) => Math.max(max, feed.since || 0), since) || since;

  return {
    feeds: feeds.map((entry) => entry.feed),
    next_cursor: String(newestSince > since ? newestSince : since + 1),
    exhausted: feeds.length === 0 && since > 0,
    query_used: "recent",
    language_used: null,
  };
}

export async function discoverPodcastFeedsForSource(
  source: PodcastSourceRegistryEntry,
  limit: number
): Promise<PodcastDiscoveryResult> {
  if (source.source_key.startsWith("podcast_index:recent:")) {
    return discoverFromPodcastIndexRecent(source, limit);
  }
  if (source.source_key.startsWith("podcast_index:")) {
    return discoverFromPodcastIndexByTerm(source, limit);
  }
  return discoverFromItunes(source, limit);
}

export function pickCatalogForBatch(
  remaining: { standard: number; mature: number },
  batchNumber: number
): PodcastCatalogKind {
  if (remaining.standard <= 0 && remaining.mature <= 0) {
    return "standard";
  }
  if (remaining.standard <= 0) return "mature";
  if (remaining.mature <= 0) return "standard";

  if (remaining.standard >= remaining.mature * 2) return "standard";
  if (remaining.mature >= remaining.standard) return "mature";
  return batchNumber % 2 === 0 ? "standard" : "mature";
}
