#!/usr/bin/env node
/**
 * Build/run ios/ via Expo local native tooling (no EAS).
 * Standalone profile — no dev client.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

process.env.EXPO_PUBLIC_BUILD_PROFILE =
  process.env.EXPO_PUBLIC_BUILD_PROFILE || "production";
process.env.EAS_BUILD_PROFILE =
  process.env.EAS_BUILD_PROFILE || process.env.EXPO_PUBLIC_BUILD_PROFILE;

const passthrough = process.argv.slice(2);
const args = ["expo", "run:ios", ...passthrough];

console.log(
  `[run-ios-standalone] profile=${process.env.EXPO_PUBLIC_BUILD_PROFILE}`
);

const result = spawnSync("npx", args, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
