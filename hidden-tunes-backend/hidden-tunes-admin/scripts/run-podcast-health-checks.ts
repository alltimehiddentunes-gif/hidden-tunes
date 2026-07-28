import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPodcastHealthWorkerBatch } from "../lib/podcastHealth";
import { collectPodcastObservability } from "../lib/podcastObservability";

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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const workerMode = process.argv.includes("--worker");
  const before = await collectPodcastObservability();
  const worker = await runPodcastHealthWorkerBatch({
    limit: Number(process.env.PODCAST_VERIFY_BATCH_SIZE || 50),
    catalog: "all",
    dryRun,
  });
  const after = await collectPodcastObservability();

  console.log(
    JSON.stringify({ dry_run: dryRun, worker_mode: workerMode, before, worker, after }, null, 2)
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
