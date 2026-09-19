import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screen = fs.readFileSync(path.join(root, "app/motivation/index.tsx"), "utf8");
const hydrateStart = screen.indexOf("  const hydrateFromHome = useCallback(");
const hydrateEnd = screen.indexOf("\n  const loadLocal = useCallback(", hydrateStart);
const hydrateSource = screen.slice(hydrateStart, hydrateEnd);

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

check(
  "fresh two-minute cache paints without starting home work",
  hydrateSource.includes("now - homeCache.at < HOME_CACHE_TTL_MS") &&
    hydrateSource.indexOf("now - homeCache.at < HOME_CACHE_TTL_MS") <
      hydrateSource.indexOf("const task = (async")
);
check(
  "all callers including refresh join one existing home request",
  hydrateSource.includes("if (homeInFlight) {") &&
    !hydrateSource.includes("if (!force && homeInFlight)")
);
check(
  "shared home request is detached from the first subscriber signal",
  hydrateSource.includes("const home = await fetchMotivationHome();") &&
    !hydrateSource.includes("fetchMotivationHome(signal)")
);
check(
  "subscriber abort is checked before every cache or network publication",
  (hydrateSource.match(/if \(signal\?\.aborted\)/g) || []).length >= 3 &&
    hydrateSource.includes('throw new DOMException("Aborted", "AbortError")')
);
check(
  "in-flight cleanup is promise-identity safe on success and failure",
  hydrateSource.includes("if (homeInFlight === task) homeInFlight = null") &&
    hydrateSource.includes("void task.then(clearOwnedTask, clearOwnedTask)") &&
    !hydrateSource.includes("homeInFlight = task.finally")
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createLifecycleHarness({ now = 1_000, initialCache = null } = {}) {
  let clock = now;
  let cache = initialCache;
  let inFlight = null;
  let fetchCount = 0;
  let nextFetch = deferred();
  let visibleRows = initialCache?.rows || [];
  const publications = [];

  function startFetch() {
    fetchCount += 1;
    const task = nextFetch.promise.then((rows) => {
      const payload = { at: clock, rows };
      cache = payload;
      return payload;
    });
    inFlight = task;
    const clearOwnedTask = () => {
      if (inFlight === task) inFlight = null;
    };
    void task.then(clearOwnedTask, clearOwnedTask);
    return task;
  }

  async function hydrate({ signal, force = false, subscriber = "screen" } = {}) {
    if (!force && cache && clock - cache.at < 120_000) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      visibleRows = cache.rows;
      publications.push(`${subscriber}:cache`);
      return cache;
    }

    const task = inFlight || startFetch();
    const payload = await task;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    visibleRows = payload.rows;
    publications.push(`${subscriber}:network`);
    return payload;
  }

  return {
    hydrate,
    resolve(rows) {
      nextFetch.resolve(rows);
    },
    reject(error) {
      nextFetch.reject(error);
    },
    prepareNextFetch() {
      nextFetch = deferred();
    },
    advance(ms) {
      clock += ms;
    },
    snapshot() {
      return { cache, fetchCount, inFlight, publications, visibleRows };
    },
  };
}

const rapidFocus = createLifecycleHarness();
const firstFocus = new AbortController();
const secondFocus = new AbortController();
const firstResult = rapidFocus
  .hydrate({ signal: firstFocus.signal, subscriber: "first" })
  .then(
    () => "resolved",
    (error) => error.name
  );
firstFocus.abort();
const secondResult = rapidFocus.hydrate({
  signal: secondFocus.signal,
  subscriber: "second",
});
assert.equal(rapidFocus.snapshot().fetchCount, 1);
rapidFocus.resolve(["program-a"]);
assert.equal(await firstResult, "AbortError");
await secondResult;
assert.deepEqual(rapidFocus.snapshot().visibleRows, ["program-a"]);
assert.deepEqual(rapidFocus.snapshot().publications, ["second:network"]);
checks.push("rapid blur/refocus keeps one request and only active focus publishes");

await rapidFocus.hydrate({
  signal: new AbortController().signal,
  subscriber: "fresh-remount",
});
assert.equal(rapidFocus.snapshot().fetchCount, 1);
assert.equal(rapidFocus.snapshot().publications.at(-1), "fresh-remount:cache");
checks.push("fresh remount paints cache with zero additional requests");

const refreshJoin = createLifecycleHarness();
const normalLoad = refreshJoin.hydrate({ subscriber: "normal" });
const forcedLoad = refreshJoin.hydrate({ force: true, subscriber: "refresh" });
assert.equal(refreshJoin.snapshot().fetchCount, 1);
refreshJoin.resolve(["program-b"]);
await Promise.all([normalLoad, forcedLoad]);
assert.equal(refreshJoin.snapshot().fetchCount, 1);
checks.push("force refresh joins an already-running request instead of duplicating it");

const failedRefresh = createLifecycleHarness({
  initialCache: { at: 0, rows: ["visible-program"] },
  now: 200_000,
});
const refreshFailure = failedRefresh
  .hydrate({ force: true, subscriber: "refresh" })
  .then(
    () => "resolved",
    () => "rejected"
  );
failedRefresh.reject(new Error("offline"));
assert.equal(await refreshFailure, "rejected");
assert.deepEqual(failedRefresh.snapshot().visibleRows, ["visible-program"]);
checks.push("failed refresh preserves already-visible cached rows");

await Promise.resolve();
assert.equal(failedRefresh.snapshot().inFlight, null);
failedRefresh.prepareNextFetch();
const retry = failedRefresh.hydrate({ force: true, subscriber: "retry" });
assert.equal(failedRefresh.snapshot().fetchCount, 2);
failedRefresh.resolve(["program-c"]);
await retry;
assert.deepEqual(failedRefresh.snapshot().visibleRows, ["program-c"]);
checks.push("rejected shared request cleans up and permits one focused retry");

const abortedFresh = createLifecycleHarness({
  initialCache: { at: 1_000, rows: ["cached-program"] },
  now: 1_500,
});
const abortedController = new AbortController();
abortedController.abort();
await assert.rejects(
  abortedFresh.hydrate({ signal: abortedController.signal }),
  (error) => error.name === "AbortError"
);
assert.deepEqual(abortedFresh.snapshot().publications, []);
checks.push("aborted subscriber cannot publish even a fresh cache snapshot");

console.log(
  `Motivation focus/cache lifecycle contract: ${checks.length}/${checks.length} PASS`
);
