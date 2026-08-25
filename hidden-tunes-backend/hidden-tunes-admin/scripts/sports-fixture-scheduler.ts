import fs from "node:fs";
import path from "node:path";

import { runSportsFixtureSchedulerOnce } from "@/lib/sports/workers/fixtureScheduler";

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

for (const name of [".env.production", ".env.local", ".env"]) {
  loadEnvFile(path.join(process.cwd(), name));
}

runSportsFixtureSchedulerOnce()
  .then((result) => {
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    if (result.status === "failed") process.exitCode = 1;
  })
  .catch((error) => {
    console.error(JSON.stringify({
      at: new Date().toISOString(),
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  });
