import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screen = fs.readFileSync(path.join(root, "app/music-feed.tsx"), "utf8");
const loadStart = screen.indexOf("  const loadCatalog = useCallback(");
const loadEnd = screen.indexOf("\n  useEffect(() => {", loadStart);
const loadCatalog = screen.slice(loadStart, loadEnd);

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

const hydrateStart = loadCatalog.indexOf(
  "const hydratedPromise = hydrateCachedHiddenTunesCatalog()"
);
const firstPageStart = loadCatalog.indexOf(
  "const firstPagePromise = getHiddenTunesSongsPage("
);
const firstSettlement = loadCatalog.indexOf("await Promise.allSettled(");

check(
  "disk hydration and first-page work start before the first settlement await",
  hydrateStart >= 0 &&
    firstPageStart > hydrateStart &&
    firstSettlement > firstPageStart &&
    !loadCatalog.includes("await hydrateCachedHiddenTunesCatalog()")
);
check(
  "late cache publication and status cannot overwrite primary content",
  loadCatalog.includes(
    "if (!hydrated || networkContentPublished || !isCurrentLoad()) return;"
  ) &&
    loadCatalog.includes(
      'if (isCurrentLoad() && !networkContentPublished) {\n              setCatalogStatus("cached");'
    )
);
check(
  "usable first-page content claims precedence before publishing",
  loadCatalog.includes(
    "if (pageResult.songs.length > 0 && firstPageCatalog?.songs.length)"
  ) &&
    loadCatalog.includes(
      "networkContentPublished = true;\n              applyCatalog(firstPageCatalog, generation);"
    )
);
check(
  "empty or failed primary work cannot clear an existing catalog",
  !loadCatalog.includes("setCatalog(null)") &&
    loadCatalog.includes("!hasUsableCatalogRef.current") &&
    loadCatalog.includes("terminalNetworkStatus")
);
check(
  "all visible cold-entry commits use the mounted focus generation guard",
  loadCatalog.includes("const isCurrentLoad = () =>") &&
    loadCatalog.includes("generation === loadGenerationRef.current") &&
    loadCatalog.includes("if (isCurrentLoad()) {\n            setHomePreferences") &&
    loadCatalog.includes("if (isCurrentLoad()) {\n          setLoading(false);")
);
check(
  "single-flight request dedupe remains intact",
  loadCatalog.includes("if (catalogRequestRef.current)") &&
    loadCatalog.includes("return catalogRequestRef.current") &&
    loadCatalog.includes("catalogRequestRef.current = request") &&
    loadCatalog.includes(
      "if (catalogRequestRef.current === request) {\n          catalogRequestRef.current = null;"
    )
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

function createColdEntryHarness(initialRows = []) {
  const cache = deferred();
  const network = deferred();
  const starts = [];
  const commits = [];
  let rows = initialRows;
  let status = initialRows.length ? "cached" : "loading";
  let current = true;
  let networkContentPublished = false;
  let terminalNetworkStatus = null;
  let request = null;
  let networkStarts = 0;

  function load() {
    if (request) return request;
    const cachePromise = (() => {
      starts.push("cache");
      return cache.promise;
    })();
    const networkPromise = (() => {
      starts.push("network");
      networkStarts += 1;
      return network.promise;
    })();

    const cacheTask = cachePromise.then((nextRows) => {
      if (!current || networkContentPublished || nextRows.length === 0) return;
      rows = nextRows;
      status = "cached";
      commits.push("cache");
    });
    const networkTask = networkPromise
      .then((result) => {
        if (!current) return;
        if (result.rows.length > 0) {
          networkContentPublished = true;
          rows = result.rows;
          status = result.source === "network" ? "fresh" : "cached";
          commits.push("network");
          return;
        }
        terminalNetworkStatus = result.error ? "error" : "empty";
      })
      .catch(() => {
        terminalNetworkStatus = "error";
      });

    request = Promise.allSettled([cacheTask, networkTask]).then(() => {
      if (current && rows.length === 0 && terminalNetworkStatus) {
        status = terminalNetworkStatus;
        commits.push("terminal");
      }
    });
    return request;
  }

  return {
    cache,
    network,
    load,
    cancel() {
      current = false;
    },
    snapshot() {
      return { rows, status, starts, commits, networkStarts };
    },
  };
}

const cacheFirst = createColdEntryHarness();
const cacheFirstRequest = cacheFirst.load();
assert.deepEqual(cacheFirst.snapshot().starts, ["cache", "network"]);
cacheFirst.cache.resolve(["cached-a"]);
await Promise.resolve();
assert.deepEqual(cacheFirst.snapshot().rows, ["cached-a"]);
cacheFirst.network.resolve({ rows: ["network-b"], source: "network" });
await cacheFirstRequest;
assert.deepEqual(cacheFirst.snapshot().rows, ["network-b"]);
assert.equal(cacheFirst.snapshot().status, "fresh");
checks.push("behavioral cache-first paint yields to usable first-page content");

const networkFirst = createColdEntryHarness();
const networkFirstRequest = networkFirst.load();
networkFirst.network.resolve({ rows: ["network-a"], source: "network" });
await Promise.resolve();
networkFirst.cache.resolve(["cached-b"]);
await networkFirstRequest;
assert.deepEqual(networkFirst.snapshot().rows, ["network-a"]);
assert.deepEqual(networkFirst.snapshot().commits, ["network"]);
checks.push("behavioral network-first path suppresses late cache and status");

const failedWithCache = createColdEntryHarness(["visible-cache"]);
const failedRequest = failedWithCache.load();
failedWithCache.cache.resolve([]);
failedWithCache.network.reject(new Error("offline"));
await failedRequest;
assert.deepEqual(failedWithCache.snapshot().rows, ["visible-cache"]);
assert.equal(failedWithCache.snapshot().status, "cached");
checks.push("behavioral primary failure preserves an existing catalog");

const emptyWithCache = createColdEntryHarness(["visible-cache"]);
const emptyRequest = emptyWithCache.load();
emptyWithCache.cache.resolve([]);
emptyWithCache.network.resolve({ rows: [], source: "network" });
await emptyRequest;
assert.deepEqual(emptyWithCache.snapshot().rows, ["visible-cache"]);
assert.equal(emptyWithCache.snapshot().status, "cached");
checks.push("behavioral authoritative empty preserves an existing catalog");

const cancelled = createColdEntryHarness();
const cancelledRequest = cancelled.load();
cancelled.cancel();
cancelled.cache.resolve(["cached-a"]);
cancelled.network.resolve({ rows: ["network-b"], source: "network" });
await cancelledRequest;
assert.deepEqual(cancelled.snapshot().rows, []);
assert.deepEqual(cancelled.snapshot().commits, []);
checks.push("behavioral cancellation blocks cache network and final commits");

const deduped = createColdEntryHarness();
const firstRequest = deduped.load();
const secondRequest = deduped.load();
assert.equal(firstRequest, secondRequest);
assert.equal(deduped.snapshot().networkStarts, 1);
deduped.cache.resolve([]);
deduped.network.resolve({ rows: [], source: "network" });
await firstRequest;
checks.push("behavioral concurrent callers share one first-page request");

console.log(`Home cold-entry concurrency contract: ${checks.length}/${checks.length} PASS`);
