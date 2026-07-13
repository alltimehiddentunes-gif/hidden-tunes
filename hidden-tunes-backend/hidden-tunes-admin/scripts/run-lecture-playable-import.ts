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
loadEnvFile(path.join(adminRoot, ".env.production"));

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function readOption(name: string) {
  const equalsArg = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readNumberOption(name: string) {
  const value = readOption(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

function readListOption(name: string) {
  const value = readOption(name);
  return value ? value.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined;
}

async function main() {
  const { runLecturePlayableImport } = await import("../lib/lecturePlayableImport");
  const report = await runLecturePlayableImport({
    applyWrites: hasFlag("--apply-writes") || undefined,
    resume: hasFlag("--no-resume") ? false : undefined,
    targetItems: readNumberOption("--target-items"),
    sourceLimit: readNumberOption("--source-limit"),
    insertBatchSize: readNumberOption("--insert-batch-size"),
    probeConcurrency: readNumberOption("--probe-concurrency"),
    metadataConcurrency: readNumberOption("--metadata-concurrency"),
    maxPages: readNumberOption("--max-pages"),
    rounds: readNumberOption("--rounds"),
    requestTimeoutMs: readNumberOption("--request-timeout-ms"),
    retryLimit: readNumberOption("--retry-limit"),
    pauseMs: readNumberOption("--pause-ms"),
    sourceFamilies: readListOption("--source-families"),
    subjectFamilies: readListOption("--subject-families"),
    reportDir: readOption("--report-dir"),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.success) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
