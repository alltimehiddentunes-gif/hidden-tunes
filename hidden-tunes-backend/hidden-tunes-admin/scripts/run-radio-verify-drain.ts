/**
 * Drain unchecked radio stations in bounded chunks so verification cannot hang forever.
 *
 *   npx tsx scripts/run-radio-verify-drain.ts --execute
 *   npx tsx scripts/run-radio-verify-drain.ts --execute --chunk 400 --max-chunks 40
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

function readArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    execute: args.has("--execute"),
    chunk: Number(
      process.argv.includes("--chunk") ? process.argv[process.argv.indexOf("--chunk") + 1] : 400
    ),
    maxChunks: Number(
      process.argv.includes("--max-chunks")
        ? process.argv[process.argv.indexOf("--max-chunks") + 1]
        : 50
    ),
  };
}

async function uncheckedCount() {
  loadAdminEnv(adminRoot);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const counts = await getRadioCatalogCounts(supabase);
  return counts;
}

function runVerifyChunk(limit: number) {
  const env = {
    ...process.env,
    RADIO_VERIFY_CONCURRENCY: process.env.RADIO_VERIFY_CONCURRENCY || "10",
    RADIO_VERIFY_TIMEOUT_MS: process.env.RADIO_VERIFY_TIMEOUT_MS || "8000",
    RADIO_VERIFY_CHECKPOINT_EVERY: process.env.RADIO_VERIFY_CHECKPOINT_EVERY || "20",
  };
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/run-radio-expansion-verify-unchecked.ts", "--execute", "--limit", String(limit)],
    { cwd: adminRoot, shell: process.platform === "win32", stdio: "inherit", env }
  );
  if (result.status !== 0) {
    throw new Error(`verify chunk failed exit=${result.status}`);
  }
}

async function main() {
  const options = readArgs();
  if (!options.execute) {
    console.log(JSON.stringify({ mode: "dry-plan", ...options }, null, 2));
    return;
  }

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
    runVerifyChunk(Math.min(options.chunk, before.unchecked));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
