/**
 * Bounded, resumable artist similarity writer.
 *
 * Usage:
 *   npx tsx scripts/run-artist-similar-scores.ts
 *   npx tsx scripts/run-artist-similar-scores.ts --dry-run
 *   npx tsx scripts/run-artist-similar-scores.ts --resume --limit-artists=40
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  defaultArtistSimilarityCheckpointPath,
  runArtistSimilarScoresJob,
} from "../lib/artistSimilarScores";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath: string) {
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

loadEnv(path.join(adminRoot, ".env.local"));
loadEnv(path.join(adminRoot, ".env"));

function readFlag(name: string) {
  return process.argv.includes(name);
}

function readOption(name: string) {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const dryRun = readFlag("--dry-run");
  const resume = readFlag("--resume");
  const artistLimit = Number(readOption("--limit-artists") || 40);
  const batchSize = Number(readOption("--batch-size") || 20);
  const checkpointPath =
    readOption("--checkpoint") || defaultArtistSimilarityCheckpointPath(adminRoot);

  const result = await runArtistSimilarScoresJob({
    dryRun,
    resume,
    artistLimit,
    batchSize,
    checkpointPath,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
