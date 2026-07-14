import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TV_EXPANSION_25K_TARGET } from "../lib/tvExpansion25k/constants";
import { runTvExpansion25k } from "../lib/tvExpansion25k/runner";

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

function parseArgs(argv: string[]) {
  const readValue = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };

  return {
    execute: argv.includes("--execute"),
    reportOnly: argv.includes("--report-only"),
    maxBatches: Math.max(1, Number(readValue("--max-batches") || "999999")),
  };
}

loadEnvFile(path.join(adminRoot, ".env.local"));

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const result = await runTvExpansion25k({
    execute: args.execute && !args.reportOnly,
    maxBatches: args.maxBatches,
    adminRoot,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        target: TV_EXPANSION_25K_TARGET,
        ...result,
      },
      null,
      2
    )
  );

  if (args.execute && !result.completed && result.reason !== "max_batches_reached") {
    process.exitCode = 0;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
