import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runMotivationPromotionReview } from "@/lib/motivationPromotion";

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
loadEnvFile(path.join(adminRoot, ".env"));

async function main() {
  const apply = process.argv.includes("--apply");
  const limitIndex = process.argv.indexOf("--limit");
  const limit =
    limitIndex >= 0 ? Math.max(1, Number(process.argv[limitIndex + 1] || 100)) : 100;

  const result = await runMotivationPromotionReview({
    apply,
    status: "pending",
    limit,
  });

  console.log(JSON.stringify(result, null, 2));
  if (apply && result.items_promoted === 0 && result.items_reviewed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
