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
  const { runMotivationPromotionReview } = await import("../lib/motivationPromotion");
  const { getMotivationStatusSummary } = await import("../lib/motivationHealth");
  const report = await runMotivationPromotionReview({
    apply: true,
    status: "pending",
    limit: 200,
    preferAccepted: true,
  });
  const status = await getMotivationStatusSummary();
  console.log(
    JSON.stringify(
      {
        promotion: {
          reviewed: report.items_reviewed,
          promoted: report.items_promoted,
          held: report.items_held,
          rejected: report.items_rejected,
          sample_rejects: report.reviews
            .filter((row) => row.promotion_decision === "reject")
            .slice(0, 5)
            .map((row) => ({
              title: row.title,
              reason: row.rejection_or_hold_reason,
            })),
        },
        status,
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
