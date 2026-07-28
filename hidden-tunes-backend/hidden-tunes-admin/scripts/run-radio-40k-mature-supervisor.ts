/**
 * Continuous supervisor for 40k general + 5k mature radio expansion.
 * Resumes from checkpoints; does not stop between successful batches.
 *
 *   npx tsx scripts/run-radio-40k-mature-supervisor.ts --execute
 *   npx tsx scripts/run-radio-40k-mature-supervisor.ts --execute --max-cycles 40
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  fetchProductionPublicCount,
  getRadioCatalogCounts,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";

const MATURE_PUBLIC_TARGET = 5_000;
const adminRoot = path.resolve(__dirname, "..");
const statePath = path.join(adminRoot, "data", "radio-40k-mature-supervisor.state.json");

type State = {
  updated_at: string;
  cycles_completed: number;
  last_public_total: number;
  last_public_general: number;
  last_public_mature: number;
  history: Array<Record<string, unknown>>;
};

function readArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    execute: args.has("--execute"),
    maxCycles: Number(
      process.argv.includes("--max-cycles")
        ? process.argv[process.argv.indexOf("--max-cycles") + 1]
        : 40
    ),
    skipInitialVerify: args.has("--skip-initial-verify"),
  };
}

function loadState(): State {
  if (!fs.existsSync(statePath)) {
    return {
      updated_at: new Date().toISOString(),
      cycles_completed: 0,
      last_public_total: 0,
      last_public_general: 0,
      last_public_mature: 0,
      history: [],
    };
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as State;
}

function saveState(state: State) {
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function runStep(script: string, extraArgs: string[] = []) {
  const result = spawnSync("npx", ["tsx", script, ...extraArgs], {
    cwd: adminRoot,
    shell: process.platform === "win32",
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit ${result.status}`);
  }
}

async function measure() {
  loadAdminEnv(adminRoot);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const counts = await getRadioCatalogCounts(supabase);
  const productionPublic = await fetchProductionPublicCount().catch(() => counts.public_general);

  let matureApiTotal: number | null = null;
  try {
    const response = await fetch(
      "https://admin.hiddentunes.com/api/radio/mature/stations?limit=1&page=1&mature_enabled=true&age_confirmed=true",
      { cache: "no-store" }
    );
    if (response.ok) {
      const json = (await response.json()) as { pagination?: { total?: number } };
      matureApiTotal = Number(json.pagination?.total || 0);
    }
  } catch {
    matureApiTotal = null;
  }

  return {
    production_public_general: productionPublic,
    db_public_general: counts.public_general,
    db_public_mature: counts.public_mature,
    mature_api_total: matureApiTotal,
    unchecked: counts.unchecked,
    total: counts.total,
    public_total_eligible: counts.public_general + counts.public_mature,
  };
}

async function main() {
  const options = readArgs();
  const state = loadState();

  if (!options.execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-plan",
          targets: { total_public: RADIO_PUBLIC_PLAYABLE_TARGET, mature_public: MATURE_PUBLIC_TARGET },
          planned: [
            "force verify unchecked",
            "mature expand + verify + promote",
            "mature reclassify existing",
            "general batch8/9/10 rotate",
            "verify unchecked after imports",
            "repeat until targets met",
          ],
        },
        null,
        2
      )
    );
    return;
  }

  for (let cycle = 0; cycle < options.maxCycles; cycle += 1) {
    const before = await measure();
    const totalGap = Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - before.public_total_eligible);
    const matureGap = Math.max(0, MATURE_PUBLIC_TARGET - before.db_public_mature);

    console.log(
      JSON.stringify(
        {
          cycle: cycle + 1,
          before,
          total_gap: totalGap,
          mature_gap: matureGap,
        },
        null,
        2
      )
    );

    if (totalGap <= 0 && matureGap <= 0) {
      state.last_public_total = before.public_total_eligible;
      state.last_public_general = before.db_public_general;
      state.last_public_mature = before.db_public_mature;
      state.history.push({ at: new Date().toISOString(), action: "complete", ...before });
      saveState(state);
      console.log(JSON.stringify({ complete: true, ...before }, null, 2));
      return;
    }

    if (cycle === 0 && !options.skipInitialVerify && before.unchecked > 0) {
      runStep("scripts/run-radio-expansion-verify-unchecked.ts", ["--execute", "--force"]);
    }

    if (matureGap > 0) {
      runStep("scripts/run-radio-mature-reclassify-existing.ts", [
        "--execute",
        "--limit",
        String(Math.min(8000, matureGap + 2000)),
      ]);
      runStep("scripts/run-radio-mature-expansion.ts", [
        "--execute",
        "--max-pages",
        String(Math.min(1200, Math.max(200, matureGap))),
      ]);
      runStep("scripts/run-radio-mature-verify.ts", ["--execute"]);
      runStep("scripts/run-radio-mature-promote.ts", ["--execute"]);
    }

    if (totalGap > 0) {
      const batch =
        cycle % 3 === 0
          ? "scripts/run-radio-general-batch8.ts"
          : cycle % 3 === 1
            ? "scripts/run-radio-general-batch9.ts"
            : "scripts/run-radio-general-batch10.ts";
      runStep(batch, [
        "--execute",
        "--target",
        String(Math.min(8000, totalGap + 2000)),
        "--max-pages",
        "3500",
      ]);
      runStep("scripts/run-radio-expansion-verify-unchecked.ts", ["--execute"]);
    }

    const after = await measure();
    state.cycles_completed = cycle + 1;
    state.last_public_total = after.public_total_eligible;
    state.last_public_general = after.db_public_general;
    state.last_public_mature = after.db_public_mature;
    state.history.push({
      at: new Date().toISOString(),
      cycle: cycle + 1,
      before,
      after,
      total_gap_after: Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - after.public_total_eligible),
      mature_gap_after: Math.max(0, MATURE_PUBLIC_TARGET - after.db_public_mature),
    });
    saveState(state);
  }

  const finalMeasure = await measure();
  console.log(
    JSON.stringify(
      {
        complete:
          finalMeasure.public_total_eligible >= RADIO_PUBLIC_PLAYABLE_TARGET &&
          finalMeasure.db_public_mature >= MATURE_PUBLIC_TARGET,
        ...finalMeasure,
        remaining_total_gap: Math.max(
          0,
          RADIO_PUBLIC_PLAYABLE_TARGET - finalMeasure.public_total_eligible
        ),
        remaining_mature_gap: Math.max(0, MATURE_PUBLIC_TARGET - finalMeasure.db_public_mature),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
