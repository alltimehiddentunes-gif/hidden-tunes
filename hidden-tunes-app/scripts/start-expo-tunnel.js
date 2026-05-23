/**
 * Starts Expo with tunnel hosting (remote / mobile-data friendly).
 * Usage:
 *   node scripts/start-expo-tunnel.js [--clear] [--dev-client]
 */

const { spawn } = require("child_process");
const path = require("path");

require("./verify-dev-tunnel-deps");

const flags = new Set(process.argv.slice(2));
const useDevClient = flags.has("--dev-client");
const clearCache = flags.has("--clear");

const expoArgs = ["expo", "start", "--host", "tunnel", "--max-workers", "1"];

if (useDevClient) {
  expoArgs.push("--dev-client");
}

if (clearCache) {
  expoArgs.splice(2, 0, "-c");
}

const metroPort = process.env.EXPO_METRO_PORT || process.env.RCT_METRO_PORT;
if (metroPort) {
  expoArgs.push("--port", String(metroPort));
}

console.log("[HiddenTunes] Command:", "npx", expoArgs.join(" "));

const child = spawn("npx", expoArgs, {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    CI: process.env.CI || "1",
    EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY || "1",
  },
});

child.on("exit", (code) => {
  if (code !== 0) {
    console.error(
      "\n[HiddenTunes] Tunnel start failed. See docs/development-client-workflow.md → Remote tunnel troubleshooting."
    );
  }
  process.exit(code ?? 1);
});
