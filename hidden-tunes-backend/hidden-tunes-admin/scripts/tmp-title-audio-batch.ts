import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const family = process.argv[2] || "title-audio-motivation";
  const limit = Number(process.argv[3] || 120);
  console.error(JSON.stringify({ phase: "import_start", family, limit }));
  const { runMotivationPlayableImport } = await import("../lib/motivationPlayableImport");
  const { runMotivationPostImportClassification } = await import("../lib/motivationPostImportJobs");
  const { runMotivationPromotionReview } = await import("../lib/motivationPromotion");
  const { getMotivationStatusSummary } = await import("../lib/motivationHealth");

  const started = Date.now();
  const importReport = await runMotivationPlayableImport({
    queryFamily: family,
    sourceLimit: limit,
    insertBatchSize: Math.min(80, limit),
    probeConcurrency: 10,
    maxPages: Math.max(1, Math.ceil(limit / 80)),
    dryRun: false,
    resume: true,
    targetItems: 25000,
  });
  console.error(
    JSON.stringify({
      phase: "import_done",
      elapsed_ms: Date.now() - started,
      pending_inserted: importReport.pending_inserted,
      candidates_discovered: importReport.candidates_discovered,
      duplicates_skipped: importReport.duplicates_skipped,
      rights_checks_passed: importReport.rights_checks_passed,
      playback_probes_passed: importReport.playback_probes_passed,
      errors: (importReport.errors || []).slice(0, 5),
    })
  );

  const classify = await runMotivationPostImportClassification(Math.min(500, limit + 50));
  const promote = await runMotivationPromotionReview({
    apply: true,
    status: "pending",
    limit: Math.min(400, limit + 50),
    preferAccepted: true,
  });
  const status = await getMotivationStatusSummary();
  console.log(
    JSON.stringify(
      {
        family,
        pending_inserted: importReport.pending_inserted,
        classify_accepted: classify.accepted,
        promoted: promote.items_promoted,
        publicVerified: status.publicVerified,
        pending: status.pending,
        total: status.total,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
