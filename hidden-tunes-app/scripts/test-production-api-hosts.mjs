import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = [
  "services/hiddenTunesApi.ts",
  "services/podcastCatalogApi.ts",
];

for (const relativePath of runtimeFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /hidden-tunes-api\.onrender\.com/);
  assert.match(source, /https:\/\/api\.hiddentunes\.com/);
}

console.log("test-production-api-hosts: PASS");
