import fs from "node:fs";
import path from "node:path";

import {
  PODCAST_EXPANSION_DEFAULT_BATCH_SIZE,
  PODCAST_EXPANSION_TARGET_MATURE,
  PODCAST_EXPANSION_TARGET_STANDARD,
} from "@/lib/podcastExpansionConstants";
import {
  appendPodcastMassExpansionBatchLog,
  createPodcastMassExpansionState,
  loadPodcastMassExpansionState,
  writePodcastMassExpansionBatchReport,
  writePodcastMassExpansionState,
  type PodcastMassExpansionState,
} from "@/lib/podcastMassExpansionCheckpoint";
import { runPodcastMassExpansionBatch } from "@/lib/podcastMassExpansionBatch";
import {
  discoverPodcastFeedsForSource,
  pickCatalogForBatch,
} from "@/lib/podcastMassExpansionDiscover";
import {
  computeExpansionRemaining,
  getPodcastMassExpansionCounts,
  isExpansionTargetMet,
} from "@/lib/podcastMassExpansionStatus";
import {
  isCatalogSourceExhausted,
  listEnabledPodcastSources,
  loadPodcastSourceRegistry,
  pickNextPodcastSource,
  updatePodcastSourceRegistryEntry,
  type PodcastCatalogKind,
  type PodcastSourceRegistryEntry,
} from "@/lib/podcastSourceRegistry";

export type PodcastExpansionRunOptions = {
  target_standard?: number;
  target_mature?: number;
  batch_size?: number;
  max_batches?: number;
  resume?: boolean;
  dry_run?: boolean;
  source?: string;
  catalog?: PodcastCatalogKind;
  admin_root?: string;
};

export type PodcastExpansionBatchReport = {
  generated_at: string;
  batch_number: number;
  source_key: string;
  catalog: PodcastCatalogKind;
  dry_run: boolean;
  feeds_processed: number;
  feeds_imported: number;
  feeds_updated: number;
  episodes_imported: number;
  mature_imported: number;
  duplicates_skipped: number;
  failed_feeds: number;
  languages: Record<string, number>;
  categories: Record<string, number>;
  current_totals: {
    standard_shows: number;
    mature_shows: number;
    public_standard_shows: number;
    public_mature_shows: number;
    public_episodes: number;
    total_episodes: number;
  };
  remaining: {
    standard: number;
    mature: number;
  };
  checkpoint_cursor: string;
  query_used: string | null;
  language_used: string | null;
  source_exhausted: boolean;
  status: "completed" | "failed" | "skipped";
  error?: string;
};

export type PodcastExpansionFinalReport = {
  generated_at: string;
  started_at: string;
  finished_at: string;
  targets: { standard: number; mature: number };
  batches_completed: number;
  sources_processed: string[];
  exhausted_sources: string[];
  standard_shows_imported: number;
  mature_shows_imported: number;
  episodes_imported: number;
  duplicates_skipped: number;
  failed_feeds: number;
  languages: string[];
  categories: string[];
  final_counts: Awaited<ReturnType<typeof getPodcastMassExpansionCounts>>;
  remaining: { standard: number; mature: number };
  target_met: boolean;
  all_sources_exhausted: boolean;
  status: "completed" | "partial" | "failed";
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureState(
  options: PodcastExpansionRunOptions,
  adminRoot: string
): PodcastMassExpansionState {
  const targets = {
    standard: Math.max(1, Number(options.target_standard || PODCAST_EXPANSION_TARGET_STANDARD)),
    mature: Math.max(1, Number(options.target_mature || PODCAST_EXPANSION_TARGET_MATURE)),
  };

  if (options.resume !== false) {
    const existing = loadPodcastMassExpansionState(adminRoot);
    if (existing) return existing;
  }

  const state = createPodcastMassExpansionState({ targets });
  writePodcastMassExpansionState(state, adminRoot);
  return state;
}

function selectSource(
  sources: PodcastSourceRegistryEntry[],
  catalog: PodcastCatalogKind,
  batchNumber: number,
  preferredSource?: string
) {
  if (preferredSource) {
    const match = sources.find(
      (entry) =>
        entry.source_key === preferredSource &&
        entry.catalog === catalog &&
        entry.is_enabled &&
        !entry.is_exhausted
    );
    if (match) return match;
  }
  return pickNextPodcastSource(sources, catalog, batchNumber);
}

export async function runPodcastExpansionBatch(
  options: PodcastExpansionRunOptions = {}
): Promise<PodcastExpansionBatchReport> {
  const adminRoot = options.admin_root || process.cwd();
  const state = ensureState(options, adminRoot);
  const batchSize = Math.max(
    50,
    Math.min(1000, Number(options.batch_size || PODCAST_EXPANSION_DEFAULT_BATCH_SIZE))
  );
  const countsBefore = await getPodcastMassExpansionCounts();
  const remainingBefore = computeExpansionRemaining(countsBefore, state.targets);

  if (isExpansionTargetMet(countsBefore, state.targets)) {
    state.status = "completed";
    writePodcastMassExpansionState(state, adminRoot);
    return {
      generated_at: new Date().toISOString(),
      batch_number: state.batch_number,
      source_key: "none",
      catalog: "standard",
      dry_run: options.dry_run === true,
      feeds_processed: 0,
      feeds_imported: 0,
      feeds_updated: 0,
      episodes_imported: 0,
      mature_imported: 0,
      duplicates_skipped: 0,
      failed_feeds: 0,
      languages: {},
      categories: {},
      current_totals: {
        standard_shows: countsBefore.standard_shows,
        mature_shows: countsBefore.mature_shows,
        public_standard_shows: countsBefore.public_standard_shows,
        public_mature_shows: countsBefore.public_mature_shows,
        public_episodes: countsBefore.public_episodes,
        total_episodes: countsBefore.total_episodes,
      },
      remaining: remainingBefore,
      checkpoint_cursor: "",
      query_used: null,
      language_used: null,
      source_exhausted: false,
      status: "skipped",
    };
  }

  const catalog =
    options.catalog || pickCatalogForBatch(remainingBefore, state.batch_number);
  let sources = loadPodcastSourceRegistry(adminRoot);

  if (isCatalogSourceExhausted(sources, catalog)) {
    const alternate: PodcastCatalogKind = catalog === "standard" ? "mature" : "standard";
    if (
      !isCatalogSourceExhausted(sources, alternate) &&
      remainingBefore[alternate] > 0
    ) {
      return runPodcastExpansionBatch({ ...options, catalog: alternate, source: undefined });
    }
  }

  const source = selectSource(sources, catalog, state.batch_number, options.source);
  if (!source) {
    state.status = "completed";
    writePodcastMassExpansionState(state, adminRoot);
    throw new Error(`No enabled podcast sources remain for ${catalog} catalog.`);
  }

  state.active_source_key = source.source_key;
  state.batch_number += 1;
  writePodcastMassExpansionState(state, adminRoot);

  let discovery;
  let batchResult;
  let errorMessage: string | undefined;

  try {
    discovery = await discoverPodcastFeedsForSource(source, Math.max(batchSize * 3, 500));
    source.checkpoint_cursor = discovery.next_cursor;

    batchResult = await runPodcastMassExpansionBatch({
      feeds: discovery.feeds,
      catalog,
      batch_size: batchSize,
      dry_run: options.dry_run === true,
      completed_feed_urls: state.completed_feed_urls,
      on_checkpoint: async (snapshot) => {
        state.completed_feed_urls = snapshot.completed_feed_urls;
        state.episodes_imported += 0;
        writePodcastMassExpansionState(state, adminRoot);
      },
    });

    if (discovery.exhausted && batchResult.feeds_imported + batchResult.feeds_updated === 0) {
      source.is_exhausted = true;
      state.exhausted_sources = Array.from(
        new Set([...state.exhausted_sources, source.source_key])
      );
    }

    source.feeds_accepted += batchResult.feeds_imported + batchResult.feeds_updated;
    source.feeds_rejected += batchResult.failed_feeds;
    source.last_successful_import = new Date().toISOString();
    source.failure_count = 0;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    source.failure_count += 1;
    source.last_failed_import = new Date().toISOString();
    batchResult = {
      success: false,
      dry_run: options.dry_run === true,
      catalog,
      feeds_considered: 0,
      feeds_imported: 0,
      feeds_updated: 0,
      feeds_skipped: 0,
      duplicate_feeds: 0,
      invalid_feeds: 0,
      failed_feeds: 1,
      episodes_inserted: 0,
      episodes_updated: 0,
      duplicate_episodes: 0,
      mature_imported: 0,
      by_category: {},
      by_language: {},
      errors: [{ feed_url: "", title: "", message: errorMessage }],
      checkpoint: {
        feeds_processed: 0,
        feeds_imported: 0,
        episodes_imported: 0,
        mature_imported: 0,
        duplicate_feeds: 0,
        failed_feeds: 1,
        completed_feed_urls: state.completed_feed_urls,
        by_category: {},
        by_language: {},
      },
      runtime_ms: 0,
    };
    discovery = {
      feeds: [],
      next_cursor: source.checkpoint_cursor,
      exhausted: false,
      query_used: null,
      language_used: null,
    };
  }

  updatePodcastSourceRegistryEntry(source.source_key, source, adminRoot);
  sources = loadPodcastSourceRegistry(adminRoot);

  const importedShows = batchResult.feeds_imported + batchResult.feeds_updated;
  if (catalog === "mature") {
    state.mature_shows_imported += importedShows;
  } else {
    state.standard_shows_imported += importedShows;
  }
  state.episodes_imported += batchResult.episodes_inserted;
  state.duplicate_feeds_skipped += batchResult.duplicate_feeds;
  state.failed_feeds += batchResult.failed_feeds;
  state.completed_feed_urls = batchResult.checkpoint.completed_feed_urls.slice(-50_000);
  state.status = errorMessage ? "failed" : "running";
  writePodcastMassExpansionState(state, adminRoot);

  const countsAfter = await getPodcastMassExpansionCounts();
  const remainingAfter = computeExpansionRemaining(countsAfter, state.targets);

  if (isExpansionTargetMet(countsAfter, state.targets)) {
    state.status = "completed";
    writePodcastMassExpansionState(state, adminRoot);
  }

  const report: PodcastExpansionBatchReport = {
    generated_at: new Date().toISOString(),
    batch_number: state.batch_number,
    source_key: source.source_key,
    catalog,
    dry_run: options.dry_run === true,
    feeds_processed: batchResult.feeds_considered,
    feeds_imported: batchResult.feeds_imported,
    feeds_updated: batchResult.feeds_updated,
    episodes_imported: batchResult.episodes_inserted,
    mature_imported: batchResult.mature_imported,
    duplicates_skipped: batchResult.duplicate_feeds,
    failed_feeds: batchResult.failed_feeds,
    languages: batchResult.by_language,
    categories: batchResult.by_category,
    current_totals: {
      standard_shows: countsAfter.standard_shows,
      mature_shows: countsAfter.mature_shows,
      public_standard_shows: countsAfter.public_standard_shows,
      public_mature_shows: countsAfter.public_mature_shows,
      public_episodes: countsAfter.public_episodes,
      total_episodes: countsAfter.total_episodes,
    },
    remaining: remainingAfter,
    checkpoint_cursor: source.checkpoint_cursor,
    query_used: discovery.query_used,
    language_used: discovery.language_used,
    source_exhausted: source.is_exhausted,
    status: errorMessage ? "failed" : "completed",
    error: errorMessage,
  };

  const reportPath = writePodcastMassExpansionBatchReport(state.batch_number, report, adminRoot);
  state.last_batch_report_path = path.relative(adminRoot, reportPath);
  writePodcastMassExpansionState(state, adminRoot);
  appendPodcastMassExpansionBatchLog(report, adminRoot);

  return report;
}

export async function runPodcastExpansionLoop(
  options: PodcastExpansionRunOptions = {}
): Promise<{
  reports: PodcastExpansionBatchReport[];
  final_report: PodcastExpansionFinalReport;
}> {
  const adminRoot = options.admin_root || process.cwd();
  const maxBatches = Math.max(1, Number(options.max_batches || 10_000));
  const state = ensureState(options, adminRoot);
  const reports: PodcastExpansionBatchReport[] = [];
  const sourcesProcessed = new Set<string>();

  for (let index = 0; index < maxBatches; index += 1) {
    const counts = await getPodcastMassExpansionCounts();
    if (isExpansionTargetMet(counts, state.targets)) break;

    const sources = listEnabledPodcastSources(adminRoot);
    const remaining = computeExpansionRemaining(counts, state.targets);
    const standardExhausted = isCatalogSourceExhausted(
      loadPodcastSourceRegistry(adminRoot),
      "standard"
    );
    const matureExhausted = isCatalogSourceExhausted(
      loadPodcastSourceRegistry(adminRoot),
      "mature"
    );

    if (
      (remaining.standard <= 0 || standardExhausted) &&
      (remaining.mature <= 0 || matureExhausted)
    ) {
      break;
    }

    if (sources.length === 0) break;

    const report = await runPodcastExpansionBatch({
      ...options,
      resume: true,
      admin_root: adminRoot,
    });

    reports.push(report);
    sourcesProcessed.add(report.source_key);

    if (report.status === "failed") {
      await sleep(5000);
      continue;
    }

    if (isExpansionTargetMet(
      await getPodcastMassExpansionCounts(),
      state.targets
    )) {
      break;
    }

    await sleep(250);
  }

  const finalCounts = await getPodcastMassExpansionCounts();
  const remaining = computeExpansionRemaining(finalCounts, state.targets);
  const registry = loadPodcastSourceRegistry(adminRoot);
  const allSourcesExhausted =
    isCatalogSourceExhausted(registry, "standard") &&
    isCatalogSourceExhausted(registry, "mature");

  const finalState = loadPodcastMassExpansionState(adminRoot) || state;
  finalState.status = isExpansionTargetMet(finalCounts, finalState.targets)
    ? "completed"
    : allSourcesExhausted
      ? "completed"
      : "paused";
  writePodcastMassExpansionState(finalState, adminRoot);

  const finalReport: PodcastExpansionFinalReport = {
    generated_at: new Date().toISOString(),
    started_at: finalState.started_at,
    finished_at: new Date().toISOString(),
    targets: finalState.targets,
    batches_completed: reports.length,
    sources_processed: Array.from(sourcesProcessed),
    exhausted_sources: finalState.exhausted_sources,
    standard_shows_imported: finalCounts.standard_shows,
    mature_shows_imported: finalCounts.mature_shows,
    episodes_imported: finalCounts.total_episodes,
    duplicates_skipped: finalState.duplicate_feeds_skipped,
    failed_feeds: finalState.failed_feeds,
    languages: finalCounts.languages,
    categories: finalCounts.categories,
    final_counts: finalCounts,
    remaining,
    target_met: isExpansionTargetMet(finalCounts, finalState.targets),
    all_sources_exhausted: allSourcesExhausted,
    status: isExpansionTargetMet(finalCounts, finalState.targets)
      ? "completed"
      : allSourcesExhausted
        ? "partial"
        : "partial",
  };

  const reportPath = path.join(
    adminRoot,
    "data",
    "podcast-mass-expansion",
    "final-report.json"
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");

  return { reports, final_report: finalReport };
}
