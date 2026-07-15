import { ingestPodcastFeed } from "@/lib/podcastRssIngest";
import {
  PODCAST_EXPANSION_CHECKPOINT_INTERVAL,
  PODCAST_EXPANSION_MAX_EPISODES_PER_FEED,
} from "@/lib/podcastExpansionConstants";
import type { PodcastExpansionFeed } from "@/lib/podcastExpansionFeedsBatch1";
import { normalizePodcastTitleKey } from "@/lib/podcastMetadataNormalize";
import type { PodcastSeedCategorySlug } from "@/lib/podcastSeedFeeds";
import type { PodcastCatalogKind } from "@/lib/podcastSourceRegistry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";

export type PodcastMassExpansionBatchOptions = {
  feeds: PodcastExpansionFeed[];
  catalog: PodcastCatalogKind;
  batch_size: number;
  dry_run?: boolean;
  max_episodes_per_feed?: number;
  feed_timeout_ms?: number;
  completed_feed_urls?: string[];
  checkpoint_interval?: number;
  on_checkpoint?: (snapshot: PodcastMassExpansionBatchCheckpoint) => void | Promise<void>;
};

export type PodcastMassExpansionBatchCheckpoint = {
  feeds_processed: number;
  feeds_imported: number;
  episodes_imported: number;
  mature_imported: number;
  duplicate_feeds: number;
  failed_feeds: number;
  completed_feed_urls: string[];
  by_category: Record<string, number>;
  by_language: Record<string, number>;
};

export type PodcastMassExpansionBatchResult = {
  success: boolean;
  dry_run: boolean;
  catalog: PodcastCatalogKind;
  feeds_considered: number;
  feeds_imported: number;
  feeds_updated: number;
  feeds_skipped: number;
  duplicate_feeds: number;
  invalid_feeds: number;
  failed_feeds: number;
  episodes_inserted: number;
  episodes_updated: number;
  duplicate_episodes: number;
  mature_imported: number;
  by_category: Record<string, number>;
  by_language: Record<string, number>;
  errors: Array<{ feed_url: string; title: string; message: string }>;
  checkpoint: PodcastMassExpansionBatchCheckpoint;
  runtime_ms: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFeedUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    }
    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

async function ingestWithRetry(
  feedUrl: string,
  options: Parameters<typeof ingestPodcastFeed>[1],
  retries = 2
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await ingestPodcastFeed(feedUrl, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        message.includes("fetch failed") ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("socket hang up");
      if (!transient || attempt >= retries) throw error;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchAllShowIndex() {
  const feedUrls = new Set<string>();
  const titlePublisher = new Set<string>();

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("feed_url, title, publisher")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const batch = data || [];
    for (const row of batch) {
      const feedUrl = cleanText(row.feed_url, 2000);
      if (feedUrl) feedUrls.add(normalizeFeedUrl(feedUrl));
      const titleKey = normalizePodcastTitleKey(String(row.title || ""));
      const publisher = cleanText(row.publisher, 120)?.toLowerCase() || "";
      if (titleKey) titlePublisher.add(`${titleKey}::${publisher}`);
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { feedUrls, titlePublisher };
}

function isDuplicateFeed(
  feed: PodcastExpansionFeed,
  index: Awaited<ReturnType<typeof fetchAllShowIndex>>
) {
  const normalized = normalizeFeedUrl(feed.feedUrl);
  if (index.feedUrls.has(normalized)) return "feed_url";
  const titleKey = normalizePodcastTitleKey(feed.title);
  const publisher = cleanText(feed.publisher, 120)?.toLowerCase() || "";
  if (titleKey && index.titlePublisher.has(`${titleKey}::${publisher}`)) {
    return "title_publisher";
  }
  return null;
}

export async function runPodcastMassExpansionBatch(
  options: PodcastMassExpansionBatchOptions
): Promise<PodcastMassExpansionBatchResult> {
  const startedAt = Date.now();
  const dryRun = options.dry_run === true;
  const batchSize = Math.max(1, options.batch_size);
  const checkpointInterval = Math.max(
    25,
    Number(options.checkpoint_interval || PODCAST_EXPANSION_CHECKPOINT_INTERVAL)
  );
  const completed = new Set(options.completed_feed_urls || []);
  const index = dryRun ? null : await fetchAllShowIndex();

  const result: PodcastMassExpansionBatchResult = {
    success: true,
    dry_run: dryRun,
    catalog: options.catalog,
    feeds_considered: 0,
    feeds_imported: 0,
    feeds_updated: 0,
    feeds_skipped: 0,
    duplicate_feeds: 0,
    invalid_feeds: 0,
    failed_feeds: 0,
    episodes_inserted: 0,
    episodes_updated: 0,
    duplicate_episodes: 0,
    mature_imported: 0,
    by_category: {},
    by_language: {},
    errors: [],
    checkpoint: {
      feeds_processed: 0,
      feeds_imported: 0,
      episodes_imported: 0,
      mature_imported: 0,
      duplicate_feeds: 0,
      failed_feeds: 0,
      completed_feed_urls: [...completed],
      by_category: {},
      by_language: {},
    },
    runtime_ms: 0,
  };

  let imported = 0;

  const maybeCheckpoint = async () => {
    if (!options.on_checkpoint) return;
    result.checkpoint = {
      feeds_processed: result.feeds_considered,
      feeds_imported: result.feeds_imported + result.feeds_updated,
      episodes_imported: result.episodes_inserted,
      mature_imported: result.mature_imported,
      duplicate_feeds: result.duplicate_feeds,
      failed_feeds: result.failed_feeds,
      completed_feed_urls: [...completed],
      by_category: { ...result.by_category },
      by_language: { ...result.by_language },
    };
    await options.on_checkpoint(result.checkpoint);
  };

  for (const feed of options.feeds) {
    if (imported >= batchSize) break;

    const normalizedUrl = normalizeFeedUrl(feed.feedUrl);
    if (completed.has(normalizedUrl)) {
      result.duplicate_feeds += 1;
      result.feeds_skipped += 1;
      continue;
    }

    result.feeds_considered += 1;

    if (!feed.feedUrl?.trim() || !feed.title?.trim()) {
      result.invalid_feeds += 1;
      result.feeds_skipped += 1;
      continue;
    }

    if (index) {
      const duplicateReason = isDuplicateFeed(feed, index);
      if (duplicateReason) {
        result.duplicate_feeds += 1;
        result.feeds_skipped += 1;
        completed.add(normalizedUrl);
        continue;
      }
    }

    const isMature = options.catalog === "mature" || feed.is_mature === true;
    const language = cleanText(feed.language, 40)?.toLowerCase() || "unknown";
    result.by_language[language] = (result.by_language[language] || 0) + 1;

    if (dryRun) {
      result.feeds_imported += 1;
      result.by_category[feed.category] = (result.by_category[feed.category] || 0) + 1;
      if (isMature) result.mature_imported += 1;
      imported += 1;
      completed.add(normalizedUrl);
      continue;
    }

    try {
      const ingest = await ingestWithRetry(feed.feedUrl, {
        auto_approve: true,
        category_slug: feed.category as PodcastSeedCategorySlug,
        is_mature: isMature,
        mature_category: isMature ? feed.mature_category || "adult-lifestyle" : null,
        max_episodes:
          options.max_episodes_per_feed || PODCAST_EXPANSION_MAX_EPISODES_PER_FEED,
        feed_timeout_ms: options.feed_timeout_ms || 20_000,
      });

      if (ingest.episodes_found <= 0) {
        result.invalid_feeds += 1;
        result.feeds_skipped += 1;
        continue;
      }

      result.episodes_inserted += ingest.episodes_inserted;
      result.episodes_updated += ingest.episodes_updated;
      result.duplicate_episodes += ingest.episodes_skipped;

      if (ingest.created_show) result.feeds_imported += 1;
      else result.feeds_updated += 1;

      if (isMature) result.mature_imported += 1;
      result.by_category[feed.category] = (result.by_category[feed.category] || 0) + 1;

      index?.feedUrls.add(normalizedUrl);
      completed.add(normalizedUrl);
      imported += 1;

      if (imported % checkpointInterval === 0) {
        await maybeCheckpoint();
      }
    } catch (error) {
      result.failed_feeds += 1;
      result.errors.push({
        feed_url: feed.feedUrl,
        title: feed.title,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await maybeCheckpoint();
  result.runtime_ms = Date.now() - startedAt;
  result.success = result.feeds_imported + result.feeds_updated > 0 || result.errors.length === 0;
  return result;
}
