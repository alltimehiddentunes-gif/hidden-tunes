/**
 * PM2 supervisor for the continuous podcast mass-expansion worker.
 *
 * Usage:
 *   npx tsx scripts/podcast-expansion-pm2.ts start
 *   npx tsx scripts/podcast-expansion-pm2.ts status
 *   npx tsx scripts/podcast-expansion-pm2.ts stop
 *   npx tsx scripts/podcast-expansion-pm2.ts logs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PM2_NAME = "hidden-tunes-podcast-expansion";
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
loadEnvFile(path.join(adminRoot, ".env.production"));
loadEnvFile(path.join(adminRoot, ".env"));

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

function findRunningWorker() {
  try {
    const parsed = JSON.parse(runPm2(["jlist"]) || "[]") as Array<{
      name?: string;
      pid?: number;
      pm2_env?: { status?: string; restart_time?: number; pm_uptime?: number };
    }>;
    return parsed.find((entry) => entry.name === PM2_NAME) || null;
  } catch {
    return null;
  }
}

function startWorker() {
  const existing = findRunningWorker();
  if (existing?.pm2_env?.status === "online") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          already_running: true,
          name: PM2_NAME,
          pid: existing.pid,
          status: existing.pm2_env?.status,
        },
        null,
        2
      )
    );
    return;
  }

  try {
    runPm2(["delete", PM2_NAME]);
  } catch {
    // Process may not exist yet.
  }

  runPm2([
    "start",
    "npm",
    "--name",
    PM2_NAME,
    "--cwd",
    adminRoot,
    "--instances",
    "1",
    "--max-restarts",
    "25",
    "--exp-backoff-restart-delay",
    "5000",
    "--time",
    "--merge-logs",
    "--",
    "run",
    "podcasts:expand",
    "--",
    "--target-standard=100000",
    "--target-mature=30000",
    "--resume",
  ]);

  runPm2(["save"]);

  const started = findRunningWorker();
  console.log(
    JSON.stringify(
      {
        ok: true,
        started: true,
        name: PM2_NAME,
        pid: started?.pid || null,
        status: started?.pm2_env?.status || "unknown",
        command:
          "npm run podcasts:expand -- --target-standard=100000 --target-mature=30000 --resume",
      },
      null,
      2
    )
  );
}

function stopWorker() {
  runPm2(["stop", PM2_NAME]);
  console.log(JSON.stringify({ ok: true, stopped: PM2_NAME }, null, 2));
}

function showStatus() {
  const worker = findRunningWorker();
  console.log(
    JSON.stringify(
      {
        ok: true,
        name: PM2_NAME,
        running: worker?.pm2_env?.status === "online",
        pid: worker?.pid || null,
        status: worker?.pm2_env?.status || "not_found",
        restarts: worker?.pm2_env?.restart_time || 0,
      },
      null,
      2
    )
  );
}

function showLogs() {
  runPm2(["logs", PM2_NAME, "--lines", "200", "--nostream"], { inherit: true });
}

const command = process.argv[2];
if (command === "start") startWorker();
else if (command === "stop") stopWorker();
else if (command === "status") showStatus();
else if (command === "logs") showLogs();
else {
  throw new Error(
    "Usage: tsx scripts/podcast-expansion-pm2.ts start|stop|status|logs"
  );
}
