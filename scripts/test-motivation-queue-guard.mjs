/**
 * Motivational queue domain guard smoke test (no network).
 * Run: node scripts/test-motivation-queue-guard.mjs
 */
import assert from "node:assert/strict";

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function isMotivationDomainSong(song) {
  const id = text(song.id);
  if (id.startsWith("motivation-item-")) return true;
  return lower(song.sourceName) === "motivationals";
}

function isMotivationQueueContext(context) {
  if (context?.queueType === "motivation") return true;
  if (context?.contextType === "motivational-program") return true;
  if (context?.source === "motivation") return true;
  return false;
}

function preserveStrictDomainQueue({ seed, providedQueue, requestedIndex }) {
  const domainProvided = [];
  const seen = new Set();
  for (const entry of providedQueue || []) {
    if (!isMotivationDomainSong(entry)) continue;
    const id = text(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    domainProvided.push(entry);
  }
  let queue = domainProvided.length ? domainProvided : isMotivationDomainSong(seed) ? [seed] : [];
  if (!queue.some((entry) => text(entry.id) === text(seed.id)) && isMotivationDomainSong(seed)) {
    queue = [seed, ...queue];
  }
  const activeIndex =
    requestedIndex === undefined
      ? Math.max(0, queue.findIndex((entry) => text(entry.id) === text(seed.id)))
      : Math.max(0, Math.min(requestedIndex, queue.length - 1));
  return {
    queue,
    activeIndex,
    expanded: false,
    foreignItemCount: Math.max(0, (providedQueue || []).length - domainProvided.length),
  };
}

const seed = {
  id: "motivation-item-a",
  sourceName: "Motivationals",
};
const provided = [
  seed,
  { id: "motivation-item-b", sourceName: "Motivationals" },
  { id: "song-123", sourceName: "Hidden Tunes" },
  { id: "lecture-session-x", sourceName: "Lectures" },
];

const context = {
  source: "motivation",
  queueType: "motivation",
  contextType: "motivational-program",
};

assert.equal(isMotivationQueueContext(context), true);
const built = preserveStrictDomainQueue({
  seed,
  providedQueue: provided,
  requestedIndex: 0,
});

assert.equal(built.expanded, false);
assert.equal(built.queue.length, 2);
assert.equal(built.activeIndex, 0);
assert.equal(built.queue[0].id, seed.id);
assert.equal(built.foreignItemCount, 2);
assert.ok(built.queue.every(isMotivationDomainSong));

console.log("PASS motivation queue guard tests", {
  finalLength: built.queue.length,
  expanded: built.expanded,
  foreignItemCount: built.foreignItemCount,
});
