#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

process.env.EXPO_PUBLIC_BUILD_PROFILE = "developmentClient";
process.env.EAS_BUILD_PROFILE = "developmentClient";

const passthrough = process.argv.slice(2);
const args = ["expo", "run:ios", ...passthrough];

const result = spawnSync("npx", args, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
