import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runStep(label: string, args: string[]) {
  const result = spawnSync("npx", ["tsx", ...args], {
    cwd: adminRoot,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const reset = process.argv.includes("--reset");
  const suffix = [
    ...(execute ? ["--execute"] : []),
    ...(reset ? ["--reset"] : []),
  ];

  runStep("mature discovery/import", ["scripts/run-radio-mature-expansion.ts", ...suffix]);
  runStep("mature verification", ["scripts/run-radio-mature-verify.ts", ...(execute ? ["--execute"] : [])]);
  runStep("mature promotion", ["scripts/run-radio-mature-promote.ts", ...(execute ? ["--execute"] : [])]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
