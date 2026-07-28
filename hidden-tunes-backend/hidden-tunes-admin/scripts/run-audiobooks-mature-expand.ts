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

loadEnvFile(path.join(adminRoot, ".env.production"));
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
  const { AUDIOBOOK_MATURE_MILESTONE_TARGET } = await import(
    "../lib/audiobookExpansionConstants"
  );
  const { getAudiobookStatusSummary } = await import("../lib/audiobookHealth");
  const {
    runMatureAudiobookExpansionBatch,
    runMatureAudiobookExpansionLoop,
  } = await import("../lib/audiobookMature/runner");

  const target = Number(readArg("target") || AUDIOBOOK_MATURE_MILESTONE_TARGET);
  const batchSize = Number(readArg("batch-size") || 40);
  const maxBatches = Number(readArg("max-batches") || 1);
  const source = readArg("source");
  const batchNumber = Number(readArg("batch") || 0);
  const dryRun = hasFlag("dry-run");
  const resume = hasFlag("no-resume") ? false : hasFlag("resume") || true;
  const verifySample = !hasFlag("no-verify-sample");
  const loop = hasFlag("loop") || maxBatches > 1;

  const statusBefore = await getAudiobookStatusSummary();
  console.log(
    JSON.stringify(
      {
        phase: "preflight",
        lane: "mature",
        target,
        mature_playable_total: statusBefore.maturePlayableEditions,
        gap_to_mature_milestone: statusBefore.gapToMatureMilestone,
        dry_run: dryRun,
        loop,
        max_batches: maxBatches,
        source: source || "auto",
      },
      null,
      2
    )
  );

  const reports = loop
    ? await runMatureAudiobookExpansionLoop({
        target,
        batchSize,
        maxBatches,
        source: source || undefined,
        resume,
        dryRun,
        verifySample,
      })
    : [
        await runMatureAudiobookExpansionBatch({
          target,
          batchSize,
          batchNumber,
          source: source || undefined,
          resume,
          dryRun,
          verifySample,
        }),
      ];

  const statusAfter = await getAudiobookStatusSummary();
  console.log(
    JSON.stringify(
      {
        phase: "complete",
        lane: "mature",
        batches: reports.length,
        reports,
        status: {
          mature_playable_total: statusAfter.maturePlayableEditions,
          public_playable_total: statusAfter.publicPlayableEditions,
          gap_to_mature_milestone: statusAfter.gapToMatureMilestone,
          languages: statusAfter.languages,
          categories: statusAfter.categories,
        },
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
