import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq <= 0) continue;
    const key = t.slice(0, eq).trim(); let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.join(adminRoot, ".env.local"));

async function main() {
  const { runMotivationPostImportClassification } = await import("../lib/motivationPostImportJobs");
  const { runMotivationPromotionReview } = await import("../lib/motivationPromotion");
  const { getMotivationStatusSummary } = await import("../lib/motivationHealth");

  for (let i = 0; i < 40; i += 1) {
    const classify = await runMotivationPostImportClassification(500);
    const promote = await runMotivationPromotionReview({
      apply: true,
      status: "pending",
      limit: 400,
      preferAccepted: true,
    });
    const status = await getMotivationStatusSummary();
    console.log(JSON.stringify({
      loop: i + 1,
      classify_accepted: classify.accepted,
      classify_examined: classify.examined,
      promoted: promote.items_promoted,
      public: status.publicVerified,
      total: status.total,
      pending: status.pending,
    }));
    if (classify.examined === 0 && promote.items_reviewed === 0) break;
    if (status.publicVerified >= 25000) break;
    // Stop when nothing is promoting, even if a few accepted items remain non-promotable.
    if (promote.items_promoted === 0) break;
  }
  const finalStatus = await getMotivationStatusSummary();
  console.log(JSON.stringify({ final: finalStatus }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
