import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getPodcastPendingPromotionStatus,
  runPodcastPendingPromotionBatch,
} from "@/lib/podcastPendingPromotion";
import type { PodcastCatalogKind } from "@/lib/podcastSourceRegistry";

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

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const catalog = (readArg("catalog") || "standard") as PodcastCatalogKind;
  const limit = Number(readArg("limit") || 100);
  const delayMs = Number(readArg("delay-ms") || 750);
  const maxFailures = Number(readArg("max-failures") || 25);
  const dryRun = hasFlag("dry-run");
  const resume = hasFlag("resume") || !hasFlag("no-resume");

  const report = await runPodcastPendingPromotionBatch({
    catalog,
    limit,
    delay_ms: delayMs,
    max_failures: maxFailures,
    dry_run: dryRun,
    resume,
    admin_root: adminRoot,
  });

  console.log(JSON.stringify({ phase: "complete", report }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
