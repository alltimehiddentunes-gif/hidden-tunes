/**
 * Keeps podcast expand + promote-pending workers alive until public targets are met.
 *
 * Usage:
 *   npx tsx scripts/run-podcast-expansion-supervisor.ts
 *   npx tsx scripts/run-podcast-expansion-supervisor.ts --target-standard=40000 --target-mature=10000
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPodcastMassExpansionShowCounts } from "@/lib/podcastMassExpansionStatus";
import { isExpansionTargetMet } from "@/lib/podcastMassExpansionStatus";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WorkerSpec = {
  name: string;
  args: string[];
  logFile: string;
};

function startWorker(spec: WorkerSpec): ChildProcess {
  fs.mkdirSync(path.dirname(spec.logFile), { recursive: true });
  const out = fs.openSync(spec.logFile, "a");
  const child = spawn("npx", ["tsx", ...spec.args], {
    cwd: adminRoot,
    env: process.env,
    shell: true,
    stdio: ["ignore", out, out],
    detached: false,
  });
  child.on("exit", (code, signal) => {
    console.log(
      JSON.stringify({
        event: "worker_exit",
        name: spec.name,
        code,
        signal,
        at: new Date().toISOString(),
      })
    );
  });
  console.log(
    JSON.stringify({
      event: "worker_start",
      name: spec.name,
      pid: child.pid,
      args: spec.args,
      at: new Date().toISOString(),
    })
  );
  return child;
}

async function main() {
  const targetStandard = Number(readArg("target-standard") || 40_000);
  const targetMature = Number(readArg("target-mature") || 10_000);
  const pollMs = Number(readArg("poll-ms") || 60_000);
  const logDir = path.join(adminRoot, "data", "podcast-mass-expansion", "logs");

  const workers: Array<{ spec: WorkerSpec; child: ChildProcess | null }> = [
    {
      spec: {
        name: "expand",
        args: [
          "scripts/run-podcasts-expand.ts",
          `--target-standard=${targetStandard}`,
          `--target-mature=${targetMature}`,
          "--loop",
          "--resume",
          "--batch-size=150",
          "--max-batches=10000",
        ],
        logFile: path.join(logDir, "supervisor-expand.log"),
      },
      child: null,
    },
    {
      spec: {
        name: "promote",
        args: [
          "scripts/run-podcasts-promote-pending-loop.ts",
          "--resume",
          "--catalogs=standard,mature",
          "--limit=150",
          "--delay-ms=400",
          "--max-batches=10000",
        ],
        logFile: path.join(logDir, "supervisor-promote.log"),
      },
      child: null,
    },
  ];

  console.log(
    JSON.stringify(
      {
        phase: "supervisor_start",
        target_standard: targetStandard,
        target_mature: targetMature,
        poll_ms: pollMs,
      },
      null,
      2
    )
  );

  while (true) {
    const counts = await getPodcastMassExpansionShowCounts();
    const targets = { standard: targetStandard, mature: targetMature };
    console.log(
      JSON.stringify({
        event: "status",
        at: new Date().toISOString(),
        public_standard_shows: counts.public_standard_shows,
        public_mature_shows: counts.public_mature_shows,
        standard_shows: counts.standard_shows,
        mature_shows: counts.mature_shows,
        remaining: {
          standard: Math.max(0, targetStandard - counts.public_standard_shows),
          mature: Math.max(0, targetMature - counts.public_mature_shows),
        },
      })
    );

    if (isExpansionTargetMet(counts, targets)) {
      console.log(JSON.stringify({ event: "targets_met", counts, targets }));
      for (const worker of workers) {
        if (worker.child && !worker.child.killed) {
          worker.child.kill();
        }
      }
      break;
    }

    for (const worker of workers) {
      if (!worker.child || worker.child.exitCode !== null) {
        worker.child = startWorker(worker.spec);
      }
    }

    await sleep(pollMs);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
});
