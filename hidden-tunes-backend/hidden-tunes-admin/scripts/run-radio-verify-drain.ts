/**
 * Drain unchecked radio stations in bounded chunks so verification cannot hang forever.
 *
 *   npx tsx scripts/run-radio-verify-drain.ts --execute
 *   npx tsx scripts/run-radio-verify-drain.ts --execute --chunk 50 --max-chunks 200
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  fetchProductionCombinedPublicCount,
  getRadioCatalogCounts,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";

const adminRoot = path.resolve(__dirname, "..");
const NATIVE_CRASH_EXIT = 3221226505;

function readArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    execute: args.has("--execute"),
    chunk: Number(
      process.argv.includes("--chunk") ? process.argv[process.argv.indexOf("--chunk") + 1] : 50
    ),
    maxChunks: Number(
      process.argv.includes("--max-chunks")
        ? process.argv[process.argv.indexOf("--max-chunks") + 1]
        : 200
    ),
  };
}

function getSupabase() {
  loadAdminEnv(adminRoot);
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function uncheckedCount(retries = 5) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await getRadioCatalogCounts(getSupabase());
    } catch (error) {
      lastError = error;
      const waitMs = Math.min(30_000, 2000 * attempt * attempt);
      console.error(
        JSON.stringify({
          event: "unchecked_count_retry",
          attempt,
          wait_ms: waitMs,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function quarantineHeadUnchecked(limit: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("radio_stations")
    .select("id")
    .eq("playback_status", "unchecked")
    .eq("is_mature", false)
    .is("disabled_at", null)
    .order("imported_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const ids = (data || []).map((row) => String(row.id));
  if (!ids.length) return { quarantined: 0, ids: [] as string[] };

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("radio_stations")
    .update({
      playback_status: "failed",
      is_verified: false,
      health_status: "quarantined",
      consecutive_failures: 3,
      last_health_checked_at: now,
      last_health_error: "verifier_native_crash_skip",
      quarantined_at: now,
      quarantine_reason: "verifier_native_crash_skip",
    })
    .in("id", ids)
    .eq("playback_status", "unchecked");
  if (updateError) throw updateError;
  return { quarantined: ids.length, ids };
}

function runVerifyChunk(limit: number) {
  const env = {
    ...process.env,
    RADIO_VERIFY_CONCURRENCY: process.env.RADIO_VERIFY_CONCURRENCY || "3",
    RADIO_VERIFY_TIMEOUT_MS: process.env.RADIO_VERIFY_TIMEOUT_MS || "8000",
    RADIO_VERIFY_CHECKPOINT_EVERY: process.env.RADIO_VERIFY_CHECKPOINT_EVERY || "5",
  };
  // Avoid shell:true Ã¢â‚¬â€ on Windows it can crash child tsx processes (exit 3221226505).
  const result = spawnSync(
    process.execPath,
    [
      path.join(adminRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(adminRoot, "scripts", "run-radio-expansion-verify-unchecked.ts"),
      "--execute",
      "--limit",
      String(limit),
    ],
    { cwd: adminRoot, shell: false, stdio: "inherit", env }
  );
  return result.status ?? 1;
}

async function main() {
  const options = readArgs();
  if (!options.execute) {
    console.log(JSON.stringify({ mode: "dry-plan", ...options }, null, 2));
    return;
  }

  let consecutiveCrashes = 0;

  for (let i = 0; i < options.maxChunks; i += 1) {
    const before = await uncheckedCount();
    const combined = await fetchProductionCombinedPublicCount().catch(() => ({
      general: before.public_general,
      mature: before.public_mature,
      total: before.public_general + before.public_mature,
    }));
    console.log(
      JSON.stringify(
        {
          chunk: i + 1,
          unchecked: before.unchecked,
          combined_public: combined.total,
          remaining_40k: Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - combined.total),
        },
        null,
        2
      )
    );
    if (before.unchecked <= 0) {
      console.log(JSON.stringify({ complete: true, reason: "no_unchecked" }, null, 2));
      return;
    }

    const chunkSize = Math.min(options.chunk, before.unchecked);
    const exitCode = runVerifyChunk(chunkSize);
    if (exitCode === 0) {
      consecutiveCrashes = 0;
      continue;
    }

    const isNativeCrash = exitCode === NATIVE_CRASH_EXIT || exitCode > 255;
    consecutiveCrashes = isNativeCrash ? consecutiveCrashes + 1 : 0;
    console.error(
      JSON.stringify(
        {
          chunk: i + 1,
          verify_chunk_exit: exitCode,
          native_crash: isNativeCrash,
          consecutive_crashes: consecutiveCrashes,
          action: isNativeCrash ? "quarantine_head_and_continue" : "continue_next_chunk",
        },
        null,
        2
      )
    );

    if (isNativeCrash) {
      const skipCount = Math.min(8, Math.max(2, consecutiveCrashes * 2));
      const skipped = await quarantineHeadUnchecked(skipCount);
      console.error(
        JSON.stringify(
          {
            event: "quarantine_after_native_crash",
            quarantined: skipped.quarantined,
            ids: skipped.ids,
          },
          null,
          2
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
