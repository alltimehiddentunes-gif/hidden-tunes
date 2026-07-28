import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  fetchProductionPublicCount,
  getRadioCatalogCounts,
  remainingPublicPlayableGap,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";
import { createClient } from "@supabase/supabase-js";

const adminRoot = path.resolve(__dirname, "..");
const statePath = path.join(adminRoot, "data", "radio-expansion-25k-pipeline.state.json");

type PipelineState = {
  updated_at: string;
  last_public_count: number;
  remaining_gap: number;
  cycles_completed: number;
  last_batch: string | null;
  history: Array<{
    at: string;
    public_count: number;
    remaining_gap: number;
    action: string;
  }>;
};

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const targetIndex = process.argv.indexOf("--target");
  const maxCyclesIndex = process.argv.indexOf("--max-cycles");
  return {
    execute: args.has("--execute"),
    discoverOnly: args.has("--discover-only"),
    verifyOnly: args.has("--verify-only"),
    target: targetIndex >= 0 ? Number(process.argv[targetIndex + 1]) : 20_000,
    maxCycles: maxCyclesIndex >= 0 ? Number(process.argv[maxCyclesIndex + 1]) : 50,
    batchPrefix: "batch3",
  };
}

function loadState(): PipelineState {
  if (!fs.existsSync(statePath)) {
    return {
      updated_at: new Date().toISOString(),
      last_public_count: 0,
      remaining_gap: RADIO_PUBLIC_PLAYABLE_TARGET,
      cycles_completed: 0,
      last_batch: null,
      history: [],
    };
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as PipelineState;
}

function saveState(state: PipelineState) {
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function runStep(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: adminRoot,
    shell: process.platform === "win32",
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

async function getPublicCount() {
  try {
    return await fetchProductionPublicCount();
  } catch {
    loadAdminEnv(adminRoot);
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const counts = await getRadioCatalogCounts(supabase);
    return counts.public_general;
  }
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const state = loadState();
  const executeFlag = options.execute ? ["--execute"] : [];

  for (let cycle = 0; cycle < options.maxCycles; cycle += 1) {
    const publicCount = await getPublicCount();
    const gap = remainingPublicPlayableGap(publicCount);
    state.last_public_count = publicCount;
    state.remaining_gap = gap;
    state.history.push({
      at: new Date().toISOString(),
      public_count: publicCount,
      remaining_gap: gap,
      action: "count_check",
    });

    console.log(
      JSON.stringify(
        {
          cycle: cycle + 1,
          public_count: publicCount,
          target: RADIO_PUBLIC_PLAYABLE_TARGET,
          remaining_gap: gap,
        },
        null,
        2
      )
    );

    if (publicCount >= RADIO_PUBLIC_PLAYABLE_TARGET) {
      saveState(state);
      console.log(JSON.stringify({ complete: true, public_count: publicCount }, null, 2));
      return;
    }

    if (!options.discoverOnly) {
      runStep("npx", [
        "tsx",
        "scripts/run-radio-general-batch7.ts",
        ...executeFlag,
        "--discover-only",
        "--target",
        String(options.target),
      ]);
      state.last_batch = "batch7-discover";
    }

    if (!options.discoverOnly) {
      runStep("npx", [
        "tsx",
        "scripts/run-radio-general-batch7.ts",
        ...executeFlag,
        "--import-only",
      ]);
      state.last_batch = "batch7-import";
    }

    if (!options.discoverOnly) {
      runStep("npx", [
        "tsx",
        "scripts/run-radio-expansion-verify-unchecked.ts",
        ...executeFlag,
      ]);
      state.last_batch = "unchecked-verification";
    }

    state.cycles_completed += 1;
    saveState(state);

    const afterCount = await getPublicCount();
    if (afterCount >= RADIO_PUBLIC_PLAYABLE_TARGET) {
      console.log(JSON.stringify({ complete: true, public_count: afterCount }, null, 2));
      return;
    }
  }

  const finalCount = await getPublicCount();
  console.log(
    JSON.stringify(
      {
        complete: finalCount >= RADIO_PUBLIC_PLAYABLE_TARGET,
        public_count: finalCount,
        remaining_gap: remainingPublicPlayableGap(finalCount),
        cycles_completed: state.cycles_completed,
        note: "Reached max cycles before target; rerun pipeline to continue.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
