#!/usr/bin/env node
/**
 * Static startup import-chain verification for Phase 2 investigation.
 * Proves JS bundle can resolve startup-critical modules without running a device.
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const checks = [
  "index.js",
  "app/_layout.tsx",
  "app/index.tsx",
  "context/PlayerContext.tsx",
  "components/MiniPlayer.tsx",
  "modules/HiddenAudio.ts",
  "utils/playbackSongIdentity.ts",
  "plugins/hidden-audio/index.js",
];

let failed = false;

for (const rel of checks) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[verify-startup-trace] FAIL missing file: ${rel}`);
    failed = true;
    continue;
  }
  console.log(`[verify-startup-trace] OK file exists: ${rel}`);
}

const bisect = spawnSync("bash", ["scripts/bisect-startup-check.sh", "HEAD"], {
  cwd: root,
  encoding: "utf8",
});

if (bisect.status !== 0) {
  console.error("[verify-startup-trace] FAIL bisect-startup-check");
  console.error(bisect.stdout || bisect.stderr);
  failed = true;
} else {
  console.log((bisect.stdout || "").trim());
}

if (failed) process.exit(1);

console.log("[verify-startup-trace] OK startup import-chain static checks passed");
console.log(
  "[verify-startup-trace] Device required: run dev client and filter Metro for [HTStartup] to see live step order"
);
