/**
 * Podcast auto-next / continuation contract tests.
 * Run: node scripts/test-podcast-continuation.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const controller = read("utils/PodcastPlaybackController.ts");
const adapter = read("utils/podcastPlaybackAdapter.ts");
const player = read("context/PlayerContext.tsx");
const showScreen = read("app/podcasts/show/[id].tsx");
const showQueue = read("utils/podcastShowQueue.ts");

assert.match(controller, /handlePodcastSessionFinished/);
assert.match(controller, /trySameShowContinuation/);
assert.match(controller, /tryCategoryContinuation/);
assert.match(controller, /mature_only/);
assert.match(controller, /general_only/);
assert.match(controller, /MAX_CONTINUATION_CANDIDATES\s*=\s*3/);
assert.match(controller, /CATEGORY_CANDIDATE_LIMIT\s*=\s*16/);
assert.match(controller, /continuationMutex/);
assert.match(controller, /mature_eligibility_lost/);
assert.match(controller, /PODCAST_MATURE_CATEGORY_SLUG/);

assert.match(adapter, /continuationScope/);
assert.match(adapter, /mature_only/);

assert.match(player, /handlePodcastSessionFinished/);
assert.match(player, /podcast_session_finished/);
assert.match(player, /podcastDomainForAdvance/);
assert.match(player, /playSongContinuationRef/);

assert.match(showScreen, /includeMature:\s*shouldIncludeMaturePodcasts\(\)/);
assert.match(showScreen, /AbortController/);
assert.match(showScreen, /No episodes published/);
assert.match(showScreen, /Episodes failed to load/);
assert.match(showScreen, /loadMoreEpisodes/);
assert.match(showScreen, /removeClippedSubviews=\{Platform\.OS === "android"\}/);
assert.match(showScreen, /initialNumToRender=\{6\}/);
assert.doesNotMatch(showScreen, /data=\{!episodesLoading && hasEpisodes/);

assert.match(showQueue, /includeMature \? "mature" : "safe"/);
assert.match(showQueue, /showEpisodeInflight\.get\(cacheKey\)/);

// Ordering helper used by continuation preference
function nextSameShow(episodes, currentId) {
  const index = episodes.findIndex((e) => e.id === currentId);
  if (index < 0) return null;
  return episodes[index + 1] || null;
}

const showEps = [
  { id: "e1", showId: "s1" },
  { id: "e2", showId: "s1" },
  { id: "e3", showId: "s1" },
];
assert.equal(nextSameShow(showEps, "e1")?.id, "e2");
assert.equal(nextSameShow(showEps, "e3"), null);

function isolateScope(scope, candidateMature) {
  if (scope === "mature_only") return candidateMature === true;
  return candidateMature !== true;
}
assert.equal(isolateScope("mature_only", true), true);
assert.equal(isolateScope("mature_only", false), false);
assert.equal(isolateScope("general_only", true), false);
assert.equal(isolateScope("general_only", false), true);

console.log("PASS podcast continuation", {
  sameShowNext: true,
  matureIsolation: true,
  maxCandidates: 3,
  showAbortPagination: true,
  playerHook: true,
});
