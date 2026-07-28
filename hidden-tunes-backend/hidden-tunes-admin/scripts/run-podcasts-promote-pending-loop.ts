import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getPodcastPendingPromotionStatus,
  runPodcastPendingPromotionBatch,
} from "@/lib/podcastPendingPromotion";
import { getPodcastMassExpansionShowCounts } from "@/lib/podcastMassExpansionStatus";
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

function sleep(ms: number) {
  return Promise.resolve().then(
    () => new Promise((resolve) => setTimeout(resolve, ms))
  );
}

async function main() {
  const catalogsArg = readArg("catalogs") || "standard,mature";
  const catalogs = catalogsArg
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is PodcastCatalogKind =>
      value === "standard" || value === "mature"
    );
  const limit = Number(readArg("limit") || 200);
  const delayMs = Number(readArg("delay-ms") || 500);
  const maxFailures = Number(readArg("max-failures") || 40);
  const feedTimeoutMs = Number(readArg("feed-timeout-ms") || 20_000);
  const maxBatches = Number(readArg("max-batches") || 10_000);
  const idleSleepMs = Number(readArg("idle-sleep-ms") || 15_000);
  const dryRun = hasFlag("dry-run");
  const resume = hasFlag("resume") || !hasFlag("no-resume");

  const summary = {
    started_at: new Date().toISOString(),
    batches: 0,
    promoted: 0,
    failed: 0,
    skipped: 0,
  };

  console.log(
    JSON.stringify(
      {
        phase: "preflight",
        catalogs,
        limit,
        delay_ms: delayMs,
        max_batches: maxBatches,
        dry_run: dryRun,
        resume,
      },
      null,
      2
    )
  );

  for (let index = 0; index < maxBatches; index += 1) {
    let progressed = false;

    for (const catalog of catalogs) {
      const report = await runPodcastPendingPromotionBatch({
        catalog,
        limit,
        delay_ms: delayMs,
        max_failures: maxFailures,
        feed_timeout_ms: feedTimeoutMs,
        dry_run: dryRun,
        resume,
        admin_root: adminRoot,
      });

      summary.batches += 1;
      summary.promoted += report.shows_promoted;
      summary.failed += report.shows_failed;
      summary.skipped += report.shows_skipped;

      if (report.rows_selected > 0 || report.shows_promoted > 0) {
        progressed = true;
      }

      console.log(
        JSON.stringify(
          {
            phase: "batch",
            batch_index: index + 1,
            catalog,
            rows_selected: report.rows_selected,
            shows_promoted: report.shows_promoted,
            shows_failed: report.shows_failed,
            shows_skipped: report.shows_skipped,
            public_standard:
              report.public_counts_after.public_standard_shows,
            public_mature: report.public_counts_after.public_mature_shows,
          },
          null,
          2
        )
      );
    }

    const counts = await getPodcastMassExpansionShowCounts();
    const status = getPodcastPendingPromotionStatus(adminRoot);

    console.log(
      JSON.stringify(
        {
          phase: "checkpoint",
          batch_index: index + 1,
          public_standard_shows: counts.public_standard_shows,
          public_mature_shows: counts.public_mature_shows,
          pending_promotion_state: status.state?.status || null,
          summary,
        },
        null,
        2
      )
    );

    if (!progressed) {
      await sleep(idleSleepMs);
      break;
    }
  }

  const finalCounts = await getPodcastMassExpansionShowCounts();
  console.log(
    JSON.stringify(
      {
        phase: "complete",
        finished_at: new Date().toISOString(),
        summary,
        counts: finalCounts,
      },
      null,
      2
    )
  );
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
