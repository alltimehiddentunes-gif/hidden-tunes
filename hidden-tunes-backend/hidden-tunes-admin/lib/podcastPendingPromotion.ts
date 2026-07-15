import {
  evaluatePodcastFeedAutoApproval,
  evaluatePodcastShowAutoApproval,
} from "@/lib/podcastAutoApproval";
import { isPlayablePodcastAudioUrl } from "@/lib/podcastCatalog";
import { ingestPodcastFeed } from "@/lib/podcastRssIngest";
import {
  fetchPodcastFeedXml,
  parsePodcastFeedXml,
} from "@/lib/podcastRssIngest";
import {
  appendPodcastPendingPromotionBatchLog,
  createPodcastPendingPromotionState,
  loadPodcastPendingPromotionState,
  writePodcastPendingPromotionBatchReport,
  writePodcastPendingPromotionStateAtomic,
  type PodcastPendingPromotionState,
} from "@/lib/podcastPendingPromotionCheckpoint";
import { getPodcastMassExpansionCounts } from "@/lib/podcastMassExpansionStatus";
import type { PodcastCatalogKind } from "@/lib/podcastSourceRegistry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";

export type PodcastPendingPromotionOptions = {
  catalog?: PodcastCatalogKind;
  limit?: number;
  dry_run?: boolean;
  resume?: boolean;
  delay_ms?: number;
  max_failures?: number;
  feed_timeout_ms?: number;
  admin_root?: string;
};

export type PodcastPendingPromotionBatchReport = {
  batch_number: number;
  catalog: PodcastCatalogKind;
  dry_run: boolean;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  rows_selected: number;
  rows_examined: number;
  feeds_requested: number;
  feeds_fetched: number;
  feeds_parsed: number;
  valid_podcast_feeds: number;
  shows_promoted: number;
  shows_skipped: number;
  shows_failed: number;
  episodes_discovered: number;
  playable_episodes_discovered: number;
  episodes_inserted: number;
  episodes_updated: number;
  standard_promoted: number;
  mature_promoted: number;
  classification_conflicts: number;
  parse_failures: number;
  timeout_failures: number;
  no_playable_episode_failures: number;
  duplicate_feeds: number;
  results: Array<{
    show_id: string;
    feed_url: string;
    title: string;
    outcome: "would_promote" | "promoted" | "skipped" | "failed";
    reason?: string;
  }>;
  public_counts_before: Awaited<ReturnType<typeof getPodcastMassExpansionCounts>>;
  public_counts_after: Awaited<ReturnType<typeof getPodcastMassExpansionCounts>>;
  checkpoint: {
    last_processed_id: string | null;
    last_processed_created_at: string | null;
  };
};

const DEFAULT_LIMIT = 100;
export const PODCAST_PENDING_PROMOTION_MAX_LIMIT = 500;
const DEFAULT_DELAY_MS = 750;
const DEFAULT_MAX_FAILURES = 25;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clampPodcastPendingPromotionLimit(value: number) {
  return Math.max(1, Math.min(PODCAST_PENDING_PROMOTION_MAX_LIMIT, Math.floor(value || DEFAULT_LIMIT)));
}

function clampLimit(value: number) {
  return clampPodcastPendingPromotionLimit(value);
}

async function selectPendingShows(options: {
  catalog: PodcastCatalogKind;
  limit: number;
  resumeAfterId: string | null;
}) {
  const fetchLimit = options.resumeAfterId ? options.limit + 500 : options.limit;
  const { data, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id, slug, title, feed_url, is_mature, mature_category, status, created_at")
    .eq("status", "pending")
    .eq("is_mature", options.catalog === "mature")
    .not("feed_url", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(fetchLimit);

  if (error) throw new Error(error.message);
  let rows = data || [];
  if (options.resumeAfterId) {
    const resumeIndex = rows.findIndex((row) => String(row.id) === options.resumeAfterId);
    if (resumeIndex >= 0) rows = rows.slice(resumeIndex + 1);
  }
  return rows.slice(0, options.limit);
}

async function validatePendingFeed(feedUrl: string, feedTimeoutMs: number) {
  const xml = await fetchPodcastFeedXml(feedUrl, feedTimeoutMs);
  const parsed = parsePodcastFeedXml(xml);
  const evaluation = evaluatePodcastFeedAutoApproval(parsed, feedUrl);
  const playableCount = parsed.episodes.filter((episode) =>
    Boolean(isPlayablePodcastAudioUrl(episode.audio_url))
  ).length;

  return {
    parsed,
    evaluation,
    playableCount,
    episodesFound: parsed.episodes.length,
  };
}

export async function runPodcastPendingPromotionBatch(
  options: PodcastPendingPromotionOptions = {}
): Promise<PodcastPendingPromotionBatchReport> {
  const adminRoot = options.admin_root || process.cwd();
  const catalog = options.catalog || "standard";
  const limit = clampLimit(Number(options.limit || DEFAULT_LIMIT));
  const dryRun = options.dry_run === true;
  const delayMs = Math.max(0, Number(options.delay_ms ?? DEFAULT_DELAY_MS));
  const maxFailures = Math.max(1, Number(options.max_failures ?? DEFAULT_MAX_FAILURES));
  const feedTimeoutMs = Math.max(5_000, Number(options.feed_timeout_ms || 20_000));
  const startedAt = Date.now();

  let state: PodcastPendingPromotionState =
    (options.resume !== false ? loadPodcastPendingPromotionState(adminRoot) : null) ||
    createPodcastPendingPromotionState(catalog);

  if (state.catalog !== catalog) {
    state = createPodcastPendingPromotionState(catalog);
  }

  state.batch_number += 1;
  state.status = "running";
  if (!dryRun) writePodcastPendingPromotionStateAtomic(state, adminRoot);

  const publicBefore = await getPodcastMassExpansionCounts();
  const candidates = await selectPendingShows({
    catalog,
    limit,
    resumeAfterId: options.resume !== false ? state.last_processed_id : null,
  });

  const report: PodcastPendingPromotionBatchReport = {
    batch_number: state.batch_number,
    catalog,
    dry_run: dryRun,
    started_at: new Date(startedAt).toISOString(),
    finished_at: "",
    duration_ms: 0,
    rows_selected: candidates.length,
    rows_examined: 0,
    feeds_requested: 0,
    feeds_fetched: 0,
    feeds_parsed: 0,
    valid_podcast_feeds: 0,
    shows_promoted: 0,
    shows_skipped: 0,
    shows_failed: 0,
    episodes_discovered: 0,
    playable_episodes_discovered: 0,
    episodes_inserted: 0,
    episodes_updated: 0,
    standard_promoted: 0,
    mature_promoted: 0,
    classification_conflicts: 0,
    parse_failures: 0,
    timeout_failures: 0,
    no_playable_episode_failures: 0,
    duplicate_feeds: 0,
    results: [],
    public_counts_before: publicBefore,
    public_counts_after: publicBefore,
    checkpoint: {
      last_processed_id: state.last_processed_id,
      last_processed_created_at: state.last_processed_created_at,
    },
  };

  let consecutiveFailures = 0;

  for (const show of candidates) {
    if (consecutiveFailures >= maxFailures) break;

    const showId = String(show.id || "");
    const feedUrl = cleanText(show.feed_url, 2000) || "";
    const title = cleanText(show.title, 200) || "Podcast";
    const isMature = Boolean(show.is_mature);
    report.rows_examined += 1;
    state.examined += 1;

    if (catalog === "standard" && isMature) {
      report.classification_conflicts += 1;
      report.shows_skipped += 1;
      state.skipped += 1;
      report.results.push({
        show_id: showId,
        feed_url: feedUrl,
        title,
        outcome: "skipped",
        reason: "classification_mismatch_mature_in_standard_batch",
      });
      continue;
    }

    if (catalog === "mature" && !isMature) {
      report.classification_conflicts += 1;
      report.shows_skipped += 1;
      state.skipped += 1;
      report.results.push({
        show_id: showId,
        feed_url: feedUrl,
        title,
        outcome: "skipped",
        reason: "classification_mismatch_standard_in_mature_batch",
      });
      continue;
    }

    if (!feedUrl) {
      report.shows_skipped += 1;
      state.skipped += 1;
      report.results.push({
        show_id: showId,
        feed_url: feedUrl,
        title,
        outcome: "skipped",
        reason: "missing_feed_url",
      });
      continue;
    }

    report.feeds_requested += 1;

    try {
      const validation = await validatePendingFeed(feedUrl, feedTimeoutMs);
      report.feeds_fetched += 1;
      report.feeds_parsed += 1;
      report.episodes_discovered += validation.episodesFound;
      report.playable_episodes_discovered += validation.playableCount;

      const showEval = evaluatePodcastShowAutoApproval(validation.parsed, feedUrl);
      if (!showEval.eligible || validation.playableCount < 1) {
        report.no_playable_episode_failures += 1;
        report.shows_failed += 1;
        state.failed += 1;
        consecutiveFailures += 1;
        report.results.push({
          show_id: showId,
          feed_url: feedUrl,
          title,
          outcome: "failed",
          reason: showEval.reasons.join(",") || "no_playable_episode",
        });
      } else {
        report.valid_podcast_feeds += 1;
        consecutiveFailures = 0;

        if (dryRun) {
          report.shows_promoted += 1;
          report.results.push({
            show_id: showId,
            feed_url: feedUrl,
            title,
            outcome: "would_promote",
          });
        } else {
          const ingest = await ingestPodcastFeed(feedUrl, {
            auto_approve: true,
            is_mature: isMature,
            mature_category: isMature ? cleanText(show.mature_category, 120) || "adult-lifestyle" : null,
            max_episodes: 200,
            feed_timeout_ms: feedTimeoutMs,
          });

          report.episodes_inserted += ingest.episodes_inserted;
          report.episodes_updated += ingest.episodes_updated;
          report.shows_promoted += 1;
          state.promoted += 1;
          if (isMature) report.mature_promoted += 1;
          else report.standard_promoted += 1;
          report.results.push({
            show_id: showId,
            feed_url: feedUrl,
            title,
            outcome: "promoted",
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.shows_failed += 1;
      state.failed += 1;
      consecutiveFailures += 1;
      if (/timed out|timeout|ETIMEDOUT/i.test(message)) report.timeout_failures += 1;
      else report.parse_failures += 1;
      report.results.push({
        show_id: showId,
        feed_url: feedUrl,
        title,
        outcome: "failed",
        reason: message,
      });
    }

    state.last_processed_id = showId;
    state.last_processed_created_at = String(show.created_at || "");
    report.checkpoint.last_processed_id = state.last_processed_id;
    report.checkpoint.last_processed_created_at = state.last_processed_created_at;

    if (delayMs > 0) await sleep(delayMs);
  }

  report.finished_at = new Date().toISOString();
  report.duration_ms = Date.now() - startedAt;
  report.public_counts_after = await getPodcastMassExpansionCounts();

  if (!dryRun) {
    state.status = consecutiveFailures >= maxFailures ? "paused" : "running";
    writePodcastPendingPromotionStateAtomic(state, adminRoot);
  }

  writePodcastPendingPromotionBatchReport(state.batch_number, report, adminRoot);
  appendPodcastPendingPromotionBatchLog(report, adminRoot);

  return report;
}

export function getPodcastPendingPromotionStatus(adminRoot = process.cwd()) {
  const state = loadPodcastPendingPromotionState(adminRoot);
  return { state };
}
