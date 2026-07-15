import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPodcastExpansionBatch, runPodcastExpansionLoop } from "@/lib/podcastExpansionRunner";
import {
  PODCAST_EXPANSION_TARGET_MATURE,
  PODCAST_EXPANSION_TARGET_STANDARD,
} from "@/lib/podcastExpansionConstants";
import { getPodcastMassExpansionCounts } from "@/lib/podcastMassExpansionStatus";
import type { PodcastCatalogKind } from "@/lib/podcastSourceRegistry";

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
loadEnvFile(path.join(adminRoot, ".env"));

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const targetStandard = Number(readArg("target-standard") || PODCAST_EXPANSION_TARGET_STANDARD);
  const targetMature = Number(readArg("target-mature") || PODCAST_EXPANSION_TARGET_MATURE);
  const batchSize = Number(readArg("batch-size") || 750);
  const maxBatches = Number(readArg("max-batches") || 10_000);
  const source = readArg("source");
  const catalogArg = readArg("catalog");
  const catalog =
    catalogArg === "mature" || catalogArg === "standard"
      ? (catalogArg as PodcastCatalogKind)
      : undefined;
  const dryRun = hasFlag("dry-run");
  const resume = hasFlag("resume") || !hasFlag("no-resume");
  const loop = hasFlag("loop") || maxBatches > 1;

  const countsBefore = await getPodcastMassExpansionCounts();
  console.log(
    JSON.stringify(
      {
        phase: "preflight",
        target_standard: targetStandard,
        target_mature: targetMature,
        current_standard_shows: countsBefore.standard_shows,
        current_mature_shows: countsBefore.mature_shows,
        current_episodes: countsBefore.total_episodes,
        dry_run: dryRun,
        loop,
        resume,
        max_batches: maxBatches,
        batch_size: batchSize,
        source: source || "auto",
        catalog: catalog || "auto",
      },
      null,
      2
    )
  );

  const result = loop
    ? await runPodcastExpansionLoop({
        target_standard: targetStandard,
        target_mature: targetMature,
        batch_size: batchSize,
        max_batches: maxBatches,
        source: source || undefined,
        catalog,
        resume,
        dry_run: dryRun,
        admin_root: adminRoot,
      })
    : {
        reports: [
          await runPodcastExpansionBatch({
            target_standard: targetStandard,
            target_mature: targetMature,
            batch_size: batchSize,
            source: source || undefined,
            catalog,
            resume,
            dry_run: dryRun,
            admin_root: adminRoot,
          }),
        ],
        final_report: null,
      };

  const countsAfter = await getPodcastMassExpansionCounts();
  console.log(
    JSON.stringify(
      {
        phase: "complete",
        batches: result.reports.length,
        reports: result.reports,
        final_report: result.final_report,
        counts: countsAfter,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
