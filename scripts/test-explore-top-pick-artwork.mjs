import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const componentPath = resolve(root, "app/worlds/index.tsx");
const component = readFileSync(componentPath, "utf8");

const expected = [
  ["room-listening-room", "explore-top-pick-01-listening-rooms.webp"],
  ["room-country-station", "explore-top-pick-02-country-station.webp"],
  ["room-calm-instrumentals", "explore-top-pick-03-calm-instrumentals.webp"],
  ["room-afrobeats", "explore-top-pick-04-afrobeats-room.webp"],
  ["room-jazz", "explore-top-pick-05-jazz-room.webp"],
  ["mood-mood-party-energy", "explore-top-pick-06-party-energy.webp"],
  ["genre-afrobeats", "explore-top-pick-07-afrobeats-genre.webp"],
  ["genre-amapiano", "explore-top-pick-08-amapiano-genre.webp"],
  ["album-hidden-tunes-singles", "explore-top-pick-09-singles.webp"],
  ["artist-hidden-tunes", "explore-top-pick-10-hidden-tunes-creator.webp"],
];

const filenames = new Set();
for (const [id, filename] of expected) {
  assert.match(component, new RegExp(`"${id}"\\s*:\\s*require\\([^\\n]+${filename.replaceAll(".", "\\.")}\"\\)`));
  assert.equal(filenames.has(filename), false, `duplicate artwork assignment: ${filename}`);
  filenames.add(filename);

  const assetPath = resolve(root, "assets/images", filename);
  assert.equal(existsSync(assetPath), true, `missing artwork: ${filename}`);
  assert.ok(statSync(assetPath).size > 50_000, `artwork unexpectedly small: ${filename}`);
  assert.ok(statSync(assetPath).size < 300_000, `artwork exceeds mobile budget: ${filename}`);
}

assert.match(component, /EXPLORE_TOP_PICK_ARTWORK\[id\]\s*\?\?\s*EXPLORE_TOP_PICK_FALLBACK/);
assert.match(component, /\.slice\(0, 10\)/);
assert.equal(expected.length, 10);

console.log("Explore top-pick artwork registry passed: 10 unique bundled assets.");
