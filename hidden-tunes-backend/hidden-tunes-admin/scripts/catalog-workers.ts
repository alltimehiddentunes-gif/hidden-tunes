import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_WORKERS,
  getCatalogWorkerDataDir,
  readWorkerState,
  verifyCatalogWorkers,
} from "@/lib/catalogWorkerSystem";

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

function runPm2(args: string[], options: { inherit?: boolean } = {}) {
  const result = spawnSync("pm2", args, {
    cwd: adminRoot,
    shell: process.platform === "win32",
    env: process.env,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(output || `pm2 ${args.join(" ")} failed`);
  }

  return result.stdout || "";
}

function startWorkers() {
  for (const worker of CATALOG_WORKERS) {
    try {
      runPm2(["delete", worker.pm2Name]);
    } catch {
      // PM2 exits nonzero when the process does not exist yet.
    }
    runPm2([
      "start",
      "npx",
      "--name",
      worker.pm2Name,
      "--cron-restart",
      worker.cron,
      "--no-autorestart",
      "--time",
      "--",
      "tsx",
      "scripts/catalog-worker.ts",
      "--section",
      worker.section,
      "--scheduled",
    ]);
  }
  runPm2(["save"]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        scheduled: CATALOG_WORKERS.map((worker) => ({
          name: worker.pm2Name,
          section: worker.section,
          cron: worker.cron,
          schedule: worker.schedule,
        })),
      },
      null,
      2
    )
  );
}

function stopWorkers() {
  for (const worker of CATALOG_WORKERS) {
    try {
      runPm2(["stop", worker.pm2Name]);
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: worker.pm2Name,
          warning: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }
}

function showStatus() {
  let pm2Available = true;
  let parsed: Array<{
    name?: string;
    pm2_env?: { status?: string; restart_time?: number; unstable_restarts?: number };
    monit?: { memory?: number; cpu?: number };
  }> = [];

  try {
    const pm2 = runPm2(["jlist"]);
    parsed = JSON.parse(pm2 || "[]") as typeof parsed;
  } catch (error) {
    pm2Available = false;
    console.error(
      JSON.stringify({
        warning: "PM2 is not available in this environment; showing saved worker state only.",
        detail: error instanceof Error ? error.message : String(error),
      })
    );
  }

  const byName = new Map(parsed.map((entry) => [entry.name, entry]));

  console.log(
    JSON.stringify(
      {
        pm2_available: pm2Available,
        workers: CATALOG_WORKERS.map((worker) => ({
          ...worker,
          pm2: byName.get(worker.pm2Name)
            ? {
                status: byName.get(worker.pm2Name)?.pm2_env?.status,
                schedule: worker.schedule,
                cron: worker.cron,
                restarts: byName.get(worker.pm2Name)?.pm2_env?.restart_time,
                unstable_restarts:
                  byName.get(worker.pm2Name)?.pm2_env?.unstable_restarts,
                memory: byName.get(worker.pm2Name)?.monit?.memory,
                cpu: byName.get(worker.pm2Name)?.monit?.cpu,
              }
            : null,
          state: readWorkerState(worker.section, adminRoot),
        })),
      },
      null,
      2
    )
  );
}

function showLogs() {
  const dataDir = getCatalogWorkerDataDir(adminRoot);
  for (const worker of CATALOG_WORKERS) {
    const filePath = path.join(dataDir, "logs", `${worker.section}.jsonl`);
    const lines = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).slice(-40)
      : [];
    console.log(`\n== ${worker.pm2Name} (${worker.section}) ==`);
    for (const line of lines) console.log(line);
  }
}

async function verify() {
  console.log(JSON.stringify(await verifyCatalogWorkers(), null, 2));
}

loadEnvFile(path.join(adminRoot, ".env.production"));
loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));
process.chdir(adminRoot);

const command = process.argv[2] || "status";

if (command === "start") {
  startWorkers();
} else if (command === "status") {
  showStatus();
} else if (command === "logs") {
  showLogs();
} else if (command === "stop") {
  stopWorkers();
} else if (command === "verify") {
  verify().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} else {
  throw new Error("Usage: tsx scripts/catalog-workers.ts start|status|logs|stop|verify");
}
