import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TV_EXPANSION_25K_TARGET } from "../lib/tvExpansion25k/constants";
import { runTvWave4Expansion } from "../lib/tvExpansion25k/wave4/runner";
import type { TvWave4RunLimits } from "../lib/tvExpansion25k/wave4/constants";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
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

function readValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function parseArgs(argv: string[]): TvWave4RunLimits & { execute: boolean } {
  const contentScopeRaw = readValue(argv, "--content-scope");
  const source = readValue(argv, "--source");
  const exclude = readValue(argv, "--exclude-source");

  return {
    execute: argv.includes("--execute"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--execute"),
    targetEligible: Number(readValue(argv, "--target-eligible") || TV_EXPANSION_25K_TARGET),
    maxBatches: Number(readValue(argv, "--max-batches") || "1"),
    maxRuntimeMinutes: Number(readValue(argv, "--max-runtime-minutes") || "0"),
    maxImports: Number(readValue(argv, "--max-imports") || "0") || undefined,
    stopAfterEmptyBatches: Number(readValue(argv, "--stop-after-empty-batches") || "10"),
    contentScope: contentScopeRaw === "mature" ? "mature" : "normal",
    sourceInclude: source ? [source] : undefined,
    sourceExclude: exclude ? [exclude] : undefined,
  };
}

loadEnvFile(path.join(adminRoot, ".env.local"));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runTvWave4Expansion(
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

  console.log(JSON.stringify({ success: true, target: args.targetEligible, ...result }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
