import { ingestPodcastFeed } from "@/lib/podcastRssIngest";
import {
  mapPodcastIndexFeedToIngestOptions,
  searchPodcastIndexFeeds,
  type PodcastIndexFeed,
} from "@/lib/podcastIndexClient";
import { collectPodcastObservability } from "@/lib/podcastObservability";
import { verifyPodcastEpisode, verifyPodcastShow } from "@/lib/podcastHealth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";

export const PODCAST_IMPORT_STAGES = {
  1: 100,
  2: 1_000,
  3: 10_000,
  4: 50_000,
} as const;

export type PodcastBulkImportOptions = {
  stage?: keyof typeof PODCAST_IMPORT_STAGES;
  limit?: number;
  lang?: string;
  query?: string;
  catalog?: "general" | "mature";
  dry_run?: boolean;
  auto_approve?: boolean;
  max_episodes_per_feed?: number;
  cursor?: string | null;
};

export type PodcastBulkImportResult = {
  success: boolean;
  dry_run: boolean;
  stage: number;
  target_limit: number;
  feeds_discovered: number;
  feeds_imported: number;
  feeds_skipped: number;
  feeds_failed: number;
  duplicates: number;
  verification_passes: number;
  verification_failures: number;
  next_cursor: string | null;
  errors: Array<{ feed_url: string; message: string }>;
};

async function isDuplicateFeed(feed: PodcastIndexFeed) {
  const feedUrl = cleanText(feed.url, 2000);
  if (!feedUrl) return true;

  const { data: byFeed } = await supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("feed_url", feedUrl)
    .maybeSingle();

  if (byFeed?.id) return true;

  const { data: bySource } = await supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("source_type", "podcast_index")
    .eq("source_id", String(feed.id))
    .maybeSingle();

  if (bySource?.id) return true;
  return false;
}

export async function runPodcastBulkImport(
  options: PodcastBulkImportOptions = {}
): Promise<PodcastBulkImportResult> {
  const stage = options.stage || 1;
  const targetLimit = Math.min(
    PODCAST_IMPORT_STAGES[stage],
    Math.max(1, Number(options.limit || PODCAST_IMPORT_STAGES[stage]))
  );
  const dryRun = options.dry_run !== false;
  const catalog = options.catalog || "general";
  const lang = cleanText(options.lang, 12) || "en";
  const query = cleanText(options.query, 120) || lang;

  const discovery = await searchPodcastIndexFeeds({
    query,
    lang,
    max: Math.min(100, targetLimit),
  });

  const result: PodcastBulkImportResult = {
    success: true,
    dry_run: dryRun,
    stage,
    target_limit: targetLimit,
    feeds_discovered: discovery.feeds.length,
    feeds_imported: 0,
    feeds_skipped: 0,
    feeds_failed: 0,
    duplicates: 0,
    verification_passes: 0,
    verification_failures: 0,
    next_cursor: String(Number(options.cursor || 0) + discovery.feeds.length),
    errors: [],
  };

  if (dryRun) {
    for (const feed of discovery.feeds.slice(0, targetLimit)) {
      if (await isDuplicateFeed(feed)) result.duplicates += 1;
    }
    return result;
  }

  const { data: importRun, error: importRunError } = await supabaseAdmin
    .from("podcast_import_runs")
    .insert({
      source: "podcast_index",
      catalog,
      status: "running",
      page_cursor: options.cursor || null,
      metadata: {
        stage,
        target_limit: targetLimit,
        lang,
        query,
        feeds_discovered: discovery.feeds.length,
      },
    })
    .select("id")
    .single();

  if (importRunError && !/podcast_import_runs/i.test(importRunError.message)) {
    throw new Error(importRunError.message);
  }

  for (const feed of discovery.feeds.slice(0, targetLimit)) {
    const feedUrl = cleanText(feed.url, 2000);
    if (!feedUrl) {
      result.feeds_skipped += 1;
      continue;
    }

    if (await isDuplicateFeed(feed)) {
      result.duplicates += 1;
      result.feeds_skipped += 1;
      continue;
    }

    try {
      const ingestOptions = mapPodcastIndexFeedToIngestOptions(feed, {
        is_mature: catalog === "mature",
        mature_category: catalog === "mature" ? "adult-lifestyle" : null,
      });

      const ingestResult = await ingestPodcastFeed(feedUrl, {
        ...ingestOptions,
        auto_approve: options.auto_approve !== false,
        max_episodes: options.max_episodes_per_feed || 40,
      });

      const showVerification = await verifyPodcastShow(ingestResult.show_id);
      if (showVerification.verified) result.verification_passes += 1;
      else result.verification_failures += 1;

      const { data: episodeRows } = await supabaseAdmin
        .from("podcast_episodes")
        .select("id")
        .eq("show_id", ingestResult.show_id)
        .eq("status", "approved")
        .eq("is_active", true)
        .eq("playback_status", "playable")
        .limit(3);

      for (const episode of episodeRows || []) {
        const episodeVerification = await verifyPodcastEpisode(String(episode.id));
        if (episodeVerification.verified) result.verification_passes += 1;
        else result.verification_failures += 1;
      }

      result.feeds_imported += 1;
    } catch (error) {
      result.feeds_failed += 1;
      result.errors.push({
        feed_url: feedUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (importRun?.id) {
    const observability = await collectPodcastObservability();
    await supabaseAdmin
      .from("podcast_import_runs")
      .update({
        status: "completed",
        imported_count: result.feeds_imported,
        skipped_count: result.feeds_skipped,
        failed_count: result.feeds_failed,
        duplicate_count: result.duplicates,
        finished_at: new Date().toISOString(),
        metadata: {
          stage,
          target_limit: targetLimit,
          lang,
          query,
          feeds_discovered: result.feeds_discovered,
          verification_passes: result.verification_passes,
          verification_failures: result.verification_failures,
          observability,
        },
      })
      .eq("id", importRun.id);
  }

  return result;
}
