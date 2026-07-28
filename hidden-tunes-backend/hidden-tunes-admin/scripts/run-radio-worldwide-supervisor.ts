/**
 * Worldwide Radio deep-search supervisor.
 * Continents in order: Africa (skip if completed) → Europe → North America →
 * South America → Asia → Oceania → Antarctica.
 *
 *   npx tsx scripts/run-radio-worldwide-supervisor.ts --execute
 *   npx tsx scripts/run-radio-worldwide-supervisor.ts --execute --max-countries 3
 *   npx tsx scripts/run-radio-worldwide-supervisor.ts --status
 *   npx tsx scripts/run-radio-worldwide-supervisor.ts --seed-all
 *   npx tsx scripts/run-radio-worldwide-supervisor.ts --mark-africa-completed
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { continentDisplayName } from "@/lib/radioWorldwideExpansion/continents";
import {
  loadContinentRadioQueue,
  saveContinentRadioQueue,
  saveWorldwideMasterReport,
  buildWorldwideMasterReport,
  continentQueuePath,
} from "@/lib/radioWorldwideExpansion/queue";
import type { WorldwideContinentId } from "@/lib/radioWorldwideExpansion/types";
import { WORLDWIDE_CONTINENT_ORDER } from "@/lib/radioWorldwideExpansion/types";
import { loadAfricaRadioQueue } from "@/lib/radioAfricaExpansion/queue";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";

const adminRoot = path.resolve(__dirname, "..");

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const maxIndex = process.argv.indexOf("--max-countries");
  const continentIndex = process.argv.indexOf("--continent");
  return {
    execute: args.has("--execute"),
    statusOnly: args.has("--status"),
    seedAll: args.has("--seed-all"),
    markAfricaCompleted: args.has("--mark-africa-completed"),
    maxCountries:
      maxIndex >= 0
        ? Number(process.argv[maxIndex + 1])
        : Number(process.env.WORLDWIDE_QUEUE_MAX || 0) || Number.POSITIVE_INFINITY,
    continentFilter:
      continentIndex >= 0
        ? (String(process.argv[continentIndex + 1] || "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_") as WorldwideContinentId)
        : null,
    skipCompleted: !args.has("--include-completed"),
  };
}

function runCountry(continent: WorldwideContinentId, code: string, execute: boolean) {
  const script = path.join(adminRoot, "scripts", "run-radio-continent-country-expand.ts");
  // Large markets (GB/US/DE/RU) emit huge reports; never buffer full stdout in the parent
  // or Windows can abort the supervisor with STATUS_STACK_BUFFER_OVERRUN (0xC0000409).
  const largeMarket = new Set(["US", "CA", "GB", "DE", "FR", "IT", "ES", "RU", "BR", "IN", "CN", "JP", "MX", "AU"]);
  const maxPages = largeMarket.has(code)
    ? process.env.WORLDWIDE_MAX_PAGES_LARGE || "16"
    : process.env.WORLDWIDE_MAX_PAGES || "24";
  const argv = [
    path.join(adminRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    script,
    "--continent",
    continent,
    "--country",
    code,
  ];
  if (execute) argv.push("--execute");
  // Avoid shell:true — on Windows it can crash child tsx processes (exit 3221226505).
  const result = spawnSync(process.execPath, argv, {
    cwd: adminRoot,
    env: {
      ...process.env,
      WORLDWIDE_MAX_PAGES: maxPages,
      RADIO_BATCH_DELAY_MS: process.env.RADIO_BATCH_DELAY_MS || "650",
      WORLDWIDE_CONCURRENCY: process.env.WORLDWIDE_CONCURRENCY || "2",
    },
    stdio: "inherit",
    shell: false,
  });
  return {
    continent,
    code,
    status: result.status,
    stdout_tail: "",
    stderr_tail: result.error ? String(result.error.message || result.error) : "",
  };
}

function markAfricaFromExistingQueue() {
  const africaLegacy = loadAfricaRadioQueue(adminRoot);
  const worldwideAfrica = loadContinentRadioQueue(adminRoot, "africa");
  const byCode = new Map(africaLegacy.countries.map((c) => [c.code.toUpperCase(), c]));

  for (const entry of worldwideAfrica.countries) {
    const legacy = byCode.get(entry.code.toUpperCase());
    if (!legacy) continue;
    entry.discovery_status =
      legacy.discovery_status === "completed" ? "completed" : legacy.discovery_status;
    entry.sources_searched = legacy.sources_searched || [];
    entry.candidates_discovered = legacy.candidates_discovered || 0;
    entry.candidates_tested = legacy.candidates_tested || 0;
    entry.imported = legacy.imported || 0;
    entry.updated = legacy.updated || 0;
    entry.restored = legacy.restored || 0;
    entry.duplicates = legacy.duplicates || 0;
    entry.quarantined = legacy.quarantined || 0;
    entry.rejected = legacy.rejected || 0;
    entry.public_playable_total = legacy.public_playable_total || 0;
    entry.mature_public_total = legacy.mature_public_total || 0;
    entry.last_completed_at = legacy.last_completed_at;
    entry.next_verification_at = legacy.next_verification_at;
    entry.unresolved_blockers = legacy.unresolved_blockers || [];
    entry.notes = [
      ...(entry.notes || []),
      "Synced from radio-africa-expansion-queue.json (Africa deep-search already exhausted).",
    ];
  }
  worldwideAfrica.current_country_code = africaLegacy.current_country_code;
  saveContinentRadioQueue(adminRoot, worldwideAfrica);
  return worldwideAfrica;
}

function seedContinent(continent: WorldwideContinentId) {
  const script = path.join(adminRoot, "scripts", "run-radio-continent-country-expand.ts");
  const result = spawnSync(
    "npx",
    ["--yes", "tsx", script, "--continent", continent, "--seed-queue"],
    {
      cwd: adminRoot,
      env: process.env,
      encoding: "utf8",
      shell: true,
    }
  );
  return { continent, status: result.status, stderr_tail: String(result.stderr || "").slice(-500) };
}

function nextPendingWork(options: ReturnType<typeof readArgs>) {
  const work: Array<{ continent: WorldwideContinentId; code: string; country: string }> = [];
  // Finish each continent fully (pending → in_progress → blocked retries)
  // before advancing to the next continent in WORLDWIDE_CONTINENT_ORDER.
  const statusOrder: Array<"pending" | "in_progress" | "blocked"> = [
    "pending",
    "in_progress",
    "blocked",
  ];
  for (const continent of WORLDWIDE_CONTINENT_ORDER) {
    if (options.continentFilter && continent !== options.continentFilter) continue;
    const queue = loadContinentRadioQueue(adminRoot, continent);
    for (const status of statusOrder) {
      for (const entry of queue.countries) {
        if (options.skipCompleted && entry.discovery_status === "completed") continue;
        if (entry.discovery_status !== status) continue;
        work.push({ continent, code: entry.code, country: entry.country });
        if (work.length >= options.maxCountries) return work;
      }
    }
    if (work.length) return work;
  }
  return work;
}

function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();

  if (options.markAfricaCompleted || options.seedAll) {
    const africa = markAfricaFromExistingQueue();
    console.log(
      JSON.stringify(
        {
          africa_synced: true,
          completed: africa.countries.filter((c) => c.discovery_status === "completed").length,
          total: africa.countries.length,
          path: continentQueuePath(adminRoot, "africa"),
        },
        null,
        2
      )
    );
  }

  if (options.seedAll) {
    const seeds = [];
    for (const continent of WORLDWIDE_CONTINENT_ORDER) {
      if (continent === "africa") continue;
      seeds.push(seedContinent(continent));
    }
    const master = saveWorldwideMasterReport(adminRoot);
    console.log(JSON.stringify({ seeded: seeds, master }, null, 2));
    return;
  }

  if (options.statusOnly) {
    const master = buildWorldwideMasterReport(adminRoot);
    saveWorldwideMasterReport(adminRoot, master);
    console.log(JSON.stringify(master, null, 2));
    return;
  }

  if (options.markAfricaCompleted && !options.execute) {
    saveWorldwideMasterReport(adminRoot);
    return;
  }

  const selected = nextPendingWork(options);
  console.log(
    JSON.stringify(
      {
        mode: options.execute ? "execute" : "dry-run",
        selected_count: selected.length,
        selected: selected.map((s) => `${s.continent}:${s.code}`),
      },
      null,
      2
    )
  );

  const results = [];
  for (const item of selected) {
    console.log(
      `\n=== Worldwide queue: ${continentDisplayName(item.continent)} / ${item.code} ${item.country} ===`
    );
    const result = runCountry(item.continent, item.code, options.execute);
    results.push(result);
    saveWorldwideMasterReport(adminRoot);

    if (result.status !== 0) {
      const q = loadContinentRadioQueue(adminRoot, item.continent);
      const row = q.countries.find((c) => c.code === item.code);
      if (row) {
        row.discovery_status = "blocked";
        row.unresolved_blockers = [
          ...row.unresolved_blockers,
          `supervisor_exit_${result.status}`,
        ];
        saveContinentRadioQueue(adminRoot, q);
        saveWorldwideMasterReport(adminRoot);
      }
      if (result.stderr_tail) console.error(result.stderr_tail);
    } else {
      console.log(`OK ${item.continent}:${item.code}`);
    }
  }

  const master = saveWorldwideMasterReport(adminRoot);
  const heartbeatPath = path.join(adminRoot, "data", "radio-worldwide-overnight-heartbeat.json");
  fs.writeFileSync(
    heartbeatPath,
    JSON.stringify(
      {
        updated_at: new Date().toISOString(),
        mode: options.execute ? "execute" : "dry-run",
        completed_runs: results.length,
        last_results: results.map((r) => ({
          continent: r.continent,
          code: r.code,
          status: r.status,
        })),
        master,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        completed_runs: results.length,
        heartbeat: heartbeatPath,
        master,
        results: results.map((r) => ({
          continent: r.continent,
          code: r.code,
          status: r.status,
        })),
      },
      null,
      2
    )
  );
}

main();
