import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runPodcastHealthWorkerBatch,
  verifyEntirePodcastCatalog,
} from "../lib/podcastHealth";

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
  const mode = process.argv.includes("--worker") ? "worker" : "catalog";

  const result =
    mode === "worker"
      ? await runPodcastHealthWorkerBatch({
          limit: Number(process.env.PODCAST_VERIFY_BATCH_SIZE || 25),
          catalog: "all",
          dryRun,
        })
      : await verifyEntirePodcastCatalog({
          batchSize: Number(process.env.PODCAST_VERIFY_BATCH_SIZE || 25),
          maxShows: 100,
          dryRun,
        });

  console.log(JSON.stringify({ mode, dry_run: dryRun, result }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
