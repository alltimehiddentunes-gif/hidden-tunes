/**
 * Continuous Motivationals expansion toward public playable target (default 50,000).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env.production"));

function readOption(name: string, fallback: string) {
  const equalsPrefix = `${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length) || fallback;

  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ExpandCheckpoint = {
  version: 1;
  target: number;
  batch_size: number;
  family_index: number;
  batches_completed: number;
  last_family: string | null;
  updated_at: string;
};

const CHECKPOINT_PATH = path.join(adminRoot, "data", "motivationals-expand-checkpoint.json");
const DIAGNOSTIC_CHECKPOINT_PATH = path.join(
  adminRoot,
  "data",
  "motivationals-expand-diagnostic-checkpoint.json"
);
const REPORT_PATH = path.join(adminRoot, "data", "motivationals-expand-report.json");

function loadCheckpoint(
  target: number,
  batchSize: number,
  resume: boolean,
  checkpointPath: string
): ExpandCheckpoint {
  if (resume && fs.existsSync(checkpointPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as ExpandCheckpoint;
      if (parsed?.version === 1) return parsed;
    } catch {
      // fall through
    }
  }
  return {
    version: 1,
    target,
    batch_size: batchSize,
    family_index: 0,
    batches_completed: 0,
    last_family: null,
    updated_at: new Date().toISOString(),
  };
}

function saveCheckpoint(checkpoint: ExpandCheckpoint, checkpointPath: string) {
  checkpoint.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

async function main() {
  const target = Math.max(100, Number.parseInt(readOption("--target", "50000"), 10));
  const batchSize = Math.max(
    25,
    Math.min(2000, Number.parseInt(readOption("--batch-size", "1000"), 10))
  );
  const maxBatches = Math.max(1, Number.parseInt(readOption("--max-batches", "50"), 10));
  const promotionBatchSize = Math.max(
    50,
    Math.min(500, Number.parseInt(readOption("--promotion-size", "200"), 10))
  );
  const probeConcurrency = Math.max(
    1,
    Math.min(12, Number.parseInt(readOption("--concurrency", "6"), 10))
  );
  const pauseMs = Math.max(0, Number.parseInt(readOption("--pause-ms", "2000"), 10));
  const dryRun = hasFlag("--dry-run");
  const resume = hasFlag("--resume");
  const noCheckpointAdvance = hasFlag("--no-checkpoint-advance");
  const forceSource = hasFlag("--force-source");
  const sourceFilter = readOption("--source", "").trim() || null;

  const { ARCHIVE_MOTIVATION_QUERY_FAMILIES } = await import(
    "../lib/motivationSources/archiveSource"
  );
  const { runMotivationPlayableImport } = await import("../lib/motivationPlayableImport");
  const { runMotivationPromotionReview } = await import("../lib/motivationPromotion");
  const { runMotivationPostImportClassification } = await import("../lib/motivationPostImportJobs");
  const { getMotivationStatusSummary } = await import("../lib/motivationHealth");
  const { MOTIVATION_EXPANSION_TARGET } = await import("../lib/motivationCatalog");

  let families = Object.keys(ARCHIVE_MOTIVATION_QUERY_FAMILIES);
  if (sourceFilter) {
    families = families.filter((family) => family === sourceFilter);
    if (families.length === 0) {
      throw new Error(`Unknown source family: ${sourceFilter}`);
    }
  } else {
    // Prefer high-yield licensed corpora first for fastest path to public target.
    const priority = [
      "librivox-selfhelp",
      "librivox-philosophy",
      "licensed-audio-selfdev",
      "title-audio-motivation",
      "licensed-movies-selfdev",
      "opensource-audio",
      "public-domain-speeches",
      "prelinger",
      "opensource",
      "community-audio",
    ];
    const prioritySet = new Set(priority);
    families = [
      ...priority.filter((family) => families.includes(family)),
      ...families.filter((family) => !prioritySet.has(family)),
    ];
  }

  const checkpointPath = noCheckpointAdvance ? DIAGNOSTIC_CHECKPOINT_PATH : CHECKPOINT_PATH;
  const mainCheckpoint =
    resume && !noCheckpointAdvance && fs.existsSync(CHECKPOINT_PATH)
      ? loadCheckpoint(target, batchSize, true, CHECKPOINT_PATH)
      : null;

  if (
    sourceFilter &&
    resume &&
    !noCheckpointAdvance &&
    !forceSource &&
    mainCheckpoint &&
    mainCheckpoint.last_family &&
    mainCheckpoint.last_family !== sourceFilter
  ) {
    throw new Error(
      `Checkpoint source conflict: saved last_family=${mainCheckpoint.last_family} but --source=${sourceFilter}. ` +
        `Use --no-checkpoint-advance for diagnostics or --force-source to override this run only.`
    );
  }

  const checkpoint = loadCheckpoint(target, batchSize, resume || noCheckpointAdvance, checkpointPath);
  if (sourceFilter) checkpoint.family_index = 0;

  const startedAt = Date.now();
  const batchReports: Record<string, unknown>[] = [];

  let status = await getMotivationStatusSummary();
  let publicPlayable = Number(status.publicVerified || 0);

  console.error(
    JSON.stringify({
      motivationals_expand: true,
      phase: "start",
      target,
      expansion_target_constant: MOTIVATION_EXPANSION_TARGET,
      public_playable: publicPlayable,
      remaining: Math.max(0, target - publicPlayable),
      dry_run: dryRun,
      resume,
      no_checkpoint_advance: noCheckpointAdvance,
      checkpoint_path: checkpointPath,
      families: families.length,
      source_filter: sourceFilter,
    })
  );

  let consecutiveZeroYield = 0;
  const maxConsecutiveZeroYield = Math.max(
    2,
    Number.parseInt(readOption("--max-zero-yield", "3"), 10)
  );

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    status = await getMotivationStatusSummary();
    publicPlayable = Number(status.publicVerified || 0);
    if (publicPlayable >= target) {
      console.error(
        JSON.stringify({
          motivationals_expand: true,
          phase: "target_reached",
          public_playable: publicPlayable,
          target,
        })
      );
      break;
    }

    const family = families[checkpoint.family_index % families.length];
    if (!noCheckpointAdvance) {
      checkpoint.family_index += 1;
      checkpoint.last_family = family;
    }

    let importReport;
    try {
      importReport = await runMotivationPlayableImport({
        queryFamily: family,
        sourceLimit: batchSize,
        insertBatchSize: Math.min(500, Math.max(100, Math.round(batchSize / 5))),
        probeConcurrency,
        maxPages: Math.max(1, Math.min(20, Math.ceil(batchSize / 200))),
        dryRun,
        resume,
        targetItems: target,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error && "cause" in error
            ? String((error as { cause?: unknown }).cause)
            : null;
      console.error(
        JSON.stringify({
          motivationals_expand: true,
          phase: "batch_error",
          source: family,
          error: message,
          cause,
        })
      );
      if (!noCheckpointAdvance) saveCheckpoint(checkpoint, checkpointPath);
      if (pauseMs > 0) await sleep(Math.max(pauseMs, 5000));
      continue;
    }

    if (importReport.public_promotions !== 0) {
      throw new Error(`Safety failure: import auto-promoted for ${family}`);
    }

    const classifyReport = dryRun
      ? { accepted: 0, held: 0, rejected: 0, examined: 0 }
      : await runMotivationPostImportClassification(Math.min(500, promotionBatchSize));

    const promotionReport = dryRun
      ? {
          apply: false,
          items_reviewed: 0,
          items_promoted: 0,
          items_held: 0,
          items_rejected: 0,
        }
      : await runMotivationPromotionReview({
          apply: true,
          status: "pending",
          limit: promotionBatchSize,
          preferAccepted: true,
        });

    status = await getMotivationStatusSummary();
    publicPlayable = Number(status.publicVerified || 0);

    if (!noCheckpointAdvance) {
      checkpoint.batches_completed += 1;
      saveCheckpoint(checkpoint, checkpointPath);
    }

    const batchSummary = {
      batch: noCheckpointAdvance ? batchIndex + 1 : checkpoint.batches_completed,
      source: family,
      cursor: importReport.checkpoint?.source_cursor ?? null,
      candidates_fetched: importReport.candidates_discovered,
      rights_passed: importReport.rights_checks_passed,
      rights_failed: importReport.failed_rights,
      media_passed: importReport.playback_probes_passed,
      media_failed: importReport.failed_media,
      duplicates: importReport.duplicates_skipped,
      pending_inserted: importReport.pending_inserted,
      classification_accepted: classifyReport.accepted,
      classification_held: classifyReport.held,
      promoted: promotionReport.items_promoted,
      rejected_promotion: promotionReport.items_rejected,
      public_playable_total: publicPlayable,
      remaining_to_target: Math.max(0, target - publicPlayable),
      checkpoint: checkpointPath,
      checkpoint_timestamp: checkpoint.updated_at,
      import_report: {
        candidates_discovered: importReport.candidates_discovered,
        rights_checks_passed: importReport.rights_checks_passed,
        playback_probes_passed: importReport.playback_probes_passed,
        duplicates_skipped: importReport.duplicates_skipped,
        pending_inserted: importReport.pending_inserted,
        failed_media: importReport.failed_media,
        failed_rights: importReport.failed_rights,
        errors: importReport.errors?.slice?.(0, 5) || [],
      },
      classify_report: {
        accepted: classifyReport.accepted,
        held: classifyReport.held,
        rejected: (classifyReport as { rejected?: number }).rejected ?? 0,
        examined: (classifyReport as { examined?: number }).examined ?? 0,
      },
      promotion_report: {
        apply: promotionReport.apply,
        items_reviewed: promotionReport.items_reviewed,
        items_promoted: promotionReport.items_promoted,
        items_held: promotionReport.items_held,
        items_rejected: promotionReport.items_rejected,
      },
    };

    batchReports.push(batchSummary);
    console.error(JSON.stringify({ motivationals_expand: true, phase: "batch_complete", ...batchSummary }));

    const yielded =
      Number(importReport.pending_inserted || 0) + Number(promotionReport.items_promoted || 0);
    if (yielded <= 0) {
      consecutiveZeroYield += 1;
      if (consecutiveZeroYield >= maxConsecutiveZeroYield) {
        console.error(
          JSON.stringify({
            motivationals_expand: true,
            phase: "source_exhausted",
            source: family,
            consecutive_zero_yield: consecutiveZeroYield,
            public_playable: publicPlayable,
          })
        );
        break;
      }
    } else {
      consecutiveZeroYield = 0;
    }

    if (publicPlayable >= target) break;
    if (pauseMs > 0) await sleep(pauseMs);
  }

  status = await getMotivationStatusSummary();
  const finalPayload = {
    ok: true,
    target,
    dry_run: dryRun,
    resume,
    no_checkpoint_advance: noCheckpointAdvance,
    elapsed_ms: Date.now() - startedAt,
    final_status: status,
    public_playable: status.publicVerified,
    remaining_to_target: Math.max(0, target - Number(status.publicVerified || 0)),
    batches: batchReports,
    checkpoint,
    checkpoint_path: checkpointPath,
    exhausted_sources: status.publicVerified < target ? families : [],
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(finalPayload, null, 2));
  console.log(JSON.stringify(finalPayload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
