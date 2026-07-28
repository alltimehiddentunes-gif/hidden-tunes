/**
 * Process pending Africa Radio queue countries one at a time.
 *
 *   npx tsx scripts/run-radio-africa-queue-supervisor.ts --execute
 *   npx tsx scripts/run-radio-africa-queue-supervisor.ts --execute --max-countries 5
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { loadAfricaRadioQueue, saveAfricaRadioQueue } from "@/lib/radioAfricaExpansion/queue";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";

const adminRoot = path.resolve(__dirname, "..");

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const maxIndex = process.argv.indexOf("--max-countries");
  return {
    execute: args.has("--execute"),
    maxCountries: maxIndex >= 0 ? Number(process.argv[maxIndex + 1]) : Number(process.env.AFRICA_QUEUE_MAX || 54),
    skipCompleted: !args.has("--include-completed"),
  };
}

function runCountry(code: string, execute: boolean) {
  const script = path.join(adminRoot, "scripts", "run-radio-africa-country-expand.ts");
  const argv = [script, "--country", code];
  if (execute) argv.push("--execute");
  const result = spawnSync("npx", ["--yes", "tsx", ...argv], {
    cwd: adminRoot,
    env: {
      ...process.env,
      AFRICA_MAX_PAGES: process.env.AFRICA_MAX_PAGES || "20",
      RADIO_BATCH_DELAY_MS: process.env.RADIO_BATCH_DELAY_MS || "600",
      AFRICA_CONCURRENCY: process.env.AFRICA_CONCURRENCY || "3",
    },
    encoding: "utf8",
    shell: true,
  });
  return {
    code,
    status: result.status,
    stdout_tail: String(result.stdout || "").slice(-1500),
    stderr_tail: String(result.stderr || "").slice(-800),
  };
}

function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const queue = loadAfricaRadioQueue(adminRoot);
  const pending = queue.countries.filter((c) =>
    options.skipCompleted ? c.discovery_status !== "completed" : true
  );
  const selected = pending.slice(0, Math.max(0, options.maxCountries));
  console.log(
    JSON.stringify(
      {
        mode: options.execute ? "execute" : "dry-run",
        pending: pending.length,
        selected: selected.map((c) => c.code),
      },
      null,
      2
    )
  );

  const results = [];
  for (const entry of selected) {
    console.log(`\n=== Africa queue: ${entry.code} ${entry.country} ===`);
    const result = runCountry(entry.code, options.execute);
    results.push(result);
    if (result.status !== 0) {
      const q = loadAfricaRadioQueue(adminRoot);
      const row = q.countries.find((c) => c.code === entry.code);
      if (row) {
        row.discovery_status = "blocked";
        row.unresolved_blockers = [
          ...row.unresolved_blockers,
          `supervisor_exit_${result.status}`,
        ];
        saveAfricaRadioQueue(adminRoot, q);
      }
    }
  }

  console.log(JSON.stringify({ completed_runs: results.length, results }, null, 2));
}

main();
