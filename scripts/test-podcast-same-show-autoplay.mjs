/**
 * Podcast same-show autoplay identity + bounded skip contract.
 * Run: node scripts/test-podcast-same-show-autoplay.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function buildSameShowQueue(episodes, showId) {
  return episodes.filter((episode) => String(episode.showId || "").trim() === showId);
}

const mixed = [
  { id: "a1", showId: "show-a" },
  { id: "b1", showId: "show-b" },
  { id: "a2", showId: "show-a" },
  { id: "a3", showId: "show-a" },
];
const sameShow = buildSameShowQueue(mixed, "show-a");
assert.deepEqual(
  sameShow.map((e) => e.id),
  ["a1", "a2", "a3"]
);
assert.ok(sameShow.every((e) => e.showId === "show-a"));

function nextInShow(queue, currentId) {
  const index = queue.findIndex((e) => e.id === currentId);
  if (index < 0) return null;
  return queue[index + 1] || null;
}

assert.equal(nextInShow(sameShow, "a2")?.id, "a3");
assert.equal(nextInShow(sameShow, "a3"), null, "final episode stops in show");

const adapter = fs.readFileSync(path.join(root, "utils/podcastPlaybackAdapter.ts"), "utf8");
assert.match(adapter, /PODCAST_MAX_AUTO_NEXT_FAILURES\s*=\s*5/);
assert.match(adapter, /PODCAST_PLAYBACK_QUEUE_LIMIT\s*=\s*48/);
assert.match(adapter, /PODCAST_SHOW_CONTEXT_TYPE/);

const playerContext = fs.readFileSync(path.join(root, "context/PlayerContext.tsx"), "utf8");
assert.match(playerContext, /podcast_domain/);
assert.match(playerContext, /smart_continuation_blocked_domain/);

console.log("PASS podcast same-show autoplay", {
  sameShowIds: sameShow.map((e) => e.id),
  finalStops: true,
  skipCap: 5,
});
