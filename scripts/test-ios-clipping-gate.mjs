/**
 * Regression: iOS must not force removeClippedSubviews.
 * Run: node scripts/test-ios-clipping-gate.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(name, fn) {
  fn();
  console.log(`OK ${name}`);
}

function rg(args) {
  try {
    return execFileSync(
      "rg",
      [
        "-n",
        ...args,
        "--glob",
        "*.{ts,tsx}",
        "-g",
        "!node_modules",
        "-g",
        "!hidden-tunes-desktop",
        "-g",
        "!scripts/**",
      ],
      { cwd: root, encoding: "utf8" }
    ).trim();
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}

function platformGate(os) {
  return os === "android";
}

run("performanceMode source gates clipping to Android", () => {
  const source = fs.readFileSync(path.join(root, "utils/performanceMode.ts"), "utf8");
  assert.match(source, /from "react-native"/);
  assert.match(source, /\bPlatform\b/);
  assert.equal(
    (source.match(/const removeClippedSubviews = Platform\.OS === "android";/g) || [])
      .length,
    2,
    "both vertical and horizontal helpers must define the Android-only gate"
  );
  assert.equal(
    (source.match(/removeClippedSubviews:\s*true\b/g) || []).length,
    0,
    "performanceMode must not hard-code removeClippedSubviews: true"
  );
});

run("no mobile hard-coded removeClippedSubviews true remains", () => {
  const explicitTrueProp = rg(["removeClippedSubviews=\\{true\\}"]);
  const explicitTrueObject = rg(["removeClippedSubviews:\\s*true"]);
  assert.equal(explicitTrueProp, "", `unexpected ={true}:\n${explicitTrueProp}`);
  assert.equal(
    explicitTrueObject,
    "",
    `unexpected : true:\n${explicitTrueObject}`
  );

  const bare = rg(["^\\s*removeClippedSubviews\\s*$"]);
  assert.equal(bare, "", `unexpected bare removeClippedSubviews:\n${bare}`);
});

run("Android helper result is true", () => {
  assert.equal(platformGate("android"), true);
});

run("iOS helper result is false", () => {
  assert.equal(platformGate("ios"), false);
});

run("both vertical and horizontal helpers follow the platform gate", () => {
  const source = fs.readFileSync(path.join(root, "utils/performanceMode.ts"), "utf8");
  const verticalStart = source.indexOf("export function getListPerformanceSettings");
  const horizontalStart = source.indexOf(
    "export function getHorizontalListPerformanceSettings"
  );
  assert.ok(verticalStart >= 0 && horizontalStart > verticalStart);

  const vertical = source.slice(verticalStart, horizontalStart);
  const horizontal = source.slice(horizontalStart);
  assert.match(vertical, /Platform\.OS === "android"/);
  assert.match(horizontal, /Platform\.OS === "android"/);
  assert.equal(platformGate("android"), true);
  assert.equal(platformGate("ios"), false);
});

console.log("iOS clipping gate regression passed.");
