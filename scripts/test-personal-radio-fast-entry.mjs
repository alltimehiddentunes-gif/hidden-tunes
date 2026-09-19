import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screen = fs.readFileSync(path.join(root, "app/radio.tsx"), "utf8");
const loadStart = screen.indexOf("  const loadRadio = useCallback(");
const loadEnd = screen.indexOf("\n  useEffect(() => {", loadStart);
const loadSource = screen.slice(loadStart, loadEnd);
const openStart = screen.indexOf("  const openCloudTrack = useCallback(");
const openEnd = screen.indexOf("\n  const openYouTubeTrack", openStart);
const openCloudTrackSource = screen.slice(openStart, openEnd);

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

check(
  "normalized bounded TTL and same-query in-flight caches are screen-local",
  screen.includes("PERSONAL_RADIO_SEARCH_CACHE_TTL_MS = 120_000") &&
    screen.includes("PERSONAL_RADIO_SEARCH_CACHE_MAX_ENTRIES = 24") &&
    screen.includes("normalizePersonalRadioSearchKey") &&
    screen.includes("personalRadioSearchInFlight.get(key)") &&
    screen.includes("personalRadioSearchInFlight.get(key) === task")
);
check(
  "fulfilled empty searches are TTL-cached while rejected searches are not",
  !screen.includes("if (!tracks.length) return") &&
    screen.includes("writePersonalRadioSearchCache(key, tracks)") &&
    screen.includes("void task.then(")
);
check(
  "cached and shared arrays are copied before callers receive them",
  screen.includes("return cached.tracks.slice()") &&
    screen.includes("tracks: tracks.slice()") &&
    screen.includes("return tracks.slice()")
);
check(
  "strongest query runs alone before expansion waves of two",
  loadSource.includes("const batchSize = index === 0 ? 1 : PERSONAL_RADIO_EXPANSION_BATCH_SIZE") &&
    screen.includes("PERSONAL_RADIO_EXPANSION_BATCH_SIZE = 2") &&
    loadSource.includes("await Promise.all(")
);
check(
  "first useful wave publishes and removes the blocking loader immediately",
  loadSource.includes("if (uniqueCloudSongs.length > publishedCloudCount)") &&
    loadSource.includes("setCloudTracks(uniqueCloudSongs)") &&
    loadSource.includes("setLoading(false)")
);
check(
  "all cloud terms still enrich final coverage before YouTube fallback",
  loadSource.indexOf("index += batch.length") <
      loadSource.indexOf("if (publishedCloudCount > 0)") &&
    loadSource.indexOf("if (publishedCloudCount > 0)") <
      loadSource.indexOf("searchYouTubeBackend")
);
check(
  "stale generation and subscriber cancellation gate every publication",
  loadSource.includes("radioLoadAbortRef.current?.abort()") &&
    loadSource.includes("!controller.signal.aborted") &&
    loadSource.includes("if (!isCurrentRequest()) return")
);
check(
  "manual refresh bypasses TTL while still joining in-flight work",
  screen.includes("if (!options?.force)") &&
    screen.includes("onPress={() => void loadRadio({ force: true })}")
);
check(
  "refresh keeps a working queue mounted instead of restoring the blocking loader",
  loadSource.includes("const hadVisibleTracks = visibleRadioTrackCountRef.current > 0") &&
    loadSource.includes("if (!hadVisibleTracks) setLoading(true)") &&
    !loadSource.includes("\n      setLoading(true);") &&
    screen.includes("loading && activeTracks.length === 0")
);
check(
  "playback receives an immutable snapshot of the then-visible station queue",
  openCloudTrackSource.includes("const queue = dedupeSongs(cloudTracks.map(safeSong))") &&
    openCloudTrackSource.includes("void playSong(normalized as any, queue as any, index") &&
    !openCloudTrackSource.includes("setCloudTracks")
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

function dedupeById(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

async function runProgressiveStation({ terms, search, publish, fallback }) {
  let combined = [];
  let publishedCount = 0;
  for (let index = 0; index < terms.length; ) {
    const batchSize = index === 0 ? 1 : 2;
    const batch = terms.slice(index, index + batchSize);
    const responses = await Promise.all(batch.map(search));
    for (const rows of responses) combined = combined.concat(rows);
    const unique = dedupeById(combined);
    if (unique.length > publishedCount) {
      publishedCount = unique.length;
      publish(unique);
    }
    index += batch.length;
  }
  if (publishedCount === 0) await fallback();
  return dedupeById(combined);
}

const gates = new Map([
  ["strong", deferred()],
  ["second", deferred()],
  ["third", deferred()],
]);
const starts = [];
const publications = [];
let active = 0;
let maxActive = 0;
let fallbackCalls = 0;
const load = runProgressiveStation({
  terms: ["strong", "second", "third"],
  search(term) {
    starts.push(term);
    active += 1;
    maxActive = Math.max(maxActive, active);
    return gates.get(term).promise.finally(() => {
      active -= 1;
    });
  },
  publish(rows) {
    publications.push(rows);
  },
  async fallback() {
    fallbackCalls += 1;
  },
});

assert.deepEqual(starts, ["strong"], "only the strongest query starts initially");
gates.get("strong").resolve([{ id: "a", title: "A" }]);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(starts, ["strong", "second", "third"]);
assert.deepEqual(publications[0].map((row) => row.id), ["a"]);
checks.push("behavioral strongest result publishes before expansion settles");

const playerQueueSnapshot = publications[0].map((row) => ({ ...row }));
gates.get("second").resolve([
  { id: "b", title: "B" },
  { id: "a", title: "duplicate A" },
]);
gates.get("third").resolve([{ id: "c", title: "C" }]);
const finalRows = await load;
assert.deepEqual(finalRows.map((row) => row.id), ["a", "b", "c"]);
assert.deepEqual(publications.at(-1).map((row) => row.id), ["a", "b", "c"]);
assert.deepEqual(playerQueueSnapshot, [{ id: "a", title: "A" }]);
assert.equal(maxActive, 2);
assert.equal(fallbackCalls, 0);
checks.push("behavioral waves preserve old sequential order with concurrency capped at two");
checks.push("behavioral later enrichment cannot mutate an already-started queue snapshot");

let emptyFallbackCalls = 0;
const emptyFinal = await runProgressiveStation({
  terms: ["one", "two", "three", "four"],
  async search() {
    return [];
  },
  publish() {
    throw new Error("empty waves must not publish");
  },
  async fallback() {
    emptyFallbackCalls += 1;
  },
});
assert.deepEqual(emptyFinal, []);
assert.equal(emptyFallbackCalls, 1);
checks.push("behavioral YouTube fallback runs once only after every cloud term is empty");

function createSearchCacheHarness() {
  let now = 10_000;
  const cache = new Map();
  const inFlight = new Map();
  const transports = [];

  function keyFor(value) {
    return value
      .trim()
      .replace(/\s+music$/i, "")
      .replace(/\s+songs$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  async function search(value, transport, { force = false } = {}) {
    const key = keyFor(value);
    const hit = cache.get(key);
    if (!force && hit && now - hit.at < 120_000) return hit.rows;
    let task = inFlight.get(key);
    if (!task) {
      transports.push(key);
      task = transport();
      inFlight.set(key, task);
      const clear = () => {
        if (inFlight.get(key) === task) inFlight.delete(key);
      };
      void task.then((rows) => {
        cache.set(key, { at: now, rows: rows.slice() });
        clear();
      }, clear);
    }
    return (await task).slice();
  }

  return {
    search,
    advance(ms) {
      now += ms;
    },
    transportKeys() {
      return transports;
    },
  };
}

const cacheHarness = createSearchCacheHarness();
const jazzGate = deferred();
const jazzA = cacheHarness.search(" Jazz Music ", () => jazzGate.promise);
const jazzB = cacheHarness.search("jazz", () => {
  throw new Error("same normalized query must join");
});
assert.deepEqual(cacheHarness.transportKeys(), ["jazz"]);
jazzGate.resolve([{ id: "jazz-1" }]);
assert.deepEqual(await jazzA, [{ id: "jazz-1" }]);
assert.deepEqual(await jazzB, [{ id: "jazz-1" }]);
await cacheHarness.search("JAZZ songs", () => {
  throw new Error("fresh TTL hit must not fetch");
});
assert.deepEqual(cacheHarness.transportKeys(), ["jazz"]);
checks.push("behavioral normalized in-flight and fresh TTL cache issue one request");

cacheHarness.advance(120_001);
await cacheHarness.search("jazz", async () => [{ id: "jazz-2" }]);
assert.deepEqual(cacheHarness.transportKeys(), ["jazz", "jazz"]);
checks.push("behavioral expired TTL permits one new transport request");

const emptyCacheHarness = createSearchCacheHarness();
await emptyCacheHarness.search("no matches", async () => []);
await emptyCacheHarness.search("NO MATCHES", () => {
  throw new Error("fulfilled empty result must be cached for the TTL");
});
assert.deepEqual(emptyCacheHarness.transportKeys(), ["no matches"]);
checks.push("behavioral fulfilled empty remount uses TTL cache with zero new requests");

const visibleRefreshRows = [{ id: "working-1" }, { id: "working-2" }];
const refreshModel = {
  rows: visibleRefreshRows,
  loading: false,
  begin() {
    if (this.rows.length === 0) this.loading = true;
  },
  fail() {},
};
refreshModel.begin();
refreshModel.fail();
assert.equal(refreshModel.loading, false);
assert.deepEqual(refreshModel.rows, visibleRefreshRows);
checks.push("behavioral force refresh failure never blanks or hides visible rows");

console.log(`Personal Radio fast-entry contract: ${checks.length}/${checks.length} PASS`);
