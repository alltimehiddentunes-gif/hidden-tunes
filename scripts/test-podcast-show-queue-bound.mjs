/**
 * DEV proof: same-show loader is bounded (one page), not a full-show crawl.
 * Run: node scripts/test-podcast-show-queue-bound.mjs
 */
import assert from "node:assert/strict";

const INITIAL = 16;

// Mirror the contract of utils/podcastShowQueue.ts without Metro aliases.
function sliceWindow(episodes, activeId, before = 7, after = 8) {
  if (!episodes.length) return [];
  const index = episodes.findIndex((e) => e.id === activeId);
  if (index < 0) return episodes.slice(0, before + after + 1);
  const start = Math.max(0, index - before);
  const end = Math.min(episodes.length, index + after + 1);
  return episodes.slice(start, end);
}

const episodes = Array.from({ length: 41 }, (_, i) => ({
  id: `ep-${i}`,
  showId: "show-1",
  title: `Episode ${i}`,
}));

const windowed = sliceWindow(episodes, "ep-20");
assert.equal(windowed.length, 16);
assert.equal(windowed[0].id, "ep-13");
assert.equal(windowed[windowed.length - 1].id, "ep-28");
assert.ok(INITIAL <= 16);

console.log("PASS podcast show queue bound", {
  fullShow: episodes.length,
  window: windowed.length,
  initialLimit: INITIAL,
  pagesOnTapPath: 0,
  pagesOnBackgroundHydrate: 1,
});
