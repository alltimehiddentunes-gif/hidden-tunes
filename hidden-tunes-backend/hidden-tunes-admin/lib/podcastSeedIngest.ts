import { ingestPodcastFeed } from "@/lib/podcastRssIngest";
import {
  countMaturePodcastSeedFeedsByCategory,
  countPodcastSeedFeedsByCategory,
  listMaturePodcastSeedFeeds,
  listPodcastSeedFeeds,
  type MaturePodcastSeedCategorySlug,
  type MaturePodcastSeedFeed,
  type PodcastSeedCategorySlug,
  type PodcastSeedFeed,
} from "@/lib/podcastSeedFeeds";

export const PODCAST_SEED_DEFAULT_MAX_FEEDS = 60;
export const PODCAST_SEED_DEFAULT_MAX_EPISODES_PER_FEED = 40;
export const PODCAST_SEED_DEFAULT_FEED_TIMEOUT_MS = 20_000;

export type PodcastSeedIngestOptions = {
  auto_approve?: boolean;
  max_feeds?: number;
  offset?: number;
  max_episodes_per_feed?: number;
  feed_timeout_ms?: number;
  categories?: PodcastSeedCategorySlug[];
  dry_run?: boolean;
};

export type MaturePodcastSeedIngestOptions = Omit<
  PodcastSeedIngestOptions,
  "categories"
> & {
  categories?: MaturePodcastSeedCategorySlug[];
};

export type PodcastSeedCategorySummary = {
  feeds_attempted: number;
  feeds_imported: number;
  feeds_skipped: number;
  feeds_errored: number;
  episodes_inserted: number;
  episodes_updated: number;
  episodes_auto_approved: number;
};

export type PodcastSeedIngestResult = {
  success: boolean;
  dry_run: boolean;
  feeds_attempted: number;
  feeds_imported: number;
  feeds_skipped: number;
  feeds_errored: number;
  episodes_inserted: number;
  episodes_updated: number;
  episodes_auto_approved: number;
  by_category: Record<string, PodcastSeedCategorySummary>;
  errors: Array<{
    category: string;
    feed_url: string;
    title: string;
    message: string;
  }>;
};

function emptyCategorySummary(): PodcastSeedCategorySummary {
  return {
    feeds_attempted: 0,
    feeds_imported: 0,
    feeds_skipped: 0,
    feeds_errored: 0,
    episodes_inserted: 0,
    episodes_updated: 0,
    episodes_auto_approved: 0,
  };
}

function ensureCategorySummary(
  map: Record<string, PodcastSeedCategorySummary>,
  category: string
) {
  if (!map[category]) {
    map[category] = emptyCategorySummary();
  }
  return map[category];
}

async function ingestSeedFeed(
  feed: PodcastSeedFeed,
  options: PodcastSeedIngestOptions
) {
  return ingestPodcastFeed(feed.feedUrl, {
    auto_approve: options.auto_approve !== false,
    category_slug: feed.category,
    max_episodes:
      options.max_episodes_per_feed || PODCAST_SEED_DEFAULT_MAX_EPISODES_PER_FEED,
    feed_timeout_ms:
      options.feed_timeout_ms || PODCAST_SEED_DEFAULT_FEED_TIMEOUT_MS,
  });
}

async function ingestMatureSeedFeed(
  feed: MaturePodcastSeedFeed,
  options: MaturePodcastSeedIngestOptions
) {
  return ingestPodcastFeed(feed.feedUrl, {
    auto_approve: options.auto_approve !== false,
    category_slug: feed.category,
    show_slug: feed.showSlug,
    is_mature: true,
    mature_category: feed.matureCategory,
    max_episodes:
      options.max_episodes_per_feed || PODCAST_SEED_DEFAULT_MAX_EPISODES_PER_FEED,
    feed_timeout_ms:
      options.feed_timeout_ms || PODCAST_SEED_DEFAULT_FEED_TIMEOUT_MS,
  });
}

export async function ingestPodcastSeedCatalog(
  options: PodcastSeedIngestOptions = {}
): Promise<PodcastSeedIngestResult> {
  const maxFeeds = Math.max(
    1,
    Number(options.max_feeds || PODCAST_SEED_DEFAULT_MAX_FEEDS)
  );
  const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
  const feeds = listPodcastSeedFeeds({
    categories: options.categories,
    limit: maxFeeds,
    offset,
  });

  const byCategory: Record<string, PodcastSeedCategorySummary> = {};
  const errors: PodcastSeedIngestResult["errors"] = [];

  let feedsImported = 0;
  let feedsSkipped = 0;
  let feedsErrored = 0;
  let episodesInserted = 0;
  let episodesUpdated = 0;
  let episodesAutoApproved = 0;

  for (const feed of feeds) {
    const categorySummary = ensureCategorySummary(byCategory, feed.category);
    categorySummary.feeds_attempted += 1;

    if (options.dry_run) {
      categorySummary.feeds_skipped += 1;
      feedsSkipped += 1;
      continue;
    }

    try {
      const result = await ingestSeedFeed(feed, options);

      if (result.episodes_found === 0) {
        categorySummary.feeds_skipped += 1;
        feedsSkipped += 1;
        continue;
      }

      categorySummary.feeds_imported += 1;
      categorySummary.episodes_inserted += result.episodes_inserted;
      categorySummary.episodes_updated += result.episodes_updated;
      categorySummary.episodes_auto_approved += result.episodes_auto_approved;

      feedsImported += 1;
      episodesInserted += result.episodes_inserted;
      episodesUpdated += result.episodes_updated;
      episodesAutoApproved += result.episodes_auto_approved;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingest error.";

      categorySummary.feeds_errored += 1;
      feedsErrored += 1;
      errors.push({
        category: feed.category,
        feed_url: feed.feedUrl,
        title: feed.title,
        message,
      });
    }
  }

  return {
    success: feedsErrored === 0,
    dry_run: options.dry_run === true,
    feeds_attempted: feeds.length,
    feeds_imported: feedsImported,
    feeds_skipped: feedsSkipped,
    feeds_errored: feedsErrored,
    episodes_inserted: episodesInserted,
    episodes_updated: episodesUpdated,
    episodes_auto_approved: episodesAutoApproved,
    by_category: byCategory,
    errors,
  };
}

export function describePodcastSeedCatalog() {
  return {
    total_feeds: listPodcastSeedFeeds().length,
    feeds_by_category: countPodcastSeedFeedsByCategory(),
    categories: Object.keys(countPodcastSeedFeedsByCategory()).sort(),
  };
}

export async function ingestMaturePodcastSeedCatalog(
  options: MaturePodcastSeedIngestOptions = {}
): Promise<PodcastSeedIngestResult> {
  const maxFeeds = Math.max(
    1,
    Number(options.max_feeds || PODCAST_SEED_DEFAULT_MAX_FEEDS)
  );
  const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
  const feeds = listMaturePodcastSeedFeeds({
    categories: options.categories,
    limit: maxFeeds,
    offset,
  });

  const byCategory: Record<string, PodcastSeedCategorySummary> = {};
  const errors: PodcastSeedIngestResult["errors"] = [];

  let feedsImported = 0;
  let feedsSkipped = 0;
  let feedsErrored = 0;
  let episodesInserted = 0;
  let episodesUpdated = 0;
  let episodesAutoApproved = 0;

  for (const feed of feeds) {
    const categorySummary = ensureCategorySummary(byCategory, feed.matureCategory);
    categorySummary.feeds_attempted += 1;

    if (options.dry_run) {
      categorySummary.feeds_skipped += 1;
      feedsSkipped += 1;
      continue;
    }

    try {
      const result = await ingestMatureSeedFeed(feed, options);

      if (result.episodes_found === 0) {
        categorySummary.feeds_skipped += 1;
        feedsSkipped += 1;
        continue;
      }

      categorySummary.feeds_imported += 1;
      categorySummary.episodes_inserted += result.episodes_inserted;
      categorySummary.episodes_updated += result.episodes_updated;
      categorySummary.episodes_auto_approved += result.episodes_auto_approved;

      feedsImported += 1;
      episodesInserted += result.episodes_inserted;
      episodesUpdated += result.episodes_updated;
      episodesAutoApproved += result.episodes_auto_approved;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingest error.";

      categorySummary.feeds_errored += 1;
      feedsErrored += 1;
      errors.push({
        category: feed.matureCategory,
        feed_url: feed.feedUrl,
        title: feed.title,
        message,
      });
    }
  }

  return {
    success: feedsErrored === 0,
    dry_run: options.dry_run === true,
    feeds_attempted: feeds.length,
    feeds_imported: feedsImported,
    feeds_skipped: feedsSkipped,
    feeds_errored: feedsErrored,
    episodes_inserted: episodesInserted,
    episodes_updated: episodesUpdated,
    episodes_auto_approved: episodesAutoApproved,
    by_category: byCategory,
    errors,
  };
}

export function describeMaturePodcastSeedCatalog() {
  return {
    total_feeds: listMaturePodcastSeedFeeds().length,
    feeds_by_category: countMaturePodcastSeedFeedsByCategory(),
    categories: Object.keys(countMaturePodcastSeedFeedsByCategory()).sort(),
  };
}
