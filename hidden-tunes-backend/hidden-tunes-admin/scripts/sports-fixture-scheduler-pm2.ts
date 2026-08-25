import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  SPORTS_FIXTURE_SCHEDULER_CRON,
  SPORTS_FIXTURE_SCHEDULER_PM2_NAME,
} from "@/lib/sports/workers/fixtureScheduler";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function pm2(args: string[], inherit = false) {
  const result = spawnSync("pm2", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `pm2 ${args.join(" ")} failed`);
  return result.stdout || "";
}

for (const name of [".env.production", ".env.local", ".env"]) {
  loadEnvFile(path.join(process.cwd(), name));
}

const command = process.argv[2] || "status";
if (command === "start") {
  if (process.env.SPORTS_FIXTURE_SCHEDULER_ENABLED !== "true") {
    throw new Error("Refusing scheduler activation: SPORTS_FIXTURE_SCHEDULER_ENABLED must be true");
  }
  if (process.env.SPORTS_FIXTURE_SCHEDULER_KILL_SWITCH === "true") {
    throw new Error("Refusing scheduler activation: kill switch is true");
  }
  try { pm2(["delete", SPORTS_FIXTURE_SCHEDULER_PM2_NAME]); } catch { /* first start */ }
  pm2([
    "start", "npx", "--name", SPORTS_FIXTURE_SCHEDULER_PM2_NAME,
    "--cron-restart", SPORTS_FIXTURE_SCHEDULER_CRON,
    "--no-autorestart", "--time", "--",
    "tsx", "scripts/sports-fixture-scheduler.ts",
  ], true);
  pm2(["save"], true);
} else if (command === "stop") {
  pm2(["stop", SPORTS_FIXTURE_SCHEDULER_PM2_NAME], true);
  pm2(["save"], true);
} else if (command === "logs") {
  pm2(["logs", SPORTS_FIXTURE_SCHEDULER_PM2_NAME, "--lines", "80", "--nostream"], true);
} else if (command === "status") {
  const rows = JSON.parse(pm2(["jlist"]) || "[]") as Array<Record<string, unknown>>;
  console.log(JSON.stringify({
    name: SPORTS_FIXTURE_SCHEDULER_PM2_NAME,
    cron: SPORTS_FIXTURE_SCHEDULER_CRON,
    process: rows.find((row) => row.name === SPORTS_FIXTURE_SCHEDULER_PM2_NAME) || null,
  }, null, 2));
} else {
  throw new Error("Usage: tsx scripts/sports-fixture-scheduler-pm2.ts start|stop|status|logs");
}
