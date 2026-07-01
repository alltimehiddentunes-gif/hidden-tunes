import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
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

function readCandidates(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Growth candidate file must be a JSON array.");
  }
  return parsed;
}

loadEnvFile(path.join(adminRoot, ".env.local"));

async function main() {
  const candidatesPath = process.argv[2];
  if (!candidatesPath) {
    throw new Error(
      "Usage: tsx scripts/run-tv-growth-job.ts ./tv-candidates.json"
    );
  }

  const { importVerifiedTvGrowthCandidates } = await import("../lib/tvStationHealth");

  const result = await importVerifiedTvGrowthCandidates(
    readCandidates(path.resolve(process.cwd(), candidatesPath))
  );

  console.log(JSON.stringify({ success: true, result }, null, 2));
}

void main();
