/**
 * Sustained Motivationals expansion pipeline toward 200k healthy public.
 *
 * Writes pending imports only — never auto-promotes.
 *
 * Usage:
 *   npx tsx scripts/run-motivation-expansion-pipeline.ts --dry-run --rounds 1
 *   npx tsx scripts/run-motivation-expansion-pipeline.ts --execute --rounds 10 --limit 200 --batch 20
 */
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

function readFamilies() {
  const raw = readOption("--families", "");
  if (!raw.trim()) return null;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute || process.argv.includes("--dry-run");
  const rounds = Math.max(1, Number(readOption("--rounds", "1")));
  const batchNumber = Math.max(0, Number(readOption("--batch", "20")));
  const examineLimit = Math.max(1, Math.min(250, Number(readOption("--limit", "200"))));
  const pauseMs = Math.max(0, Number(readOption("--pause-ms", "3000")));
  const milestoneTarget = Math.max(100, Number(readOption("--target", "200000")));

  const { ARCHIVE_MOTIVATION_QUERY_FAMILIES } = await import(
    "../lib/motivationSources/archiveSource"
  );
  const { runMotivationExpansionBatch } = await import("../lib/motivationExpansionRunner");
  const { getMotivationStatusSummary } = await import("../lib/motivationHealth");

  const families = readFamilies() || Object.keys(ARCHIVE_MOTIVATION_QUERY_FAMILIES);
  const startedAt = new Date().toISOString();
  const roundSummaries: Array<Record<string, unknown>> = [];

  let status = await getMotivationStatusSummary();

  for (let round = 1; round <= rounds; round += 1) {
    const familySummaries: Array<Record<string, unknown>> = [];

    for (const queryFamily of families) {
      const report = await runMotivationExpansionBatch({
        batchNumber,
        examineLimit,
        dryRun,
        queryFamily,
        milestoneTarget,
      });
      const importResult = report.import_result;

      if (importResult.public_promotions !== 0) {
        throw new Error(
          `Safety failure: public_promotions=${importResult.public_promotions} for ${queryFamily}`
        );
      }

      familySummaries.push({
        query_family: queryFamily,
        dry_run: dryRun,
        examined: importResult.records_examined,
        accepted: importResult.records_accepted,
        inserted: importResult.records_inserted,
        updated: importResult.records_updated,
        skipped: importResult.records_skipped,
        rejected: importResult.records_rejected,
        proposed: importResult.proposed_item_inserts,
        classified_accept: importResult.classified_accept,
        classified_hold: importResult.classified_hold,
        classified_reject: importResult.classified_reject,
        classified_routed: importResult.classified_routed,
        duplicates: importResult.duplicate_records,
        errors: importResult.errors,
        checkpoint: report.checkpoint_source_key,
      });

      if (pauseMs > 0) await sleep(pauseMs);
    }

    status = await getMotivationStatusSummary();
    roundSummaries.push({
      round,
      families: familySummaries,
      public_healthy_total: status.publicVerified,
      pending_total: status.pending,
      database_total: status.total,
      gap_to_healthy_public_target: Math.max(0, milestoneTarget - status.publicVerified),
    });

    if (status.publicVerified >= milestoneTarget) break;
  }

  const output = {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    execute,
    dry_run: dryRun,
    batch_number: batchNumber,
    examine_limit: examineLimit,
    rounds_requested: rounds,
    rounds_completed: roundSummaries.length,
    milestone_target: milestoneTarget,
    public_healthy_total: status.publicVerified,
    pending_total: status.pending,
    database_total: status.total,
    gap_to_healthy_public_target: Math.max(0, milestoneTarget - status.publicVerified),
    rounds: roundSummaries,
    note:
      "Pending imports do not count toward 200k. Promotion remains a separate manual review step.",
  };

  const reportDir = path.join(adminRoot, "data", "motivation-expansion-pipeline-reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const outPath = path.join(
    reportDir,
    `pipeline-${dryRun ? "dry" : "write"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...output, report_path: outPath }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
