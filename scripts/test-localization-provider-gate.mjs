/**
 * Prove LocalizationProvider never omits Root Layout children.
 * Run: node scripts/test-localization-provider-gate.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function main() {
  const provider = read("localization/LocalizationProvider.tsx");
  const layout = read("app/_layout.tsx");

  // 1) Always render children when isReady is false — no null gate.
  assert.equal(
    /if\s*\(\s*!isReady\s*\)\s*\{[\s\S]*?\{null\}/.test(provider),
    false,
    "LocalizationProvider must not return {null} while !isReady"
  );
  assert.ok(
    /return\s*\(\s*<LocalizationContext\.Provider[^>]*>\s*\{children\}/.test(
      provider
    ),
    "LocalizationProvider must always render {children}"
  );
  assert.ok(
    provider.includes("isReady"),
    "isReady must remain exposed through context value"
  );

  // 2) Root navigator present: Stack is a child of LocalizationProvider.
  assert.ok(layout.includes("<LocalizationProvider>"));
  assert.ok(layout.includes("<Stack"));
  assert.ok(
    /LocalizationProvider>[\s\S]*stack[\s\S]*<\/LocalizationProvider>/.test(
      layout
    ) || layout.includes("{stack}"),
    "Root Stack must stay under LocalizationProvider"
  );

  // 3) Children are not remounted by readiness: single return path with children.
  const returnBlocks = provider.match(
    /return\s*\(\s*<LocalizationContext\.Provider[\s\S]*?<\/LocalizationContext\.Provider>\s*\);/g
  );
  assert.equal(
    (returnBlocks || []).length,
    1,
    "Single Provider return — isReady must not swap mount trees"
  );
  assert.equal(
    provider.includes("{null}"),
    false,
    "No {null} children placeholder"
  );

  console.log("test-localization-provider-gate: PASS");
}

main();
