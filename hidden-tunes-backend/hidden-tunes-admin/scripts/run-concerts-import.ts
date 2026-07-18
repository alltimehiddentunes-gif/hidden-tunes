/**
 * Run checkpointed Concerts import across eligible sources.
 *
 * Usage:
 *   npx tsx scripts/run-concerts-import.ts --dry-run
 *   npx tsx scripts/run-concerts-import.ts --dry-run --source=arte-concert
 *   npx tsx scripts/run-concerts-import.ts --max-pages=3 --resume
 *
 * Live DB inserts require sources upserted first and must not target production casually.
 * Without YOUTUBE_API_KEY, only fixture mode / dry structural runs are available.
 */

import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import { runConcertsImport } from "../lib/concerts/import/runner";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const resume = !process.argv.includes("--no-resume");
  const sourceStableKey = readArg("source");
  const maxPagesPerSource = Number(readArg("max-pages") || "2");
  const pageSize = Number(readArg("page-size") || "25");

  const report = await runConcertsImport({
    sources: getCuratedConcertSources(),
    sourceStableKey,
    maxPagesPerSource,
    pageSize,
    dryRun,
    resume,
    skipPlaybackProbe: process.argv.includes("--skip-probe"),
  });

  console.log(JSON.stringify(report, null, 2));

  const hardFailures = report.sources.filter(
    (s) => s.eligible && s.errors.some((e) => e !== "youtube_api_key_missing")
  );
  if (!dryRun && hardFailures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
