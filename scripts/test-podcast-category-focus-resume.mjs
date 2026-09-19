/**
 * Podcast category retained-route focus/resume request ownership contract.
 * Run: node scripts/test-podcast-category-focus-resume.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screen = fs.readFileSync(
  path.join(root, "app/podcasts/category/[id].tsx"),
  "utf8"
);

assert.match(screen, /const episodeRequestGenerationRef = useRef\(0\)/);
assert.match(
  screen,
  /const requestGeneration = \+\+episodeRequestGenerationRef\.current/
);
assert.match(
  screen,
  /episodeRequestGenerationRef\.current === requestGeneration &&\s*episodeRequestRef\.current === controller/
);
assert.match(screen, /const canCommit = \(\) => ownsRequest\(\) && !controller\.signal\.aborted/);
assert.ok(
  (screen.match(/if \(!canCommit\(\)\) return/g) || []).length >= 3,
  "success, failure, and post-updater work must reject stale requests"
);
assert.match(screen, /if \(!canCommit\(\)\) return current/);
assert.match(
  screen,
  /finally \{\s*if \(ownsRequest\(\)\) \{\s*episodeRequestRef\.current = null;\s*inflightEpisodePageRef\.current = null;/,
  "only the current controller may clear request refs and loading state"
);
assert.match(
  screen,
  /useFocusEffect\(\s*useCallback\(\(\) => \{[\s\S]*?void loadEpisodes\(1, "replace"\);[\s\S]*?episodeRequestGenerationRef\.current \+= 1;[\s\S]*?episodeRequestRef\.current\?\.abort\(\);/,
  "focus starts page one and blur invalidates before aborting"
);
assert.doesNotMatch(
  screen,
  /if \(mode === "replace"\) setEpisodes\(\[\]\)/,
  "a failed refocus refresh must retain already-visible rows"
);

function createLifecycle(initialRows = []) {
  let generation = 0;
  let controller = null;
  let inflightPage = null;
  const state = {
    rows: [...initialRows],
    error: null,
    loading: false,
    loadingMore: false,
    refreshing: false,
  };

  const start = () => {
    if (controller) controller.aborted = true;
    const mine = { aborted: false };
    const requestGeneration = ++generation;
    controller = mine;
    inflightPage = 1;
    state.error = null;
    state.loading = true;

    const owns = () => generation === requestGeneration && controller === mine;
    const canCommit = () => owns() && !mine.aborted;

    return {
      mine,
      succeed(rows) {
        if (!canCommit()) return;
        state.rows = [...rows];
      },
      fail(message) {
        if (!canCommit()) return;
        state.error = message;
      },
      finalize() {
        if (!owns()) return;
        controller = null;
        inflightPage = null;
        state.loading = false;
        state.loadingMore = false;
        state.refreshing = false;
      },
    };
  };

  const blur = () => {
    generation += 1;
    if (controller) controller.aborted = true;
    controller = null;
    inflightPage = null;
  };

  return {
    state,
    start,
    blur,
    get activeController() {
      return controller;
    },
    get inflightPage() {
      return inflightPage;
    },
  };
}

const lifecycle = createLifecycle(["cached"]);
const requestA = lifecycle.start();
lifecycle.blur();
const requestB = lifecycle.start();

requestA.succeed(["stale-a"]);
requestA.fail("stale failure");
requestA.finalize();

assert.deepEqual(lifecycle.state.rows, ["cached"], "late A cannot replace retained rows");
assert.equal(lifecycle.state.error, null, "late A cannot publish an error under B");
assert.equal(lifecycle.state.loading, true, "late A finalizer cannot clear B loading state");
assert.equal(lifecycle.activeController, requestB.mine, "B remains the current controller");
assert.equal(lifecycle.inflightPage, 1, "late A cannot clear B's in-flight page");

requestB.succeed(["current-b"]);
requestB.finalize();
assert.deepEqual(lifecycle.state.rows, ["current-b"], "the refocus request may commit");
assert.equal(lifecycle.state.loading, false, "the current request may finalize");
assert.equal(lifecycle.activeController, null);
assert.equal(lifecycle.inflightPage, null);

const failedRefocus = lifecycle.start();
failedRefocus.fail("temporary failure");
failedRefocus.finalize();
assert.deepEqual(
  lifecycle.state.rows,
  ["current-b"],
  "a refocus failure preserves the last successful episode rows"
);
assert.equal(lifecycle.state.error, "temporary failure");

console.log("PASS podcast category focus-resume", {
  focusStartsRequest: true,
  blurInvalidatesRequest: true,
  staleFinalizerRejected: true,
  retainedRowsOnFailure: true,
});
