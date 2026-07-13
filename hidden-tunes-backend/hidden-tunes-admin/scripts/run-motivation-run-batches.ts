/**
 * Bounded Motivationals batch runner toward eligible public catalog target.
 *
 * Usage:
 *   npx tsx scripts/run-motivation-run-batches.ts --target=200000 --batch-size=2000 --max-batches=20 --resume
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runMotivationExpansionBatch } from "../lib/motivationExpansionRunner";
import { getMotivationStatusSummary } from "../lib/motivationHealth";

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
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const target = Number.parseInt(readOption("--target", "200000"), 10);
  const batchSize = Number.parseInt(readOption("--batch-size", "1000"), 10);
  const maxBatches = Number.parseInt(readOption("--max-batches", "10"), 10);
  const concurrency = Number.parseInt(readOption("--concurrency", "5"), 10);
  const dryRun = hasFlag("--dry-run");
  const resume = hasFlag("--resume");
  const stopOnError = hasFlag("--stop-on-error");

  const reportPath = path.join(adminRoot, "data", "motivation-run-batches-report.json");
  const startedAt = Date.now();
  const batches: Record<string, unknown>[] = [];

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const status = await getMotivationStatusSummary();
    const eligible = Number(status.publicVerified || 0);
    if (eligible >= target) {
      console.log(`Target reached: ${eligible}/${target}`);
      break;
    }

    const result = await runMotivationExpansionBatch({
      dryRun,
      batchNumber: batchIndex,
      examineLimit: batchSize,
      milestoneTarget: target,
    });

    batches.push({
      batch: batchIndex + 1,
      eligibleBefore: eligible,
      report: result,
    });

    if (stopOnError && !result.import_result?.success) {
      console.error("Stopping on batch error.");
      break;
    }
  }

  const finalStatus = await getMotivationStatusSummary();
  const payload = {
    ok: true,
    target,
    batchSize,
    maxBatches,
    concurrency,
    dryRun,
    resume,
    elapsedMs: Date.now() - startedAt,
    batches,
    finalStatus,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
