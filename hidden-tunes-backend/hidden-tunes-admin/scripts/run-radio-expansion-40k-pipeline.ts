import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  fetchProductionPublicCount,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";
import { listPendingApprovalRadioSources } from "@/lib/radioExpansion25k/sourceRegistry";

/**
 * Resumable 40k public-eligible radio expansion orchestrator.
 *
 * Waves:
 *  1) verify unchecked pool
 *  2) batch8 coverage repair (discover+import+verify)
 *  3) batch9 regional depth
 *  4) batch10 language/community depth
 *  5) gap-closure cycles on batch8–10 until target or exhaustion
 */

const adminRoot = path.resolve(__dirname, "..");
const statePath = path.join(adminRoot, "data", "radio-expansion-40k-pipeline.state.json");

type PipelineState = {
  updated_at: string;
  last_public_count: number;
  remaining_gap: number;
  cycles_completed: number;
  last_action: string | null;
  history: Array<{ at: string; public_count: number; remaining_gap: number; action: string }>;
};

function readArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    execute: args.has("--execute"),
    maxCycles: Number(
      process.argv.includes("--max-cycles")
        ? process.argv[process.argv.indexOf("--max-cycles") + 1]
        : 30
    ),
    skipVerify: args.has("--skip-verify"),
  };
}

function loadState(): PipelineState {
  if (!fs.existsSync(statePath)) {
    return {
      updated_at: new Date().toISOString(),
      last_public_count: 0,
      remaining_gap: RADIO_PUBLIC_PLAYABLE_TARGET,
      cycles_completed: 0,
      last_action: null,
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

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const state = loadState();
  const pending = listPendingApprovalRadioSources();

  console.log(
    JSON.stringify(
      {
        mode: options.execute ? "execute" : "dry-plan",
        target: RADIO_PUBLIC_PLAYABLE_TARGET,
        pending_approval_sources: pending.map((s) => s.source_name),
        note: "Icecast YP and broadcaster playlist adapters remain disabled pending approval.",
      },
      null,
      2
    )
  );

  if (!options.execute) {
    console.log(
      JSON.stringify(
        {
          planned_steps: [
            "verify-unchecked (--force if still unchecked)",
            "batch8 discover+import",
            "verify new unchecked",
            "batch9 discover+import",
            "verify",
            "batch10 discover+import",
            "verify",
            "repeat gap-closure until 40000 public eligible or sources exhausted",
          ],
        },
        null,
        2
      )
    );
    return;
  }

  for (let cycle = 0; cycle < options.maxCycles; cycle += 1) {
    const publicCount = await fetchProductionPublicCount().catch(() => state.last_public_count);
    const remaining = Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - publicCount);
    state.last_public_count = publicCount;
    state.remaining_gap = remaining;
    state.cycles_completed = cycle + 1;

    if (remaining <= 0) {
      state.last_action = "complete";
      state.history.push({
        at: new Date().toISOString(),
        public_count: publicCount,
        remaining_gap: 0,
        action: "complete",
      });
      saveState(state);
      console.log(JSON.stringify({ complete: true, public_count: publicCount }, null, 2));
      return;
    }

    if (cycle === 0 && !options.skipVerify) {
      state.last_action = "verify-unchecked-force";
      saveState(state);
      runStep("scripts/run-radio-expansion-verify-unchecked.ts", ["--execute"]);
    }

    const batch =
      cycle % 3 === 0
        ? "scripts/run-radio-general-batch8.ts"
        : cycle % 3 === 1
          ? "scripts/run-radio-general-batch9.ts"
          : "scripts/run-radio-general-batch10.ts";

    const action = `${path.basename(batch)}:execute`;
    state.last_action = action;
    state.history.push({
      at: new Date().toISOString(),
      public_count: publicCount,
      remaining_gap: remaining,
      action,
    });
    saveState(state);

    runStep(batch, ["--execute", "--target", String(Math.min(8000, remaining + 2000))]);
    runStep("scripts/run-radio-expansion-verify-unchecked.ts", ["--execute"]);
  }

  const finalCount = await fetchProductionPublicCount();
  console.log(
    JSON.stringify(
      {
        complete: finalCount >= RADIO_PUBLIC_PLAYABLE_TARGET,
        public_count: finalCount,
        remaining_gap: Math.max(0, RADIO_PUBLIC_PLAYABLE_TARGET - finalCount),
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
