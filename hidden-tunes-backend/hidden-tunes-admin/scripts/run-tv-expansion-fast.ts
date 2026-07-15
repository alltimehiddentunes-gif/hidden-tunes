import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadFastRunnerEnv, logFastStage, resetFastStageLog, getFastStageLog } from "../lib/tvExpansion25k/fast/stageLog";
import { TV_EXPANSION_25K_TARGET } from "../lib/tvExpansion25k/constants";
import type { TvWave4RunLimits } from "../lib/tvExpansion25k/wave4/constants";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

loadFastRunnerEnv(adminRoot);
resetFastStageLog();
logFastStage("env_loaded");

function readValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function parseArgs(argv: string[]): TvWave4RunLimits & { execute: boolean } {
  const contentScopeRaw = readValue(argv, "--content-scope");
  return {
    execute: argv.includes("--execute"),
    dryRun: !argv.includes("--execute"),
    targetEligible: Number(readValue(argv, "--target-eligible") || TV_EXPANSION_25K_TARGET),
    maxBatches: Number(readValue(argv, "--max-batches") || "1"),
    maxRuntimeMinutes: Number(readValue(argv, "--max-runtime-minutes") || "0"),
    maxImports: Number(readValue(argv, "--max-imports") || "0") || undefined,
    stopAfterEmptyBatches: Number(readValue(argv, "--stop-after-empty-batches") || "10"),
    contentScope: contentScopeRaw === "mature" ? "mature" : "normal",
    sourceInclude: readValue(argv, "--source") ? [String(readValue(argv, "--source"))] : undefined,
    sourceExclude: readValue(argv, "--exclude-source")
      ? [String(readValue(argv, "--exclude-source"))]
      : undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const { getSupabaseAdminConfig } = await import("../lib/supabaseAdmin");
  const env = getSupabaseAdminConfig();
  logFastStage("supabase_config_checked");

  if (env.missingVariables.length > 0) {
    throw new Error(`Missing Supabase environment variables: ${env.missingVariables.join(", ")}`);
  }

  const { runTvFastExpansion } = await import("../lib/tvExpansion25k/fast/runner");
  logFastStage("runner_loaded");

  const result = await runTvFastExpansion(
    {
      dryRun: !args.execute,
      targetEligible: args.targetEligible,
      maxBatches: args.maxBatches,
      maxRuntimeMinutes: args.maxRuntimeMinutes,
      maxImports: args.maxImports,
      stopAfterEmptyBatches: args.stopAfterEmptyBatches,
      contentScope: args.contentScope,
      sourceInclude: args.sourceInclude,
      sourceExclude: args.sourceExclude,
    },
    adminRoot
  );

  const writeMetrics = result.writeMetrics || { database_writes: 0, publication_writes: 0 };
  const payload = {
    success: true,
    fast: true,
    dryRunGuard: args.execute ? "execute_enabled" : "DRY RUN: database writes disabled",
    elapsedMs: Date.now() - startedAt,
    stages: getFastStageLog(),
    ...writeMetrics,
    ...result,
  };

  console.log(JSON.stringify(payload, null, 2));
  logFastStage("report_flushed");
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          stages: getFastStageLog(),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  });
