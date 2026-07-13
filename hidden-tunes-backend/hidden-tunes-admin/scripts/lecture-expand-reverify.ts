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
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

function readLimit() {
  const arg = process.argv.find((entry) => entry.startsWith("--limit="));
  const parsed = Number(arg?.slice("--limit=".length) || 50);
  if (!Number.isFinite(parsed)) throw new Error("--limit must be a number.");
  return parsed;
}

async function main() {
  const { queueLectureReverification } = await import("../lib/lectureExpansion");
  console.log(JSON.stringify(await queueLectureReverification({ limit: readLimit() }), null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
