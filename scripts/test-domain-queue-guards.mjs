/**
 * Cross-domain queue guard smoke tests (no React Native).
 * Run: node scripts/test-domain-queue-guards.mjs
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
function isEducationalDomainSong(song) {
  const id = text(song.id);
  if (id.startsWith("lecture-session-")) return true;
  return lower(song.sourceName) === "lectures";
}
function isPodcastDomainSong(song) {
  const id = text(song.id);
  if (id.startsWith("podcast-")) return true;
  const sourceName = lower(song.sourceName);
  return sourceName === "podcast" || sourceName === "podcasts";
}

function preserve(domainFn, seed, providedQueue, requestedIndex) {
  const domainProvided = [];
  const seen = new Set();
  for (const entry of providedQueue || []) {
    if (!domainFn(entry)) continue;
    const id = text(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    domainProvided.push(entry);
  }
  let queue = domainProvided.length ? domainProvided : domainFn(seed) ? [seed] : [];
  if (!queue.some((entry) => text(entry.id) === text(seed.id)) && domainFn(seed)) {
    queue = [seed, ...queue.filter((entry) => text(entry.id) !== text(seed.id))];
  }
  const activeIndex =
    requestedIndex === undefined
      ? Math.max(0, queue.findIndex((entry) => text(entry.id) === text(seed.id)))
      : Math.max(0, Math.min(requestedIndex, Math.max(queue.length - 1, 0)));
  return {
    queue,
    activeIndex,
    expanded: false,
    foreignItemCount: Math.max(0, (providedQueue || []).length - domainProvided.length),
  };
}

function classify(context, seed, provided) {
  // Explicit initiating context wins over mixed provided markers.
  if (context?.queueType === "motivation" || context?.source === "motivation") {
    return "motivation";
  }
  if (context?.queueType === "educational" || context?.contextType === "educational-program") {
    return "educational";
  }
  if (context?.queueType === "podcast" || context?.contextType === "podcast-show") {
    return "podcast";
  }
  if (isMotivationDomainSong(seed) || provided.some(isMotivationDomainSong)) return "motivation";
  if (isEducationalDomainSong(seed) || provided.some(isEducationalDomainSong)) return "educational";
  if (isPodcastDomainSong(seed) || provided.some(isPodcastDomainSong)) return "podcast";
  return "music";
}

// Motivational
{
  const seed = { id: "motivation-item-a", sourceName: "Motivationals" };
  const provided = [
    seed,
    { id: "motivation-item-b", sourceName: "Motivationals" },
    { id: "song-1", sourceName: "Hidden Tunes" },
  ];
  assert.equal(classify({ queueType: "motivation" }, seed, provided), "motivation");
  const built = preserve(isMotivationDomainSong, seed, provided, 0);
  assert.equal(built.expanded, false);
  assert.equal(built.queue.length, 2);
  assert.equal(built.activeIndex, 0);
  assert.ok(built.queue.every(isMotivationDomainSong));
}

// Lecture
{
  const seed = { id: "lecture-session-a", sourceName: "Lectures" };
  const provided = [
    seed,
    { id: "lecture-session-b", sourceName: "Lectures" },
    { id: "podcast-x", sourceName: "Podcast" },
  ];
  assert.equal(classify({ queueType: "educational" }, seed, provided), "educational");
  const built = preserve(isEducationalDomainSong, seed, provided, 0);
  assert.equal(built.queue.length, 2);
  assert.equal(built.expanded, false);
  assert.ok(built.queue.every(isEducationalDomainSong));
}

// Podcast mid-show index preserved
{
  const seed = { id: "podcast-ep2", sourceName: "Podcast", albumId: "show-1" };
  const provided = [
    { id: "podcast-ep1", sourceName: "Podcast", albumId: "show-1" },
    seed,
    { id: "podcast-ep3", sourceName: "Podcast", albumId: "show-1" },
    { id: "song-99", sourceName: "Hidden Tunes" },
    { id: "motivation-item-z", sourceName: "Motivationals" },
  ];
  assert.equal(
    classify({ queueType: "podcast", contextType: "podcast-show" }, seed, provided),
    "podcast"
  );
  const built = preserve(isPodcastDomainSong, seed, provided, 1);
  assert.equal(built.expanded, false);
  assert.equal(built.queue.length, 3);
  assert.equal(built.activeIndex, 1);
  assert.equal(built.queue[1].id, seed.id);
  assert.equal(built.foreignItemCount, 2);
  assert.ok(built.queue.every(isPodcastDomainSong));
}

// Music still falls through when no vertical markers
{
  const seed = { id: "song-a", sourceName: "Hidden Tunes" };
  const provided = [seed, { id: "song-b", sourceName: "Hidden Tunes" }];
  assert.equal(classify({ source: "full_catalog" }, seed, provided), "music");
}

console.log("PASS domain queue guard tests", {
  motivation: true,
  lecture: true,
  podcast: true,
  musicPassthrough: true,
});
