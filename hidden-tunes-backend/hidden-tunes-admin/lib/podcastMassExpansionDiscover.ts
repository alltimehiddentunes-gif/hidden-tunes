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
  PODCAST_EXPANSION_ITUNES_COUNTRIES,
  PODCAST_EXPANSION_LANGUAGES,
  PODCAST_MATURE_INDEX_QUERIES,
  PODCAST_MATURE_ITUNES_QUERIES,
  PODCAST_STANDARD_INDEX_QUERIES,
  PODCAST_STANDARD_ITUNES_QUERIES,
  resolveItunesCountryForIndex,
} from "@/lib/podcastSourceRegistry";

export type PodcastDiscoveryResult = {
  feeds: PodcastExpansionFeed[];
  next_cursor: string;
  exhausted: boolean;
  query_used: string | null;
  language_used: string | null;
  country_used: string | null;
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
  const country = resolveItunesCountryForIndex(cursor.languageIndex);

  const discover =
    source.catalog === "mature"
      ? discoverMaturePodcastFeedsFromItunes
      : discoverPodcastFeedsFromItunes;

  const feeds = await discover({
    limit,
    per_query: 100,
    offsets: [cursor.offset, cursor.offset + 100, cursor.offset + 200],
    query,
    country,
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
      if (nextLanguageIndex >= PODCAST_EXPANSION_ITUNES_COUNTRIES.length) {
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
    language_used: null,
    country_used: country,
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
    country_used: null,
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
    country_used: null,
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

export function advanceItunesDiscoveryCursor(
  source: PodcastSourceRegistryEntry,
  queries: readonly string[],
  mode: "query_first" | "country_first" = "query_first",
  /** Skip multiple storefronts/queries when a window is duplicate-saturated. */
  steps = 1,
  /** Extra queries to skip when a full country cycle wraps (mature saturation escape). */
  queryStepsOnWrap = 1
): string {
  const cursor = parseSourceCursor(source.checkpoint_cursor || "0:0:0");
  let nextQueryIndex = cursor.queryIndex;
  let nextLanguageIndex = cursor.languageIndex;
  const nextOffset = 0;
  const hop = Math.max(1, Math.min(20, Math.floor(steps)));
  const queryHop = Math.max(1, Math.min(10, Math.floor(queryStepsOnWrap)));

  if (mode === "country_first") {
    // When a storefront only returns duplicates, jump countries first (optionally multi-hop).
    nextLanguageIndex += hop;
    while (nextLanguageIndex >= PODCAST_EXPANSION_ITUNES_COUNTRIES.length) {
      nextLanguageIndex -= PODCAST_EXPANSION_ITUNES_COUNTRIES.length;
      nextQueryIndex += queryHop;
    }
  } else {
    nextQueryIndex += hop;
    while (nextQueryIndex >= queries.length) {
      nextQueryIndex -= queries.length;
      nextLanguageIndex += 1;
    }
  }

  return formatSourceCursor({
    queryIndex: nextQueryIndex,
    languageIndex: nextLanguageIndex,
    offset: nextOffset,
  });
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

  // Keep mature progressing even when the standard gap is much larger.
  // Rough mix ~4 standard : 1 mature (aligned with 40k / 10k targets).
  return batchNumber % 5 === 0 ? "mature" : "standard";
}
