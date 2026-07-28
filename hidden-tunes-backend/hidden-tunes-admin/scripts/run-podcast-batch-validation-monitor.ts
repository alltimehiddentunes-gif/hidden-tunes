/**
 * Waits for a prior batch import to complete and pass validation.
 * Does not interrupt running imports.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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
loadEnvFile(path.join(adminRoot, ".env"));

function isImportComplete(batch: number) {
  const resultPath = path.join(adminRoot, "data", `podcast-expansion-batch${batch}-result.json`);
  if (!fs.existsSync(resultPath)) return false;
  try {
    const result = JSON.parse(fs.readFileSync(resultPath, "utf8")) as {
      dry_run?: boolean;
      success?: boolean;
      finished_at?: string;
    };
    return !result.dry_run && Boolean(result.success) && Boolean(result.finished_at);
  } catch {
    return false;
  }
}

function isValidated(batch: number) {
  const validatedPath = path.join(
    adminRoot,
    "data",
    `podcast-expansion-batch${batch}-validated.json`
  );
  if (!fs.existsSync(validatedPath)) return false;
  try {
    const payload = JSON.parse(fs.readFileSync(validatedPath, "utf8")) as { pass?: boolean };
    return payload.pass === true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const priorBatch = Number(process.argv[2] || "3");
  const pollMs = 60_000;
  const maxWaitMs = 48 * 3_600_000;
  const started = Date.now();

  console.error(`Monitoring batch ${priorBatch} completion for validation gate...`);

  while (Date.now() - started < maxWaitMs) {
    if (isValidated(priorBatch)) {
      console.error(`Batch ${priorBatch} validation already passed.`);
      return;
    }

    if (isImportComplete(priorBatch)) {
      console.error(`Batch ${priorBatch} import complete. Running post-batch validation...`);
      try {
        execSync(`npx tsx scripts/run-podcast-post-batch-validation.ts --batch ${priorBatch}`, {
          cwd: adminRoot,
          stdio: "inherit",
          env: process.env,
        });
        execSync(
          `npx tsx scripts/run-podcast-batch-completion-report.ts --batch ${priorBatch} --next ${priorBatch + 1}`,
          { cwd: adminRoot, stdio: "inherit", env: process.env }
        );
        console.error(`Batch ${priorBatch} validation passed.`);
        return;
      } catch {
        console.error(`Batch ${priorBatch} validation failed.`);
        process.exit(1);
      }
    }

    await sleep(pollMs);
  }

  console.error(`Timed out waiting for batch ${priorBatch} validation.`);
  process.exit(1);
}

void main();
