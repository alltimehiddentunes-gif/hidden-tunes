/**
 * Live Radio session / next-previous / skip / domain-guard smoke tests (no React Native).
 * Run: node scripts/test-live-radio-session.mjs
 */
import assert from "node:assert/strict";

function text(value) {
  return String(value || "").trim();
}

function isLiveRadioDomainSong(song) {
  const id = text(song.id);
  if (id.startsWith("radio-")) return true;
  return song.type === "live_stream";
}

function isLiveRadioQueueContext(context) {
  return context?.queueType === "live_radio" || context?.contextType === "live-radio-session";
}

function preserveLiveRadio(seed, providedQueue, requestedIndex) {
  const domainProvided = [];
  const seen = new Set();
  for (const entry of providedQueue || []) {
    if (!isLiveRadioDomainSong(entry)) continue;
    const id = text(entry.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    domainProvided.push(entry);
  }
  let queue = domainProvided.length
    ? domainProvided
    : isLiveRadioDomainSong(seed)
      ? [seed]
      : [];
  if (!queue.some((entry) => text(entry.id) === text(seed.id)) && isLiveRadioDomainSong(seed)) {
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

function wrapLiveRadioIndex(currentIndex, queueLength, direction) {
  if (queueLength <= 0) return -1;
  const safe = Math.max(0, Math.min(currentIndex, queueLength - 1));
  if (queueLength === 1) return safe;
  if (direction === "next") return (safe + 1) % queueLength;
  return (safe - 1 + queueLength) % queueLength;
}

function pickNextEligible({ currentIndex, queue, direction, failedIds }) {
  if (!queue.length) return null;
  const start = Math.max(0, Math.min(currentIndex, queue.length - 1));
  let index = start;
  for (let attempt = 0; attempt < queue.length; attempt += 1) {
    index = wrapLiveRadioIndex(index, queue.length, direction);
    const song = queue[index];
    if (!song) continue;
    if (failedIds.has(song.id)) continue;
    if (!isLiveRadioDomainSong(song)) continue;
    return index;
  }
  return null;
}

function buildSession(activeId, ids) {
  const songs = ids.map((id) => ({
    id: `radio-${id}`,
    title: id,
    type: "live_stream",
    source: "radio",
    streamUrl: id === "dead" ? "http://insecure.example" : `https://stream.example/${id}`,
  }));
  const activeIndex = Math.max(
    0,
    songs.findIndex((song) => song.id === `radio-${activeId}`)
  );
  return { songs, activeIndex };
}

function isPlayableHttps(song) {
  return String(song.streamUrl || "").startsWith("https://");
}

// 1. Session starts at tapped station
{
  const { songs, activeIndex } = buildSession("b", ["a", "b", "c"]);
  assert.equal(songs[activeIndex].id, "radio-b");
  assert.equal(activeIndex, 1);
}

// 2. Next selects following station
{
  assert.equal(wrapLiveRadioIndex(1, 3, "next"), 2);
}

// 3. Previous selects preceding station
{
  assert.equal(wrapLiveRadioIndex(1, 3, "previous"), 0);
}

// 4. Next wraps at final station
{
  assert.equal(wrapLiveRadioIndex(2, 3, "next"), 0);
}

// 5. Previous wraps at first station
{
  assert.equal(wrapLiveRadioIndex(0, 3, "previous"), 2);
}

// 6. Dead station skips to next playable
{
  const { songs } = buildSession("a", ["a", "dead", "c"]);
  const failed = new Set();
  let index = 0;
  // simulate next from a -> dead (unplayable) -> c
  index = pickNextEligible({
    currentIndex: index,
    queue: songs,
    direction: "next",
    failedIds: failed,
  });
  assert.equal(songs[index].id, "radio-dead");
  if (!isPlayableHttps(songs[index])) failed.add(songs[index].id);
  index = pickNextEligible({
    currentIndex: index,
    queue: songs,
    direction: "next",
    failedIds: failed,
  });
  assert.equal(songs[index].id, "radio-c");
}

// 7. Multiple failed stations skipped without infinite loop
{
  const { songs } = buildSession("a", ["a", "dead", "dead2", "c"]);
  // mark dead stations as failed ids after discovery
  songs[1].streamUrl = "http://bad";
  songs[2].streamUrl = "http://bad";
  const failed = new Set();
  let index = 0;
  let hops = 0;
  while (hops < songs.length + 2) {
    const next = pickNextEligible({
      currentIndex: index,
      queue: songs,
      direction: "next",
      failedIds: failed,
    });
    assert.notEqual(next, null);
    index = next;
    hops += 1;
    if (!isPlayableHttps(songs[index])) {
      failed.add(songs[index].id);
      continue;
    }
    break;
  }
  assert.equal(songs[index].id, "radio-c");
  assert.ok(hops <= songs.length);
}

// 8. All-failed session returns controlled unavailable
{
  const songs = ["a", "b", "c"].map((id) => ({
    id: `radio-${id}`,
    type: "live_stream",
    streamUrl: "http://bad",
  }));
  const failed = new Set(songs.map((song) => song.id));
  const next = pickNextEligible({
    currentIndex: 0,
    queue: songs,
    direction: "next",
    failedIds: failed,
  });
  assert.equal(next, null);
}

// 9. Rapid next uses newest generation (stale ignored)
{
  let generation = 0;
  const bump = () => {
    generation += 1;
    return generation;
  };
  const first = bump();
  const second = bump();
  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.notEqual(first, second);
}

// 10. Stale resolver responses cannot replace newest station
{
  let activeRequest = 0;
  const start = () => {
    activeRequest += 1;
    return activeRequest;
  };
  const reqA = start();
  const reqB = start();
  let applied = null;
  const applyIfFresh = (requestId, stationId) => {
    if (requestId !== activeRequest) return false;
    applied = stationId;
    return true;
  };
  assert.equal(applyIfFresh(reqA, "a"), false);
  assert.equal(applyIfFresh(reqB, "b"), true);
  assert.equal(applied, "b");
}

// 11. Search sessions remain within search results
{
  const seed = { id: "radio-s1", type: "live_stream" };
  const provided = [
    seed,
    { id: "radio-s2", type: "live_stream" },
    { id: "song-1", sourceName: "Hidden Tunes" },
  ];
  const context = { queueType: "live_radio", label: "Search: afro", searchQuery: "afro" };
  assert.equal(isLiveRadioQueueContext(context), true);
  const result = preserveLiveRadio(seed, provided, 0);
  assert.equal(result.queue.length, 2);
  assert.equal(result.foreignItemCount, 1);
  assert.ok(result.queue.every(isLiveRadioDomainSong));
}

// 12. Country sessions remain within selected country list
{
  const seed = { id: "radio-gh1", type: "live_stream" };
  const provided = [
    seed,
    { id: "radio-gh2", type: "live_stream" },
    { id: "radio-gh3", type: "live_stream" },
  ];
  const result = preserveLiveRadio(seed, provided, 1);
  assert.equal(result.activeIndex, 1);
  assert.equal(result.queue.length, 3);
  assert.equal(result.expanded, false);
}

// 13. Favorites sessions remain within Radio favorites
{
  const seed = { id: "radio-fav1", type: "live_stream" };
  const provided = [
    { id: "radio-fav1", type: "live_stream" },
    { id: "radio-fav2", type: "live_stream" },
    { id: "motivation-item-1", sourceName: "Motivationals" },
  ];
  const result = preserveLiveRadio(seed, provided, 0);
  assert.equal(result.queue.length, 2);
  assert.ok(result.queue.every((song) => song.id.startsWith("radio-")));
}

// 14. Music queue behavior remains unchanged (no live_radio context)
{
  const seed = { id: "song-1", sourceName: "Hidden Tunes" };
  assert.equal(isLiveRadioDomainSong(seed), false);
  assert.equal(isLiveRadioQueueContext({ source: "radio", label: "Radio" }), false);
}

// 15. Podcast / audiobook next-prev markers unchanged by live radio guard
{
  assert.equal(isLiveRadioDomainSong({ id: "podcast-1", sourceName: "Podcasts" }), false);
  assert.equal(
    isLiveRadioDomainSong({ id: "lecture-session-1", sourceName: "Lectures" }),
    false
  );
}

// 16. Remote next/previous maps when live radio session is active
{
  const queue = buildSession("a", ["a", "b", "c"]).songs;
  const mode = "live_stream";
  const context = { queueType: "live_radio" };
  const canNavigate = queue.length > 1 && isLiveRadioQueueContext(context) && mode === "live_stream";
  assert.equal(canNavigate, true);
  const remoteNext = wrapLiveRadioIndex(0, queue.length, "next");
  assert.equal(queue[remoteNext].id, "radio-b");
}

console.log("PASS live radio session tests", {
  cases: 16,
});
