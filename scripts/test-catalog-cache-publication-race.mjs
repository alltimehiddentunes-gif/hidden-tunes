import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import ts from "typescript";

const serviceSource = readFileSync("services/hiddenTunesApi.ts", "utf8");

function sourceBetween(start, end) {
  const startIndex = serviceSource.indexOf(start);
  const endIndex = serviceSource.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `missing source start: ${start}`);
  assert.ok(endIndex > startIndex, `missing source end: ${end}`);
  return serviceSource.slice(startIndex, endIndex);
}

const memoryHelpers = sourceBetween(
  "function getCurrentSongsMemoryCache()",
  "function isNormalizedCatalogSong"
);
const storagePipeline = sourceBetween(
  "async function readCachedSongsFromStorage()",
  "async function isCacheFresh()"
);
const clearFunction = sourceBetween(
  "export async function clearHiddenTunesSongsCache()",
  "export async function clearHiddenTunesArtistsCache()"
).replace("export async function", "async function");

assert.equal(
  (serviceSource.match(/songsMemoryCache\s*=/g) || []).length,
  2,
  "song memory assignment is centralized in publish/clear helpers"
);
assert.match(
  serviceSource,
  /if \(songsMemoryRevision !== expectedMemoryRevision\)[\s\S]*?return getCurrentSongsMemoryCache\(\)/,
  "late storage hydration resolves to the newer memory revision"
);
assert.match(
  serviceSource,
  /if \(catalogStorageHydratePromise === hydratePromise\)/,
  "hydrate cleanup is promise-identity safe"
);
assert.doesNotMatch(
  serviceSource,
  /await writeCachedSongs\(/,
  "network callers do not wait for persistent storage"
);
assert.match(
  serviceSource,
  /seedOnboardingCatalogPrewarm[\s\S]*?writeCachedSongs\(merged\)/,
  "onboarding publication uses the same revisioned owner"
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
  const multiSetCalls = [];
  const multiRemoveCalls = [];

  const storage = {
    data,
    multiSetCalls,
    multiRemoveCalls,
    async getItem(key) {
      if (overrides.getItem) return await overrides.getItem.call(storage, key);
      return data.get(key) ?? null;
    },
    async multiSet(entries) {
      multiSetCalls.push(entries);
      if (overrides.multiSet) {
        return await overrides.multiSet.call(storage, entries);
      }
      for (const [key, value] of entries) data.set(key, value);
    },
    async multiRemove(keys) {
      multiRemoveCalls.push(keys);
      if (overrides.multiRemove) {
        return await overrides.multiRemove.call(storage, keys);
      }
      for (const key of keys) data.delete(key);
    },
  };

  return storage;
}

function createHarness(storage, testConsole = console) {
  const harnessSource = `
    type HiddenTunesNormalizedSong = { id: string; [key: string]: unknown };
    type CatalogStorageMutation =
      | { kind: "write"; revision: number; payload: string; persistedAt: string }
      | { kind: "clear"; revision: number; resolve: () => void; reject: (error: unknown) => void };

    const CACHE_KEY_V4 = "v4";
    const CACHE_TIME_KEY_V4 = "v4-time";
    const CACHE_KEY_V5 = "v5";
    const CACHE_TIME_KEY_V5 = "v5-time";
    const AsyncStorage = globalThis.__storage as any;

    let songsMemoryCache: HiddenTunesNormalizedSong[] | null = null;
    let songsMemoryCacheTime = 0;
    let songsMemoryRevision = 0;
    let songsFetchPromise: Promise<HiddenTunesNormalizedSong[]> | null = null;
    let catalogStorageHydratePromise: Promise<HiddenTunesNormalizedSong[]> | null = null;
    let catalogStorageClearPromise: Promise<void> | null = null;
    let fullCatalogFetchPromise: Promise<HiddenTunesNormalizedSong[]> | null = null;
    const songsPageInflight = new Map<string, Promise<unknown>>();
    const catalogStorageMutationQueue: CatalogStorageMutation[] = [];
    let catalogStorageMutationPromise: Promise<void> | null = null;

    function finalizeSongs(songs: HiddenTunesNormalizedSong[]) { return songs; }
    function toPersistedCatalogSongV5(song: HiddenTunesNormalizedSong) { return song; }

    ${memoryHelpers}

    async function readCachedSongsV5FromStorage(expectedMemoryRevision: number) {
      const cached = await AsyncStorage.getItem(CACHE_KEY_V5);
      if (!cached) return null;
      const songs = JSON.parse(cached) as HiddenTunesNormalizedSong[];
      const cachedAt = Number(await AsyncStorage.getItem(CACHE_TIME_KEY_V5)) || Date.now();
      return publishStorageHydratedSongs(songs, cachedAt, expectedMemoryRevision);
    }

    async function readCachedSongsV4FromStorage(expectedMemoryRevision: number) {
      const cached = await AsyncStorage.getItem(CACHE_KEY_V4);
      if (songsMemoryRevision !== expectedMemoryRevision) return getCurrentSongsMemoryCache();
      return cached ? JSON.parse(cached) : [];
    }

    ${storagePipeline}
    ${clearFunction}

    globalThis.__api = {
      readCachedSongs,
      writeCachedSongs,
      clearHiddenTunesSongsCache,
      snapshot: () => getCurrentSongsMemoryCache(),
      revision: () => songsMemoryRevision,
      hydratePromise: () => catalogStorageHydratePromise,
      async waitForStorage() {
        while (catalogStorageMutationPromise) {
          const pending = catalogStorageMutationPromise;
          await pending;
          await Promise.resolve();
        }
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
    console: testConsole,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(compiled, context);
  return context.__api;
}

async function testLateDiskHydrateCannotOverwriteNetwork() {
  const readGate = deferred();
  const writeGate = deferred();
  const storage = createStorage({
    async getItem(key) {
      const captured = this.data.get(key) ?? null;
      if (key === "v5") await readGate.promise;
      return captured;
    },
    async multiSet(entries) {
      await writeGate.promise;
      for (const [key, value] of entries) this.data.set(key, value);
    },
  });
  storage.data.set("v5", JSON.stringify([{ id: "disk-old" }]));
  storage.data.set("v5-time", "100");
  const cache = createHarness(storage);

  const hydration = cache.readCachedSongs();
  await nextTurn();
  const publicationResult = cache.writeCachedSongs([{ id: "network-new" }]);

  assert.equal(publicationResult, undefined, "memory publication does not await storage");
  assert.deepEqual(
    Array.from(cache.snapshot(), (song) => song.id),
    ["network-new"],
    "fresh network data is visible immediately"
  );

  readGate.resolve();
  const hydrated = await hydration;
  assert.deepEqual(
    Array.from(hydrated, (song) => song.id),
    ["network-new"],
    "late disk hydration resolves to newer memory"
  );
  assert.deepEqual(Array.from(cache.snapshot(), (song) => song.id), ["network-new"]);

  writeGate.resolve();
  await cache.waitForStorage();
}

async function testLatestPersistenceCoalesces() {
  const firstWriteGate = deferred();
  let writeCount = 0;
  const storage = createStorage({
    async multiSet(entries) {
      writeCount += 1;
      if (writeCount === 1) await firstWriteGate.promise;
      for (const [key, value] of entries) this.data.set(key, value);
    },
  });
  const cache = createHarness(storage);

  cache.writeCachedSongs([{ id: "a" }]);
  cache.writeCachedSongs([{ id: "b" }]);
  cache.writeCachedSongs([{ id: "c" }]);
  firstWriteGate.resolve();
  await cache.waitForStorage();

  assert.equal(storage.multiSetCalls.length, 2, "pending writes coalesce behind active write");
  const persistedIds = storage.multiSetCalls.map((entries) => {
    const payload = entries.find(([key]) => key === "v5")?.[1];
    return JSON.parse(payload)[0].id;
  });
  assert.deepEqual(persistedIds, ["a", "c"]);
  assert.equal(JSON.parse(storage.data.get("v5"))[0].id, "c");
}

async function testClearOrdersAfterActiveWriteAndInvalidatesPending() {
  const activeWriteGate = deferred();
  let writeCount = 0;
  const storage = createStorage({
    async multiSet(entries) {
      writeCount += 1;
      if (writeCount === 1) await activeWriteGate.promise;
      for (const [key, value] of entries) this.data.set(key, value);
    },
  });
  const cache = createHarness(storage);

  cache.writeCachedSongs([{ id: "active-old" }]);
  cache.writeCachedSongs([{ id: "pending-old" }]);
  const cleared = cache.clearHiddenTunesSongsCache();
  assert.deepEqual(Array.from(cache.snapshot()), [], "clear invalidates memory synchronously");

  activeWriteGate.resolve();
  await cleared;
  await cache.waitForStorage();

  assert.equal(storage.multiSetCalls.length, 1, "pending pre-clear snapshot is skipped");
  assert.equal(storage.multiRemoveCalls.length, 1, "clear runs after the active write");
  assert.equal(storage.data.has("v5"), false, "active old write cannot repopulate after clear");
}

async function testHydrateCleanupIsIdentitySafeAcrossClear() {
  const oldReadGate = deferred();
  const newReadGate = deferred();
  let v5ReadCount = 0;
  const storage = createStorage({
    async getItem(key) {
      if (key !== "v5") return this.data.get(key) ?? null;
      const readNumber = ++v5ReadCount;
      const captured = this.data.get(key) ?? null;
      if (readNumber === 1) await oldReadGate.promise;
      if (readNumber === 2) await newReadGate.promise;
      return captured;
    },
  });
  storage.data.set("v5", JSON.stringify([{ id: "old-disk" }]));
  const cache = createHarness(storage);

  const oldHydration = cache.readCachedSongs();
  await nextTurn();
  await cache.clearHiddenTunesSongsCache();

  const newHydration = cache.readCachedSongs();
  await nextTurn();
  const trackedNewHydration = cache.hydratePromise();
  assert.ok(trackedNewHydration, "post-clear hydration is tracked");

  oldReadGate.resolve();
  await oldHydration;
  await nextTurn();
  assert.equal(
    cache.hydratePromise(),
    trackedNewHydration,
    "old hydration cleanup cannot clear the newer tracked hydration"
  );

  newReadGate.resolve();
  await newHydration;
}

async function testRejectedPersistenceDoesNotFloat() {
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const storage = createStorage({
      async multiSet() {
        throw new Error("slow-storage-failed");
      },
    });
    const cache = createHarness(storage, { log() {} });
    cache.writeCachedSongs([{ id: "still-visible" }]);
    await cache.waitForStorage();
    await nextTurn();
    assert.deepEqual(Array.from(cache.snapshot(), (song) => song.id), ["still-visible"]);
    assert.equal(unhandled, 0, "background persistence failure is owned");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}

await testLateDiskHydrateCannotOverwriteNetwork();
await testLatestPersistenceCoalesces();
await testClearOrdersAfterActiveWriteAndInvalidatesPending();
await testHydrateCleanupIsIdentitySafeAcrossClear();
await testRejectedPersistenceDoesNotFloat();

console.log("test-catalog-cache-publication-race: PASS");
