import { ingestPodcastFeed } from "@/lib/podcastRssIngest";
import fs from "node:fs";
import path from "node:path";
import {
  MATURE_PODCAST_SEED_FEEDS,
  PODCAST_SEED_FEEDS,
  type PodcastSeedCategorySlug,
} from "@/lib/podcastSeedFeeds";
import { normalizePodcastTitleKey } from "@/lib/podcastMetadataNormalize";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";

import {
  PODCAST_EXPANSION_BATCH1_FEEDS,
  type PodcastExpansionFeed,
} from "@/lib/podcastExpansionFeedsBatch1";
import { discoverPodcastFeedsFromItunes } from "@/lib/podcastItunesDiscovery";
import {
  clearPodcastExpansionCheckpoint,
  loadPodcastExpansionCheckpoint,
  writePodcastExpansionCheckpoint,
} from "@/lib/podcastExpansionCheckpoint";

export type PodcastExpansionImportOptions = {
  limit?: number;
  dry_run?: boolean;
  feeds?: PodcastExpansionFeed[];
  discover?: boolean;
  max_episodes_per_feed?: number;
  feed_timeout_ms?: number;
  batch?: number;
  sub_batch?: number;
  resume?: boolean;
  checkpoint_interval?: number;
};

export type PodcastExpansionImportResult = {
  success: boolean;
  dry_run: boolean;
  started_at: string;
  finished_at: string;
  runtime_ms: number;
  feeds_considered: number;
  feeds_fetched: number;
  feeds_parsed: number;
  feeds_inserted: number;
  feeds_updated: number;
  feeds_skipped: number;
  duplicate_feeds: number;
  invalid_feeds: number;
  feeds_zero_episodes: number;
  episodes_considered: number;
  episodes_inserted: number;
  episodes_updated: number;
  duplicate_episodes: number;
  failed_episode_records: number;
  general_feeds: number;
  mature_feeds: number;
  by_category: Record<string, number>;
  errors: Array<{ feed_url: string; title: string; message: string }>;
  public_catalog_before: { shows: number; episodes: number } | null;
  public_catalog_after: { shows: number; episodes: number } | null;
  database_totals_before: {
    shows: number;
    episodes: number;
    pending_shows: number;
    pending_episodes: number;
  } | null;
  database_totals_after: {
    shows: number;
    episodes: number;
    pending_shows: number;
    pending_episodes: number;
  } | null;
  sources_discovered: number;
  orphan_shows_removed: number;
  import_speed_feeds_per_hour: number | null;
  checkpoint_path: string | null;
  resumed_from_checkpoint: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchAllShowIndex() {
  const feedUrls = new Set<string>();
  const titlePublisher = new Set<string>();
  const slugs = new Set<string>();

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("podcast_shows")
      .select("feed_url, slug, title, publisher, is_mature")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const batch = data || [];
    for (const row of batch) {
      const feedUrl = cleanText(row.feed_url, 2000);
      if (feedUrl) feedUrls.add(normalizeFeedUrl(feedUrl));
      const titleKey = normalizePodcastTitleKey(String(row.title || ""));
      const publisher = cleanText(row.publisher, 120)?.toLowerCase() || "";
      if (titleKey) titlePublisher.add(`${titleKey}::${publisher}`);
      if (row.slug) slugs.add(String(row.slug).toLowerCase());
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  for (const feed of [...PODCAST_SEED_FEEDS, ...MATURE_PODCAST_SEED_FEEDS]) {
    feedUrls.add(normalizeFeedUrl(feed.feedUrl));
  }

  return { feedUrls, titlePublisher, slugs };
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

async function countDatabaseTotals() {
  const shows = await supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true });
  const episodes = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true });
  const pendingShows = await supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const pendingEpisodes = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return {
    shows: shows.count || 0,
    episodes: episodes.count || 0,
    pending_shows: pendingShows.count || 0,
    pending_episodes: pendingEpisodes.count || 0,
  };
}

async function countPublicCatalog() {
  const shows = await supabaseAdmin
    .from("podcast_shows")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active")
    .eq("is_mature", false);

  const episodes = await supabaseAdmin
    .from("podcast_episodes")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable");

  return {
    shows: shows.count || 0,
    episodes: episodes.count || 0,
  };
}

export async function runPodcastExpansionImport(
  options: PodcastExpansionImportOptions = {}
): Promise<PodcastExpansionImportResult> {
  const startedAt = Date.now();
  const limit = Math.max(1, Number(options.limit || 100));
  const batch = Math.max(1, Number(options.batch || 1));
  const subBatch = options.sub_batch ? Math.max(1, Number(options.sub_batch)) : undefined;
  const checkpointInterval = Math.max(50, Number(options.checkpoint_interval || 500));
  const resume = options.resume === true;
  const existingCheckpoint = resume
    ? loadPodcastExpansionCheckpoint(batch, subBatch)
    : null;
  const discoveryTarget = Math.max(limit + 200, Math.round(limit * 3));
  const discoveredFeeds =
    options.feeds ||
    (options.discover !== false
      ? await discoverPodcastFeedsFromItunes({
          limit: discoveryTarget,
          per_query: 100,
          offsets: [0, 100],
          batch,
        })
      : []);
  const feeds = options.feeds || discoveredFeeds;
  const dryRun = options.dry_run === true;

  const result: PodcastExpansionImportResult = {
    success: true,
    dry_run: dryRun,
    started_at: new Date(startedAt).toISOString(),
    finished_at: "",
    runtime_ms: 0,
    feeds_considered: 0,
    feeds_fetched: 0,
    feeds_parsed: 0,
    feeds_inserted: 0,
    feeds_updated: 0,
    feeds_skipped: 0,
    duplicate_feeds: 0,
    invalid_feeds: 0,
    feeds_zero_episodes: 0,
    episodes_considered: 0,
    episodes_inserted: 0,
    episodes_updated: 0,
    duplicate_episodes: 0,
    failed_episode_records: 0,
    general_feeds: 0,
    mature_feeds: 0,
    by_category: {},
    errors: [],
    public_catalog_before: null,
    public_catalog_after: null,
    database_totals_before: null,
    database_totals_after: null,
    sources_discovered: discoveredFeeds.length,
    orphan_shows_removed: 0,
    import_speed_feeds_per_hour: null,
    checkpoint_path: null,
    resumed_from_checkpoint: Boolean(existingCheckpoint),
  };

  const index = await fetchAllShowIndex();
  result.database_totals_before = await countDatabaseTotals();
  result.public_catalog_before = await countPublicCatalog();

  let imported = existingCheckpoint?.feeds_imported || 0;
  const seenFeedUrls = new Set<string>(
    existingCheckpoint?.completed_feed_urls || []
  );
  let discoveryCursor = existingCheckpoint?.discovery_cursor || 0;

  if (existingCheckpoint) {
    result.feeds_inserted = existingCheckpoint.feeds_inserted;
    result.feeds_updated = existingCheckpoint.feeds_updated;
    result.episodes_inserted = Number(
      existingCheckpoint.episodes_inserted ??
        existingCheckpoint.episodes_imported ??
        0
    );
    result.duplicate_feeds = existingCheckpoint.duplicate_feeds;
    result.invalid_feeds = existingCheckpoint.invalid_feeds;
  }

  const maybeWriteCheckpoint = async () => {
    if (dryRun || imported === 0 || imported % checkpointInterval !== 0) return;
    const totals = await countDatabaseTotals();
    writePodcastExpansionCheckpoint(
      {
        batch,
        sub_batch: subBatch,
        feeds_target: limit,
        feeds_imported: imported,
        feeds_inserted: result.feeds_inserted,
        feeds_updated: result.feeds_updated,
        episodes_inserted: result.episodes_inserted,
        episodes_imported: result.episodes_inserted,
        duplicate_feeds: result.duplicate_feeds,
        invalid_feeds: result.invalid_feeds,
        discovery_cursor: discoveryCursor,
        completed_feed_urls: [...seenFeedUrls],
        started_at: result.started_at,
        timestamp: new Date().toISOString(),
        database_totals: totals,
      },
      subBatch
    );
    result.checkpoint_path = path.join(
      "data",
      "podcast-expansion-checkpoints",
      `batch${batch}${subBatch ? `-sub${subBatch}` : ""}.json`
    );
  };

  for (let feedIndex = discoveryCursor; feedIndex < feeds.length; feedIndex += 1) {
    if (imported >= limit) break;
    discoveryCursor = feedIndex;
    const feed = feeds[feedIndex];

    const normalizedUrl = normalizeFeedUrl(feed.feedUrl);
    if (existingCheckpoint?.completed_feed_urls.includes(normalizedUrl)) {
      continue;
    }
    if (seenFeedUrls.has(normalizedUrl)) {
      result.duplicate_feeds += 1;
      result.feeds_skipped += 1;
      continue;
    }
    seenFeedUrls.add(normalizedUrl);

    result.feeds_considered += 1;

    const duplicateReason = isDuplicateFeed(feed, index);
    if (duplicateReason) {
      result.duplicate_feeds += 1;
      result.feeds_skipped += 1;
      continue;
    }

    if (!feed.feedUrl?.trim() || !feed.title?.trim()) {
      result.invalid_feeds += 1;
      result.feeds_skipped += 1;
      continue;
    }

    if (dryRun) {
      result.feeds_fetched += 1;
      result.feeds_parsed += 1;
      result.feeds_inserted += 1;
      result.general_feeds += 1;
      result.by_category[feed.category] = (result.by_category[feed.category] || 0) + 1;
      imported += 1;
      continue;
    }

    result.feeds_fetched += 1;

    try {
      const ingest = await ingestWithRetry(feed.feedUrl, {
        auto_approve: false,
        category_slug: feed.category as PodcastSeedCategorySlug,
        max_episodes: options.max_episodes_per_feed || 40,
        feed_timeout_ms: options.feed_timeout_ms || 20_000,
      });

      if (ingest.episodes_found <= 0) {
        result.feeds_zero_episodes += 1;
        result.feeds_skipped += 1;
        continue;
      }

      result.feeds_parsed += 1;
      result.episodes_considered += ingest.episodes_found;
      result.episodes_inserted += ingest.episodes_inserted;
      result.episodes_updated += ingest.episodes_updated;
      result.duplicate_episodes += ingest.episodes_skipped;
      result.failed_episode_records += ingest.episodes_failed;

      if (ingest.created_show) result.feeds_inserted += 1;
      else result.feeds_updated += 1;

      result.general_feeds += 1;
      result.by_category[feed.category] = (result.by_category[feed.category] || 0) + 1;
      index.feedUrls.add(normalizeFeedUrl(feed.feedUrl));
      imported += 1;
      await maybeWriteCheckpoint();
    } catch (error) {
      result.invalid_feeds += 1;
      result.errors.push({
        feed_url: feed.feedUrl,
        title: feed.title,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!dryRun) {
    result.public_catalog_after = await countPublicCatalog();
    result.database_totals_after = await countDatabaseTotals();
    if (imported >= limit) {
      clearPodcastExpansionCheckpoint(batch, subBatch);
    }
  }

  result.finished_at = new Date().toISOString();
  result.runtime_ms = Date.now() - startedAt;
  const importedCount = result.feeds_inserted + result.feeds_updated;
  result.import_speed_feeds_per_hour =
    importedCount > 0 && result.runtime_ms > 0
      ? Math.round((importedCount / result.runtime_ms) * 3_600_000 * 10) / 10
      : null;
  result.success = result.errors.length === 0 || importedCount > 0;

  return result;
}
