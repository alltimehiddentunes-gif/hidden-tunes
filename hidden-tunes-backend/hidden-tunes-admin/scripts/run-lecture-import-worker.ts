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

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function readOption(name: string) {
  const equalsArg = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readNumberOption(name: string) {
  const value = readOption(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

async function main() {
  const { runLectureImportWorker } = await import("../lib/lectureExpansion");
  const report = await runLectureImportWorker({
    dryRun: hasFlag("--dry-run"),
    resume: hasFlag("--resume"),
    validateMedia: hasFlag("--validate-media"),
    publishValid: hasFlag("--publish-valid"),
    source: readOption("--source"),
    job: readOption("--job"),
    batchSize: readNumberOption("--batch-size"),
    maxPrograms: readNumberOption("--max-programs"),
    maxPages: readNumberOption("--max-pages"),
    maxRuntimeMinutes: readNumberOption("--max-runtime-minutes"),
    concurrency: readNumberOption("--concurrency"),
  });

  console.log(JSON.stringify(report, null, 2));
  if (!report.success) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
