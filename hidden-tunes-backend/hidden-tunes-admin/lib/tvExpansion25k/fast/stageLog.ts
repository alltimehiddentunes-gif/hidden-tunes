import fs from "node:fs";
import path from "node:path";

const stages: Array<{ stage: string; at: string; ms?: number }> = [];
let runStartedAt = Date.now();

export function logFastStage(stage: string) {
  const at = new Date().toISOString();
  stages.push({ stage, at, ms: Date.now() - runStartedAt });
  console.error(JSON.stringify({ event: "tv_fast_stage", stage, at, elapsedMs: Date.now() - runStartedAt }));
}

export function resetFastStageLog() {
  stages.length = 0;
  runStartedAt = Date.now();
}

export function getFastStageLog() {
  return [...stages];
}

export function loadFastRunnerEnv(adminRoot: string) {
  for (const name of [".env.local", ".env.production"]) {
    const filePath = path.join(adminRoot, name);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
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
}
