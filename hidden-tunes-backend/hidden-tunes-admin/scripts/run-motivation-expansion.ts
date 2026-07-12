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

function readFlag(name: string) {
  return process.argv.includes(name);
}

function readOption(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

async function main() {
  const dryRun = readFlag("--dry-run");
  const apply = readFlag("--apply");
  if (apply && dryRun) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  if (!apply && !dryRun) {
    console.log("Defaulting to --dry-run. Pass --apply to write pending imports.");
  }

  const { runMotivationExpansionBatch } = await import("../lib/motivationExpansionRunner");
  const report = await runMotivationExpansionBatch({
    batchNumber: Number(readOption("--batch", "1")),
    examineLimit: Number(readOption("--limit", "100")),
    dryRun: !apply,
    queryFamily: readOption("--query-family", ""),
  });

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
