import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPodcastHealthWorkerBatch } from "../lib/podcastHealth";
import { recoverStuckPodcastHealthJobs } from "../lib/podcastHealthQueue";
import { collectPodcastObservability } from "../lib/podcastObservability";
import { supabaseAdmin } from "../lib/supabaseAdmin";

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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = Number(process.env.PODCAST_VERIFY_BATCH_SIZE || 50);
  const before = await collectPodcastObservability();

  const recovered = await recoverStuckPodcastHealthJobs();

  let requeued = 0;
  if (!dryRun) {
    const { data, error } = await supabaseAdmin
      .from("podcast_health_queue")
      .select("id")
      .eq("status", "failed")
      .limit(limit);

    if (error && !/podcast_health_queue/i.test(error.message)) {
      throw new Error(error.message);
    }

    const ids = (data || []).map((row) => String(row.id));
    if (ids.length) {
      const { error: updateError } = await supabaseAdmin
        .from("podcast_health_queue")
        .update({
          status: "pending",
          scheduled_at: new Date().toISOString(),
          finished_at: null,
          last_error: "manual_retry",
        })
        .in("id", ids);
      if (updateError && !/podcast_health_queue/i.test(updateError.message)) {
        throw new Error(updateError.message);
      }
      requeued = ids.length;
    }
  }

  const worker = dryRun
    ? { dry_run: true, jobs_claimed: 0 }
    : await runPodcastHealthWorkerBatch({ limit, catalog: "all" });
  const after = await collectPodcastObservability();

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        recovered_stuck_jobs: recovered,
        requeued_failed_jobs: requeued,
        before,
        worker,
        after,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
