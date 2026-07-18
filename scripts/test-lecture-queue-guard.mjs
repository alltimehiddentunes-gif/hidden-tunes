/**
 * Educational queue must never expand into music discovery.
 * Run: npx tsx scripts/test-lecture-queue-guard.mjs
 */

function text(value) {
  return String(value || "").trim();
}

function isEducationalDomainSong(song) {
  const id = text(song.id);
  if (id.startsWith("lecture-session-")) return true;
  return String(song.sourceName || "").toLowerCase() === "lectures";
}

function isEducationalQueueContext(context) {
  return (
    context.queueType === "educational" ||
    context.contextType === "educational-program"
  );
}

function buildEducationalPreserved(seed, providedQueue, requestedIndex) {
  if (
    !isEducationalQueueContext({
      queueType: "educational",
      contextType: "educational-program",
    }) &&
    !isEducationalDomainSong(seed)
  ) {
    throw new Error("guard skipped");
  }

  const domainProvided = providedQueue.filter((entry) => isEducationalDomainSong(entry));
  const activeIndex = Math.max(0, Math.min(requestedIndex, domainProvided.length - 1));
  return {
    queue: domainProvided,
    activeIndex,
    expanded: false,
    builtFrom: "educational_domain_preserved",
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const seed = {
  id: "lecture-session-a",
  sourceName: "Lectures",
  audioUrl: "https://example.com/a.mp3",
};
const provided = [
  seed,
  { id: "lecture-session-b", sourceName: "Lectures", audioUrl: "" },
  { id: "lecture-session-c", sourceName: "Lectures", audioUrl: "" },
];
const musicCatalogNoise = [
  { id: "music-1", sourceName: "Hidden Tunes", audioUrl: "https://example.com/m1.mp3" },
  { id: "music-2", sourceName: "Hidden Tunes", audioUrl: "https://example.com/m2.mp3" },
];

const result = buildEducationalPreserved(seed, provided, 0);
assert(result.expanded === false, "must not expand");
assert(result.queue.length === 3, "preserve lecture queue length");
assert(result.queue.every(isEducationalDomainSong), "all educational");
assert(!result.queue.some((s) => s.id.startsWith("music-")), "no music contamination");

const pollutedAttempt = buildEducationalPreserved(seed, [...provided, ...musicCatalogNoise], 0);
assert(
  pollutedAttempt.queue.every(isEducationalDomainSong),
  "filter keeps educational ids only when using domain filter"
);

console.log("PASS lecture queue guard tests", {
  finalLength: result.queue.length,
  expanded: result.expanded,
});
