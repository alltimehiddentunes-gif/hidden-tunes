#!/usr/bin/env node
/**
 * Generate ios/ for standalone native builds (Xcode / xcodebuild).
 * Does not use EAS. Requires macOS for pod install + compile.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

process.env.EXPO_PUBLIC_BUILD_PROFILE =
  process.env.EXPO_PUBLIC_BUILD_PROFILE || "production";
process.env.EAS_BUILD_PROFILE =
  process.env.EAS_BUILD_PROFILE || process.env.EXPO_PUBLIC_BUILD_PROFILE;

const args = ["expo", "prebuild", "--platform", "ios", "--clean"];

console.log(
  `[prebuild-ios-standalone] profile=${process.env.EXPO_PUBLIC_BUILD_PROFILE}`
);

const result = spawnSync("npx", args, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
