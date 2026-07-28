import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runMotivationPostImportClassification } from "@/lib/motivationPostImportJobs";

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

function readOption(name: string, fallback: string) {
  const equalsPrefix = `${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length) || fallback;
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

async function main() {
  const limit = Math.max(1, Math.min(500, Number.parseInt(readOption("--limit", "200"), 10)));
  const status = readOption("--status", "pending").trim() || "pending";
  if (status !== "pending") {
    throw new Error("Only --status=pending is supported for bounded post-import classification.");
  }
  const result = await runMotivationPostImportClassification(limit);
  console.log(JSON.stringify({ ...result, status_filter: status, limit }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
