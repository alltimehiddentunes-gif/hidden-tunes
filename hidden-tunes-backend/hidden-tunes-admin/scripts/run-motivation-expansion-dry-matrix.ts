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

const families = ["speeches", "commencement", "leadership", "mindset", "discipline"];

async function main() {
  const { runMotivationExpansionBatch } = await import("../lib/motivationExpansionRunner");
  const summaries = [];

  for (const queryFamily of families) {
    const report = await runMotivationExpansionBatch({
      batchNumber: 20,
      examineLimit: 100,
      dryRun: true,
      queryFamily,
    });
    const r = report.import_result;
    summaries.push({
      query_family: queryFamily,
      examined: r.records_examined,
      classified_accept: r.classified_accept,
      classified_hold: r.classified_hold,
      classified_reject: r.classified_reject,
      classified_routed: r.classified_routed,
      rights_passed: r.rights_accepted,
      rights_failed: r.rights_rejected,
      media_verified: r.media_verified,
      media_failed: r.media_failed,
      duplicates: r.duplicate_records,
      pending_inserts_proposed: r.proposed_item_inserts,
      public_promotions: r.public_promotions,
      errors: r.errors,
      checkpoint: report.checkpoint_source_key,
      acceptable:
        r.public_promotions === 0 &&
        r.errors.length === 0 &&
        r.proposed_item_inserts === r.media_verified &&
        r.proposed_item_inserts <= r.rights_accepted,
    });
  }

  const output = {
    generated_at: new Date().toISOString(),
    dry_run: true,
    batch_number: 20,
    limit: 100,
    summaries,
  };

  const outPath = path.join(adminRoot, "data", "motivation-expansion-dry-batch20-report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
