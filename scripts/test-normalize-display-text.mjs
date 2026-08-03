/**
 * Proven UTF-8 mojibake repairs for metadata separators.
 * Run: node scripts/test-normalize-display-text.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const utilPath = path.join(root, "utils/normalizeDisplayText.ts");
const source = fs.readFileSync(utilPath, "utf8");

assert.match(source, /export const META_SEPARATOR = " \\u2022 ";/);
assert.match(source, /export function normalizeDisplayText/);
assert.match(source, /export function joinMetadataParts/);

// Strip types enough for a tiny runtime eval of this types-light util.
const runnable = source
  .replace(/:\s*readonly \(readonly \[string, string\]\)\[\]/g, "")
  .replace(/:\s*ReadonlyArray<readonly \[string, string\]>/g, "")
  .replace(/:\s*string/g, "")
  .replace(/:\s*\(string \| null \| undefined \| false\)\[\]/g, "")
  .replace(/:\s*Array<string \| null \| undefined \| false>/g, "")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ")
  .concat(
    "\n;({ META_SEPARATOR, normalizeDisplayText, joinMetadataParts });\n"
  );

const { META_SEPARATOR, normalizeDisplayText, joinMetadataParts } = vm.runInNewContext(
  runnable,
  Object.create(null),
  { filename: "normalizeDisplayText.ts" }
);

assert.equal(META_SEPARATOR, " \u2022 ");

assert.equal(
  normalizeDisplayText("20+ songs \u00d4\u00c7\u00f3 2 albums \u00d4\u00c7\u00f3 Afrobeats"),
  "20+ songs \u2022 2 albums \u2022 Afrobeats"
);

assert.equal(
  normalizeDisplayText("20+ songs \u00e2\u20ac\u00a2 2 albums"),
  "20+ songs \u2022 2 albums"
);

assert.equal(
  joinMetadataParts(["20+ songs", "2 albums", "Afrobeats"]),
  "20+ songs \u2022 2 albums \u2022 Afrobeats"
);

const arabic = "أغنية عربية • فنان";
const accented = "café naïve Zoë";
const african = "Yorùbá Àṣẹ Ọlá";
const mixed = "Afrobeats • عالية • São Tomé";
assert.equal(normalizeDisplayText(arabic), arabic);
assert.equal(normalizeDisplayText(accented), accented);
assert.equal(normalizeDisplayText(african), african);
assert.equal(normalizeDisplayText(mixed), mixed);

const artistPage = fs.readFileSync(path.join(root, "app/artist/[id].tsx"), "utf8");
assert.match(artistPage, /joinMetadataParts/);
assert.match(artistPage, /META_SEPARATOR/);
assert.doesNotMatch(artistPage, /\u00d4\u00c7\u00f3/);
assert.doesNotMatch(artistPage, /\u252c\u00c0/);

const artistBridge = fs.readFileSync(path.join(root, "app/artist.tsx"), "utf8");
assert.doesNotMatch(artistBridge, /\u00d4\u00c7\u00aa/);

console.log("test-normalize-display-text: PASS");
