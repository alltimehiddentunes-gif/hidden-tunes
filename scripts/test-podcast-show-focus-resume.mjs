/**
 * Backend podcast show retained-route focus/resume ownership contract.
 * Run: node scripts/test-podcast-show-focus-resume.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screen = fs.readFileSync(path.join(root, "app/podcasts/show/[id].tsx"), "utf8");

assert.match(screen, /const backendRequestGenerationRef = useRef\(0\)/);
assert.match(
  screen,
  /const requestGeneration = \+\+backendRequestGenerationRef\.current/
);
assert.match(
  screen,
  /backendRequestGenerationRef\.current === requestGeneration &&\s*abortRef\.current === controller/
);
assert.match(screen, /const canCommit = \(\) => ownsRequest\(\) && !controller\.signal\.aborted/);
assert.ok(
  (screen.match(/if \(!canCommit\(\)\) return/g) || []).length >= 3,
  "show, episode, error, and pagination work must reject stale requests"
);
assert.match(screen, /if \(!canCommit\(\)\) return current/);
assert.match(
  screen,
  /finally \{\s*if \(ownsRequest\(\)\) \{[\s\S]*?backendFollowRequestRef\.current = controller;[\s\S]*?const followed = await getFollowedPodcastShows\(\);\s*if \(canCommitFollow\(\)\) \{\s*setFollowing/,
  "follow-state refresh must retain request ownership across its await"
);
assert.match(
  screen,
  /const ownsFollowRequest = \(\) =>[\s\S]*?backendRequestGenerationRef\.current === requestGeneration &&\s*backendFollowRequestRef\.current === controller/,
  "follow state must use the same generation plus an exact controller identity"
);
assert.match(
  screen,
  /useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(!isBackendShow\) return undefined;[\s\S]*?void loadBackendShow\(1, "replace"\);[\s\S]*?backendRequestGenerationRef\.current \+= 1;[\s\S]*?abortRef\.current\?\.abort\(\);/,
  "backend focus starts page one and blur invalidates before aborting"
);
assert.match(
  screen,
  /useEffect\(\(\) => \{\s*if \(isBackendShow\) return undefined;[\s\S]*?void loadRssShow\(\);/,
  "the static RSS loader remains on its existing non-focus lifecycle"
);
assert.match(
  screen,
  /if \(!showResult\.success \|\| !showResult\.show\) \{\s*if \(!hasExisting\) setShow\(null\);\s*if \(!hasExisting\) setCatalogEpisodes\(\[\]\);/,
  "a failed refocus must preserve a valid show and episode rows"
);

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createLifecycle() {
  let generation = 0;
  let controller = null;
  let followController = null;
  let inflightPage = null;
  const state = {
    show: "cached-show",
    episodes: ["cached-episode"],
    error: null,
    following: false,
    loading: false,
  };

  const start = () => {
    if (controller) controller.aborted = true;
    if (followController) followController.aborted = true;
    followController = null;
    const mine = { aborted: false };
    const requestGeneration = ++generation;
    controller = mine;
    inflightPage = 1;
    state.error = null;
    state.loading = true;

    const owns = () => generation === requestGeneration && controller === mine;
    const canCommit = () => owns() && !mine.aborted;
    const ownsFollow = () => generation === requestGeneration && followController === mine;
    const canCommitFollow = () => ownsFollow() && !mine.aborted;

    return {
      mine,
      succeed(show, episodes) {
        if (!canCommit()) return;
        state.show = show;
        state.episodes = [...episodes];
      },
      fail(message) {
        if (!canCommit()) return;
        state.error = message;
      },
      async finalize(followPromise) {
        if (!owns()) return;
        state.loading = false;
        controller = null;
        inflightPage = null;
        followController = mine;
        try {
          const following = await followPromise;
          if (canCommitFollow()) state.following = following;
        } finally {
          if (ownsFollow()) followController = null;
        }
      },
    };
  };

  const blur = () => {
    generation += 1;
    if (controller) controller.aborted = true;
    if (followController) followController.aborted = true;
    controller = null;
    followController = null;
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

const lifecycle = createLifecycle();
const requestA = lifecycle.start();
lifecycle.blur();
const requestB = lifecycle.start();

requestA.succeed("stale-show-a", ["stale-episode-a"]);
requestA.fail("stale-error-a");
await requestA.finalize(Promise.resolve(true));

assert.equal(lifecycle.state.show, "cached-show", "late A cannot replace the visible show");
assert.deepEqual(
  lifecycle.state.episodes,
  ["cached-episode"],
  "late A cannot replace retained episode rows"
);
assert.equal(lifecycle.state.error, null, "late A cannot publish an error under B");
assert.equal(lifecycle.state.loading, true, "late A finalizer cannot clear B loading state");
assert.equal(lifecycle.activeController, requestB.mine, "B remains the exact current controller");
assert.equal(lifecycle.inflightPage, 1, "late A cannot clear B's in-flight page");

requestB.succeed("current-show-b", ["current-episode-b"]);
const followGate = deferred();
const bFinalizer = requestB.finalize(followGate.promise);

// B has finished network work but is still awaiting auxiliary follow storage.
// Blur/refocus to C while that await is pending.
lifecycle.blur();
const requestC = lifecycle.start();
followGate.resolve(true);
await bFinalizer;

assert.equal(lifecycle.state.following, false, "stale B follow state cannot commit under C");
assert.equal(lifecycle.state.loading, true, "stale B follow finalizer cannot clear C loading");
assert.equal(lifecycle.activeController, requestC.mine, "C retains controller ownership");
assert.equal(lifecycle.inflightPage, 1, "stale B follow finalizer cannot clear C page ownership");

requestC.fail("temporary refocus failure");
await requestC.finalize(Promise.resolve(false));
assert.equal(lifecycle.state.show, "current-show-b", "refocus failure retains the valid show");
assert.deepEqual(
  lifecycle.state.episodes,
  ["current-episode-b"],
  "refocus failure retains valid episode rows"
);
assert.equal(lifecycle.state.error, "temporary refocus failure");
assert.equal(lifecycle.activeController, null);
assert.equal(lifecycle.inflightPage, null);

console.log("PASS podcast show focus-resume", {
  backendFocusReload: true,
  staleDataRejected: true,
  staleFollowRejected: true,
  staleFinalizerRejected: true,
  retainedRowsOnFailure: true,
});
