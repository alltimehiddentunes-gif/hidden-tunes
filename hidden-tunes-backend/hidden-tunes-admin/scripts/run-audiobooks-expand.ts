import {
  runAudiobookExpansionBatch,
  runAudiobookExpansionLoop,
} from "@/lib/audiobookExpansionRunner";
import { getAudiobookStatusSummary } from "@/lib/audiobookHealth";
import { AUDIOBOOK_EXPANSION_TARGET } from "@/lib/audiobookExpansionConstants";

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const target = Number(readArg("target") || AUDIOBOOK_EXPANSION_TARGET);
  const batchSize = Number(readArg("batch-size") || 1000);
  const maxBatches = Number(readArg("max-batches") || 1);
  const source = readArg("source");
  const language = readArg("language");
  const category = readArg("category");
  const batchNumber = Number(readArg("batch") || 0);
  const dryRun = hasFlag("dry-run");
  const resume = hasFlag("resume") || !hasFlag("no-resume");
  const completeOnly = hasFlag("complete-only");
  const repair = hasFlag("repair");
  const verifySample = !hasFlag("no-verify-sample");
  const loop = hasFlag("loop") || maxBatches > 1;

  const statusBefore = await getAudiobookStatusSummary();
  console.log(
    JSON.stringify(
      {
        phase: "preflight",
        target,
        public_playable_total: statusBefore.publicPlayableEditions,
        gap_to_target: statusBefore.gapToTarget,
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
        }),
      ];

  const statusAfter = await getAudiobookStatusSummary();
  console.log(
    JSON.stringify(
      {
        phase: "complete",
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
