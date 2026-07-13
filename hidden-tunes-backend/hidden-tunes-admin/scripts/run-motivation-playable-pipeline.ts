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

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env.production"));

function readOption(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;
  const rounds = Math.max(1, Number(readOption("--rounds", "1")));
  const targetItems = Math.max(100, Number(readOption("--target", "200000")));
  const sourceLimit = Math.max(100, Math.min(2000, Number(readOption("--source-limit", "1000"))));
  const insertBatchSize = Math.max(100, Math.min(500, Number(readOption("--insert-batch-size", "200"))));
  const probeConcurrency = Math.max(1, Math.min(12, Number(readOption("--probe-concurrency", "6"))));
  const maxPages = Math.max(1, Math.min(20, Number(readOption("--max-pages", "5"))));
  const pauseMs = Math.max(0, Number(readOption("--pause-ms", "2000")));
  const resume = !process.argv.includes("--no-resume");

  const { ARCHIVE_MOTIVATION_QUERY_FAMILIES } = await import("../lib/motivationSources/archiveSource");
  const { runMotivationPlayableImport } = await import("../lib/motivationPlayableImport");
  const { countPlayableLegalPendingMotivationItems } = await import("../lib/motivationPlayableCount");

  const families = Object.keys(ARCHIVE_MOTIVATION_QUERY_FAMILIES);
  const startedAt = new Date().toISOString();
  const roundReports = [];

  let count = await countPlayableLegalPendingMotivationItems(targetItems);

  for (let round = 1; round <= rounds && count.total_playable_legal_pending < targetItems; round += 1) {
    const familyReports = [];
    for (const queryFamily of families) {
      if (count.total_playable_legal_pending >= targetItems) break;

      const report = await runMotivationPlayableImport({
        queryFamily,
        sourceLimit,
        insertBatchSize,
        probeConcurrency,
        maxPages,
        dryRun,
        resume,
        targetItems,
      });

      if (report.public_promotions !== 0) {
        throw new Error(`Safety failure: public promotions detected for ${queryFamily}`);
      }

      familyReports.push(report);
      count = await countPlayableLegalPendingMotivationItems(targetItems);
      if (pauseMs > 0) await sleep(pauseMs);
    }

    roundReports.push({
      round,
      families: familyReports,
      total_playable_legal_pending: count.total_playable_legal_pending,
      gap_to_target: count.gap_to_target,
    });
  }

  const output = {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    dry_run: dryRun,
    execute,
    resume,
    target_items: targetItems,
    total_playable_legal_pending: count.total_playable_legal_pending,
    gap_to_target: count.gap_to_target,
    rounds_completed: roundReports.length,
    rounds: roundReports,
    counting_rule:
      "pending + playback_status=playable + rights_status=passed + media_probe_status=passed + primary file audio/video URL + non-HTML mime",
  };

  const reportDir = path.join(adminRoot, "data", "motivation-playable-pipeline-reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const outPath = path.join(
    reportDir,
    `playable-pipeline-${dryRun ? "dry" : "write"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...output, report_path: outPath }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
