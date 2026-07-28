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
  const {
    runAudiobookExpansionBatch,
    runAudiobookExpansionLoop,
  } = await import("../lib/audiobookExpansionRunner");
  const { getAudiobookStatusSummary } = await import("../lib/audiobookHealth");
  const { AUDIOBOOK_GENERAL_MILESTONE_TARGET } = await import(
    "../lib/audiobookExpansionConstants"
  );

  const lane = (readArg("lane") === "mature" ? "mature" : "general") as
    | "general"
    | "mature";
  const defaultTarget =
    lane === "mature" ? 10_000 : AUDIOBOOK_GENERAL_MILESTONE_TARGET;
  const target = Number(readArg("target") || defaultTarget);
  const batchSize = Number(readArg("batch-size") || (lane === "mature" ? 40 : 100));
  const maxBatches = Number(readArg("max-batches") || 1);
  const source = readArg("source");
  const language = readArg("language");
  const category = readArg("category");
  const batchNumber = Number(readArg("batch") || 0);
  const dryRun = hasFlag("dry-run");
  const resume = hasFlag("no-resume") ? false : hasFlag("resume") || true;
  const completeOnly = hasFlag("complete-only");
  const repair = hasFlag("repair");
  const verifySample = !hasFlag("no-verify-sample");
  const loop = hasFlag("loop") || maxBatches > 1;

  const statusBefore = await getAudiobookStatusSummary();
  console.log(
    JSON.stringify(
      {
        phase: "preflight",
        lane,
        target,
        public_playable_total: statusBefore.publicPlayableEditions,
        mature_playable_total: statusBefore.maturePlayableEditions,
        gap_to_general_milestone: statusBefore.gapToGeneralMilestone,
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
    ? await runAudiobookExpansionLoop({
        target,
        batchSize,
        maxBatches,
        source: source || undefined,
        language: language || undefined,
        category: category || undefined,
        completeOnly,
        resume,
        dryRun,
        repair,
        verifySample,
        lane,
      })
    : [
        await runAudiobookExpansionBatch({
          target,
          batchSize,
          batchNumber,
          source: source || undefined,
          language: language || undefined,
          category: category || undefined,
          completeOnly,
          resume,
          dryRun,
          repair,
          verifySample,
          lane,
        }),
      ];

  const statusAfter = await getAudiobookStatusSummary();
  console.log(
    JSON.stringify(
      {
        phase: "complete",
        lane,
        batches: reports.length,
        reports,
        status: statusAfter,
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
