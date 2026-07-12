import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runMotivationBatchImport } from "@/lib/motivationBatchImport";

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
  const dryRun = process.argv.includes("--dry-run");
  const result = await runMotivationBatchImport({
    batchNumber: 0,
    examineLimit: 100,
    dryRun,
    sourceRequestConcurrency: 2,
    mediaValidationConcurrency: 2,
    writeChunkSize: 100,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.success && !dryRun) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[motivation] batch 0 failed", error);
  process.exit(1);
});
