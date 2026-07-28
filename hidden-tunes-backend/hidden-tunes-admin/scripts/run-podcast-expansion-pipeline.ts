/**
 * Run podcast expansion batches sequentially with cleanup + reconciliation.
 * Usage: npx tsx scripts/run-podcast-expansion-pipeline.ts --from 4 --to 7 --execute --resume
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isBatchResultComplete } from "../lib/podcastExpansionCheckpoint";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const BATCH_TARGETS: Record<number, number> = {
  1: 100,
  2: 250,
  3: 500,
  4: 1000,
  5: 2500,
  6: 5000,
  7: 10000,
};

const BATCH7_SUB_BATCHES = 5;
const BATCH7_SUB_BATCH_SIZE = 2000;

function parseArgs(argv: string[]) {
  const readValue = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };
  return {
    execute: argv.includes("--execute"),
    resume: argv.includes("--resume"),
    from: Number(readValue("--from") || "3"),
    to: Number(readValue("--to") || "3"),
  };
}

function run(command: string) {
  console.error(`\n>>> ${command}\n`);
  execSync(command, { cwd: adminRoot, stdio: "inherit", env: process.env });
}

function estimateBatch7(currentShows: number, currentEpisodes: number) {
  const feedsPerHour = 400;
  const totalFeeds = BATCH_TARGETS[7];
  const avgEpisodesPerFeed = 33;
  const runtimeHours = totalFeeds / feedsPerHour;
  const expectedEpisodes = totalFeeds * avgEpisodesPerFeed;
  return {
    total_feeds: totalFeeds,
    sub_batches: BATCH7_SUB_BATCHES,
    feeds_per_sub_batch: BATCH7_SUB_BATCH_SIZE,
    expected_runtime_hours: Math.round(runtimeHours * 10) / 10,
    expected_shows_added: totalFeeds,
    expected_episodes_added: expectedEpisodes,
    projected_shows_after: currentShows + totalFeeds,
    projected_episodes_after: currentEpisodes + expectedEpisodes,
    estimated_storage_note:
      "~40 episodes/show avg; episode rows include metadata + audio_url (play-on-tap only in browse).",
  };
}

function runPostBatchValidation(batch: number, resultPath: string) {
  run(`npx tsx scripts/run-podcast-post-batch-validation.ts --batch ${batch} --result "${resultPath}"`);
}

async function runBatchImport(
  batch: number,
  limit: number,
  execute: boolean,
  resume: boolean,
  subBatch?: number
) {
  const parts = [
    "npx tsx scripts/run-podcast-expansion-import.ts",
    `--batch ${batch}`,
    `--limit ${limit}`,
  ];
  if (subBatch) parts.push(`--sub-batch ${subBatch}`);
  if (execute) parts.push("--execute");
  if (resume) parts.push("--resume");
  run(parts.join(" "));
}

function aggregateBatch7Results() {
  const merged = {
    batch: 7,
    sub_batches: BATCH7_SUB_BATCHES,
    dry_run: false,
    success: true,
    feeds_inserted: 0,
    feeds_updated: 0,
    episodes_inserted: 0,
    duplicate_feeds: 0,
    invalid_feeds: 0,
    failed_episode_records: 0,
    by_category: {} as Record<string, number>,
    runtime_ms: 0,
    sub_results: [] as string[],
  };

  for (let sub = 1; sub <= BATCH7_SUB_BATCHES; sub += 1) {
    const subPath = path.join(adminRoot, "data", `podcast-expansion-batch7-sub${sub}-result.json`);
    if (!fs.existsSync(subPath)) continue;
    const subResult = JSON.parse(fs.readFileSync(subPath, "utf8")) as {
      feeds_inserted?: number;
      feeds_updated?: number;
      episodes_inserted?: number;
      duplicate_feeds?: number;
      invalid_feeds?: number;
      failed_episode_records?: number;
      by_category?: Record<string, number>;
      runtime_ms?: number;
      database_totals_after?: Record<string, number>;
      public_catalog_after?: Record<string, number>;
      sources_discovered?: number;
    };
    merged.feeds_inserted += subResult.feeds_inserted || 0;
    merged.feeds_updated += subResult.feeds_updated || 0;
    merged.episodes_inserted += subResult.episodes_inserted || 0;
    merged.duplicate_feeds += subResult.duplicate_feeds || 0;
    merged.invalid_feeds += subResult.invalid_feeds || 0;
    merged.failed_episode_records += subResult.failed_episode_records || 0;
    merged.runtime_ms += subResult.runtime_ms || 0;
    for (const [cat, count] of Object.entries(subResult.by_category || {})) {
      merged.by_category[cat] = (merged.by_category[cat] || 0) + count;
    }
    merged.sub_results.push(subPath);
    if (subResult.database_totals_after) {
      (merged as Record<string, unknown>).database_totals_after = subResult.database_totals_after;
    }
    if (subResult.public_catalog_after) {
      (merged as Record<string, unknown>).public_catalog_after = subResult.public_catalog_after;
    }
  }

  const outPath = path.join(adminRoot, "data", "podcast-expansion-batch7-result.json");
  fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return outPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary: Array<Record<string, unknown>> = [];

  for (let batch = args.from; batch <= args.to; batch += 1) {
    const limit = BATCH_TARGETS[batch];
    if (!limit) continue;

    const resultPath = path.join(adminRoot, "data", `podcast-expansion-batch${batch}-result.json`);
    if (isBatchResultComplete(resultPath)) {
      console.error(`Batch ${batch} already complete; skipping import.`);
      if (args.execute && !fs.existsSync(path.join(adminRoot, "data", `podcast-expansion-batch${batch}-validated.json`))) {
        runPostBatchValidation(batch, resultPath);
      }
      summary.push({ batch, status: "skipped_complete" });
      continue;
    }

    if (batch === 7 && args.execute) {
      const status = JSON.parse(
        execSync("npx tsx scripts/run-podcast-expansion-status.ts", {
          cwd: adminRoot,
          encoding: "utf8",
        })
      ) as { database?: { shows?: number; episodes?: number } };
      const estimate = estimateBatch7(
        status.database?.shows || 0,
        status.database?.episodes || 0
      );
      fs.writeFileSync(
        path.join(adminRoot, "data", "podcast-expansion-batch7-estimate.json"),
        `${JSON.stringify(estimate, null, 2)}\n`,
        "utf8"
      );
      console.error(JSON.stringify({ batch7_estimate: estimate }, null, 2));
    }

    if (batch === 7) {
      for (let sub = 1; sub <= BATCH7_SUB_BATCHES; sub += 1) {
        await runBatchImport(batch, BATCH7_SUB_BATCH_SIZE, args.execute, args.resume, sub);
      }
      if (args.execute) aggregateBatch7Results();
    } else {
      await runBatchImport(batch, limit, args.execute, args.resume);
    }

    if (!args.execute) {
      summary.push({ batch, status: "dry_run_complete", limit });
      continue;
    }

    const finalResultPath =
      batch === 7 ? path.join(adminRoot, "data", "podcast-expansion-batch7-result.json") : resultPath;

    runPostBatchValidation(batch, finalResultPath);
    run(`npx tsx scripts/run-podcast-batch-reconciliation-audit.ts "${finalResultPath}"`);
    run(`npx tsx scripts/run-podcast-batch-completion-report.ts --batch ${batch} --next ${batch + 1} --result "${finalResultPath}"`);

    const result = JSON.parse(fs.readFileSync(finalResultPath, "utf8"));
    summary.push({
      batch,
      status: "complete",
      limit,
      feeds_inserted: result.feeds_inserted,
      episodes_inserted: result.episodes_inserted,
      database_totals_after: result.database_totals_after,
      public_catalog_after: result.public_catalog_after,
      runtime_ms: result.runtime_ms,
      import_speed_feeds_per_hour: result.import_speed_feeds_per_hour,
    });
  }

  if (args.to >= 7 && args.execute) {
    run("npx tsx scripts/run-podcast-expansion-final-report.ts");
  }

  const summaryPath = path.join(adminRoot, "data", "podcast-expansion-pipeline-summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify({ batches: summary }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ batches: summary, summary_path: summaryPath }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
