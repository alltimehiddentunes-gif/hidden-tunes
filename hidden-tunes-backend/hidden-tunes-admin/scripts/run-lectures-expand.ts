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
loadEnvFile(path.join(adminRoot, ".env.production"));

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const { runLectureExpansionLoop } = await import("../lib/lecturesExpansion/runner");
  const result = await runLectureExpansionLoop({
    target_programs: Number(readArg("target-programs") || 25_000),
    target_items: Number(readArg("target-items") || 50_000),
    batch_size: Number(readArg("batch-size") || 250),
    max_batches: Number(readArg("max-batches") || 10_000),
    concurrency: Number(readArg("concurrency") || 24),
    parallel: Number(readArg("parallel") || 1),
    source: readArg("source") || undefined,
    all_sources: hasFlag("all-sources") || !readArg("source"),
    dry_run: hasFlag("dry-run"),
    resume: hasFlag("resume") || !hasFlag("no-resume"),
    admin_root: adminRoot,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
