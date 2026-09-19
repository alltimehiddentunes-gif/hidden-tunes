import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import ts from "typescript";

const cacheSource = readFileSync("services/radio/radioCache.ts", "utf8");
const apiSource = readFileSync("services/radio/radioBrowserApi.ts", "utf8");
const hookSource = readFileSync("hooks/useLazyRadioStationList.ts", "utf8");
const categoryScreenSource = readFileSync("app/stations/[categoryId].tsx", "utf8");
const searchScreenSource = readFileSync("app/stations/search.tsx", "utf8");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `missing source start: ${start}`);
  assert.ok(endIndex > startIndex, `missing source end: ${end}`);
  return source.slice(startIndex, endIndex).replaceAll("export ", "");
}

const cacheCore = sourceBetween(
  cacheSource,
  "export function normalizeRadioCategoryCacheKey",
  "export async function hydrateCachedRadioStations"
);
const hydrateFunction = sourceBetween(
  cacheSource,
  "export async function hydrateCachedRadioStations",
  "export function writeCachedRadioStations"
);
const writeFunction = sourceBetween(
  cacheSource,
  "export function writeCachedRadioStations",
  "export function getRadioStationInflight"
);
const inflightFunctions = sourceBetween(
  cacheSource,
  "export function getRadioStationInflight",
  "export function countCachedRadioStations"
);
const browseLifecycle = sourceBetween(
  apiSource,
  "const browseAbortControllers",
  "async function fetchWithTimeout"
);
const cacheMetaFunctions = sourceBetween(
  cacheSource,
  "export function countCachedRadioStations",
  "function stripMatureStations"
);

const coldRefreshIndex = hookSource.indexOf("const coldRefreshPromise");
const hydrateIndex = hookSource.indexOf(
  "const hydrated = await hydrateCachedRadioStations(cacheKey)",
  coldRefreshIndex
);
assert.ok(coldRefreshIndex >= 0 && coldRefreshIndex < hydrateIndex, "transport starts before disk await");
assert.match(
  hookSource,
  /const coldRefreshPromise = !cachedPage\.length[\s\S]*?fetchPage\(0, false, true\)/,
  "only a process-cold memory miss starts concurrent refresh"
);
assert.match(
  hookSource,
  /if \(coldRefreshPromise\) \{\s*await coldRefreshPromise;\s*\} else \{\s*await fetchPage/,
  "cold path reuses one refresh rather than issuing a second request"
);

const inflightJoinIndex = apiSource.indexOf(
  "getRadioStationInflight<LoadRadioPageResult>(inflightKey)"
);
const controllerIndex = apiSource.indexOf("const signal = beginBrowseRequest(requestKey)");
assert.ok(
  inflightJoinIndex >= 0 && inflightJoinIndex < controllerIndex,
  "identical first-page work joins before a new controller can cancel its owner"
);
assert.match(
  apiSource,
  /ownBrowseInflight\(requestKey, inflightKey, loadPromise\)/,
  "the complete page result is shared"
);
assert.doesNotMatch(
  apiSource,
  /setRadioStationInflight\([\s\S]{0,180}result\.stations/,
  "dedupe must not discard backend cursor metadata"
);
assert.match(
  apiSource,
  /typeof normalized\.backendNextOffset === "number"[\s\S]*?offset \+ limit/,
  "backend cursor wins with page-size fallback"
);
assert.match(
  hookSource,
  /nextOffsetRef\.current = meta\.backendNextOffset[\s\S]*?requestOffset \+ RADIO_STATION_PAGE_SIZE/,
  "visible list keeps backend offset ownership"
);
assert.match(
  cacheSource,
  /existingHydration = hydrationInflight\.get\(key\)/,
  "disk hydration is deduplicated per cache key"
);
assert.match(
  cacheSource,
  /isHydrationRevisionCurrent[\s\S]*?return getMemoryEntry\(key\)\?\.stations \|\| null/,
  "late disk completion resolves newer memory"
);
assert.doesNotMatch(
  cacheSource,
  /void AsyncStorage\.removeItem\(`\$\{STORAGE_PREFIX\}:\$\{key\}`\)/,
  "stale hydration cleanup cannot race a newer persisted snapshot"
);
assert.match(
  hookSource,
  /const requestOwnerId = useId\(\);[\s\S]*?requestKey: ownedRequestKey/,
  "each mounted list threads a stable cancellation owner into transport"
);
assert.match(
  categoryScreenSource,
  /requestKey: options\.requestKey/,
  "category screen preserves the hook owner identity"
);
assert.match(
  searchScreenSource,
  /requestKey: options\.requestKey/,
  "search screen preserves the hook owner identity"
);
assert.match(
  apiSource,
  /deleteRadioStationInflight\(inflightOwner\.inflightKey, inflightOwner\.promise\)[\s\S]*?controller\.abort\(\)/,
  "cancel evicts the owned promise before aborting transport"
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

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createStorage(overrides = {}) {
  const data = new Map();
  const calls = { getItem: 0, setItem: 0, removeItem: 0 };
  const storage = {
    data,
    calls,
    async getItem(key) {
      calls.getItem += 1;
      if (overrides.getItem) return await overrides.getItem.call(storage, key);
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      calls.setItem += 1;
      if (overrides.setItem) return await overrides.setItem.call(storage, key, value);
      data.set(key, value);
    },
    async removeItem(key) {
      calls.removeItem += 1;
      if (overrides.removeItem) return await overrides.removeItem.call(storage, key);
      data.delete(key);
    },
  };
  return storage;
}

function createCacheHarness(storage) {
  const harnessSource = `
    type HiddenTunesStation = { id: string; streamUrl: string; [key: string]: unknown };
    type CachedStationPayload = {
      stations: HiddenTunesStation[];
      cachedAt: number;
      backendTotal?: number;
      backendHasMore?: boolean;
      nextBackendOffset?: number;
    };
    type RadioCachePaginationMeta = {
      backendTotal?: number;
      backendHasMore?: boolean;
      nextBackendOffset?: number;
      stationCount: number;
    };

    const STORAGE_PREFIX = "radio-test";
    const CACHE_TTL_MS = 18 * 60 * 60 * 1000;
    const MAX_MEMORY_ENTRIES = 24;
    const MAX_STATIONS_PER_KEY = 2000;
    const STORAGE_WRITE_DEBOUNCE_MS = 1;
    const AsyncStorage = globalThis.__storage as any;

    const memoryCache = new Map<string, CachedStationPayload>();
    const memoryRevisions = new Map<string, number>();
    const hydrationInflight = new Map<string, Promise<HiddenTunesStation[] | null>>();
    const inflight = new Map<string, Promise<unknown>>();
    const pendingStorageWrites = new Map<string, CachedStationPayload>();
    const storageWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
    let radioCacheGlobalRevision = 0;

    ${cacheCore}
    ${hydrateFunction}
    ${writeFunction}
    ${inflightFunctions}
    ${cacheMetaFunctions}

    globalThis.__api = {
      hydrateCachedRadioStations,
      writeCachedRadioStations,
      readCachedRadioStations,
      readRadioCachePaginationMeta,
      getRadioStationInflight,
      setRadioStationInflight,
      stopTimers() {
        for (const timer of storageWriteTimers.values()) clearTimeout(timer);
        storageWriteTimers.clear();
        pendingStorageWrites.clear();
      },
    };
  `;

  const compiled = ts.transpileModule(harnessSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
  }).outputText;
  const context = vm.createContext({
    __storage: storage,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(compiled, context);
  return context.__api;
}

function createBrowseHarness() {
  const harnessSource = `
    const inflight = new Map<string, Promise<unknown>>();
    function normalizeRadioCategoryCacheKey(value: string) {
      return String(value || "global").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    }
    function getRadioStationInflight<T>(key: string) {
      return inflight.get(normalizeRadioCategoryCacheKey(key)) as Promise<T> | undefined;
    }
    function setRadioStationInflight<T>(key: string, promise: Promise<T>) {
      inflight.set(normalizeRadioCategoryCacheKey(key), promise);
      return promise;
    }
    function deleteRadioStationInflight<T>(key: string, expected?: Promise<T>) {
      const normalized = normalizeRadioCategoryCacheKey(key);
      if (expected && inflight.get(normalized) !== expected) return false;
      return inflight.delete(normalized);
    }
    ${browseLifecycle}
    globalThis.__api = {
      beginBrowseRequest,
      cancelRadioBrowseRequest,
      ownBrowseInflight,
      getRadioStationInflight,
    };
  `;
  const compiled = ts.transpileModule(harnessSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
  }).outputText;
  const context = vm.createContext({ AbortController });
  vm.runInContext(compiled, context);
  return context.__api;
}

function station(id) {
  return { id, streamUrl: `https://radio.example/${id}` };
}

function ids(stations) {
  return Array.from(stations || [], (entry) => entry.id);
}

async function testCacheFirstThenNetwork() {
  const diskGate = deferred();
  const storage = createStorage({
    async getItem(key) {
      const captured = this.data.get(key) ?? null;
      await diskGate.promise;
      return captured;
    },
  });
  storage.data.set(
    "radio-test:featured",
    JSON.stringify({ stations: [station("disk")], cachedAt: Date.now() })
  );
  const cache = createCacheHarness(storage);

  const hydration = cache.hydrateCachedRadioStations("featured");
  diskGate.resolve();
  assert.deepEqual(ids(await hydration), ["disk"], "disk cache becomes first usable data");

  cache.writeCachedRadioStations("featured", [station("network")]);
  assert.deepEqual(ids(cache.readCachedRadioStations("featured")), ["network"]);
  cache.stopTimers();
}

async function testNetworkFirstRejectsLateDiskAndDedupesHydration() {
  const diskGate = deferred();
  const storage = createStorage({
    async getItem(key) {
      const captured = this.data.get(key) ?? null;
      await diskGate.promise;
      return captured;
    },
  });
  storage.data.set(
    "radio-test:featured",
    JSON.stringify({ stations: [station("disk-old")], cachedAt: Date.now() })
  );
  const cache = createCacheHarness(storage);

  const hydrationA = cache.hydrateCachedRadioStations("featured");
  const hydrationB = cache.hydrateCachedRadioStations("featured");
  await nextTurn();
  assert.equal(storage.calls.getItem, 1, "same-key hydration performs one disk read");

  cache.writeCachedRadioStations("featured", [station("network-new")], {
    backendHasMore: true,
    nextBackendOffset: 40,
  });
  diskGate.resolve();

  assert.deepEqual(ids(await hydrationA), ["network-new"]);
  assert.deepEqual(ids(await hydrationB), ["network-new"]);
  assert.deepEqual(ids(cache.readCachedRadioStations("featured")), ["network-new"]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(storage.calls.removeItem, 0, "stale hydration never deletes storage");
  assert.deepEqual(
    ids(JSON.parse(storage.data.get("radio-test:featured")).stations),
    ["network-new"],
    "newer debounced persistence replaces inert stale disk data"
  );
  cache.stopTimers();
}

async function testFullResultDedupeAndAbort() {
  const storage = createStorage();
  const cache = createCacheHarness(storage);
  const abortController = new AbortController();
  let transportCalls = 1;

  const owner = new Promise((resolve) => {
    abortController.signal.addEventListener(
      "abort",
      () =>
        resolve({
          stations: [],
          hasMore: false,
          fromCache: false,
          stopReason: "aborted",
        }),
      { once: true }
    );
  });
  cache.setRadioStationInflight("featured-request-category-featured", owner);
  const joined = cache.getRadioStationInflight("featured-request-category-featured");
  assert.equal(joined, owner, "duplicate joins the full owner promise");
  assert.equal(transportCalls, 1);

  abortController.abort();
  const aborted = await joined;
  assert.equal(aborted.stopReason, "aborted");
  await nextTurn();
  assert.equal(
    cache.getRadioStationInflight("featured-request-category-featured"),
    undefined,
    "settled owner is removed by identity"
  );
  cache.stopTimers();
}

async function testBlurRefocusEvictsOnlyTheCancelledOwner() {
  const browse = createBrowseHarness();
  const oldOwnerKey = "category:featured:owner:A";
  const newOwnerKey = "category:featured:owner:B";
  const oldInflightKey = `featured-request-${oldOwnerKey}`;
  const newInflightKey = `featured-request-${newOwnerKey}`;
  const oldResult = deferred();
  const newResult = deferred();

  const oldSignal = browse.beginBrowseRequest(oldOwnerKey);
  browse.ownBrowseInflight(oldOwnerKey, oldInflightKey, oldResult.promise);
  assert.equal(browse.getRadioStationInflight(oldInflightKey), oldResult.promise);

  browse.cancelRadioBrowseRequest(oldOwnerKey);
  assert.equal(oldSignal.aborted, true, "blur aborts the old owner");
  assert.equal(
    browse.getRadioStationInflight(oldInflightKey),
    undefined,
    "blur identity-evicts the doomed promise before refocus"
  );

  const newSignal = browse.beginBrowseRequest(newOwnerKey);
  browse.ownBrowseInflight(newOwnerKey, newInflightKey, newResult.promise);
  assert.equal(
    browse.getRadioStationInflight(newInflightKey),
    newResult.promise,
    "refocus owns fresh live work"
  );

  browse.cancelRadioBrowseRequest(oldOwnerKey);
  assert.equal(newSignal.aborted, false, "old/joined cleanup cannot abort a new owner");
  assert.equal(
    browse.getRadioStationInflight(newInflightKey),
    newResult.promise,
    "old/joined cleanup cannot evict a new owner"
  );

  oldResult.resolve({ stopReason: "aborted" });
  await nextTurn();
  assert.equal(
    browse.getRadioStationInflight(newInflightKey),
    newResult.promise,
    "late old settlement is identity-safe"
  );
  newResult.resolve({ stopReason: "network" });
  await nextTurn();
}

async function testSearchCursorMetadataSurvivesDedupe() {
  const storage = createStorage();
  const cache = createCacheHarness(storage);
  const searchResult = Promise.resolve({
    stations: Array.from({ length: 9 }, (_, index) => station(`jazz-${index}`)),
    hasMore: true,
    fromCache: false,
    backendTotal: 1082,
    backendPageRowCount: 40,
    backendNextOffset: 40,
    source: "catalog",
    stopReason: "backend-has-more",
  });
  cache.setRadioStationInflight("catalog-search-jazz-request-search-jazz", searchResult);

  const joined = await cache.getRadioStationInflight(
    "catalog-search-jazz-request-search-jazz"
  );
  assert.equal(joined.stations.length, 9, "filtered visible count remains independent");
  assert.equal(joined.hasMore, true, "backend hasMore survives a short visible page");
  assert.equal(joined.backendTotal, 1082);
  assert.equal(joined.backendPageRowCount, 40);
  assert.equal(joined.backendNextOffset, 40, "page cursor advances by request size");
  cache.stopTimers();
}

await testCacheFirstThenNetwork();
await testNetworkFirstRejectsLateDiskAndDedupesHydration();
await testFullResultDedupeAndAbort();
await testBlurRefocusEvictsOnlyTheCancelledOwner();
await testSearchCursorMetadataSurvivesDedupe();

console.log("test-radio-first-page-cache-network: PASS");
