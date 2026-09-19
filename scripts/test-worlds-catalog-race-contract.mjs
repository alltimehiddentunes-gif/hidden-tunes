import assert from "node:assert/strict";
import fs from "node:fs";

const worlds = fs.readFileSync("app/worlds/index.tsx", "utf8");
const checks = [];

function check(label, condition) {
  assert.ok(condition, label);
  checks.push(label);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createRaceModel(initial = []) {
  const cache = deferred();
  const network = deferred();
  const commits = [];
  let visible = initial;
  let generation = 1;
  let mounted = true;
  let usableNetworkCommitted = false;

  const networkTask = network.promise.then((rows) => {
    if (!mounted || generation !== 1 || rows.length === 0) return;
    usableNetworkCommitted = true;
    visible = rows;
    commits.push(`network:${rows.join(",")}`);
  });
  const cacheTask = cache.promise.then((rows) => {
    if (!mounted || generation !== 1 || usableNetworkCommitted || rows.length === 0) return;
    visible = rows;
    commits.push(`cache:${rows.join(",")}`);
  });

  return {
    cache,
    network,
    commits,
    visible: () => visible,
    invalidate() {
      generation += 1;
    },
    unmount() {
      mounted = false;
    },
    settle: () => Promise.allSettled([cacheTask, networkTask]),
  };
}

{
  const race = createRaceModel();
  race.cache.resolve(["cached"]);
  await Promise.resolve();
  assert.deepEqual(race.visible(), ["cached"]);
  race.network.resolve(["fresh"]);
  await race.settle();
  assert.deepEqual(race.visible(), ["fresh"]);
  assert.deepEqual(race.commits, ["cache:cached", "network:fresh"]);
  checks.push("cache-first paints early and fresh network replaces it");
}

{
  const race = createRaceModel();
  race.network.resolve(["fresh"]);
  await Promise.resolve();
  race.cache.resolve(["cached"]);
  await race.settle();
  assert.deepEqual(race.visible(), ["fresh"]);
  assert.deepEqual(race.commits, ["network:fresh"]);
  checks.push("network-first suppresses a late cache commit");
}

{
  const race = createRaceModel(["visible"]);
  race.network.resolve([]);
  race.cache.resolve([]);
  await race.settle();
  assert.deepEqual(race.visible(), ["visible"]);
  assert.deepEqual(race.commits, []);
  checks.push("empty results preserve already-visible data");
}

{
  const race = createRaceModel();
  race.network.reject(new Error("offline"));
  race.cache.resolve(["cached"]);
  await race.settle();
  assert.deepEqual(race.visible(), ["cached"]);
  checks.push("network failure cannot block a usable cache");
}

{
  const race = createRaceModel(["visible"]);
  race.invalidate();
  race.cache.resolve(["stale-cache"]);
  race.network.resolve(["stale-network"]);
  await race.settle();
  assert.deepEqual(race.visible(), ["visible"]);
  assert.deepEqual(race.commits, []);
  checks.push("superseded generation cannot commit");
}

{
  const race = createRaceModel(["visible"]);
  race.unmount();
  race.cache.resolve(["late-cache"]);
  race.network.resolve(["late-network"]);
  await race.settle();
  assert.deepEqual(race.visible(), ["visible"]);
  assert.deepEqual(race.commits, []);
  checks.push("unmounted work cannot commit");
}

check(
  "non-force disk hydration and bounded refresh start as sibling tasks",
  worlds.indexOf("const networkTask = (async () =>") >= 0 &&
    worlds.indexOf("const hydrationTask = forceRefresh") >
      worlds.indexOf("const networkTask = (async () =>") &&
    worlds.includes("Promise.allSettled([hydrationTask, networkTask])")
);

check(
  "normal entry forces one authoritative bounded page refresh",
  worlds.includes("fetchHiddenTunesDiscoveryCatalog({ forceRefresh: true })") &&
    (worlds.match(/fetchHiddenTunesDiscoveryCatalog\(\{ forceRefresh: true \}\)/g) || []).length === 1 &&
    (worlds.match(/hydrateCachedHiddenTunesCatalog\(\)/g) || []).length === 1 &&
    worlds.indexOf("if (boundedCached?.songs.length) applyCatalog(boundedCached);") <
      worlds.indexOf("fetchHiddenTunesDiscoveryCatalog({ forceRefresh: true })") &&
    worlds.indexOf("fetchHiddenTunesDiscoveryCatalog({ forceRefresh: true })") <
      worlds.indexOf("const hydrated = await hydrateCachedHiddenTunesCatalog();")
);

check(
  "trusted disk data no longer ends the refresh path",
  !worlds.includes("isDerivedCatalogTrusted") &&
    !/if \(hydrated[\s\S]{0,100}return;/.test(worlds)
);

check(
  "usable network data wins and guards late hydration",
  worlds.includes("let usableNetworkCommitted = false;") &&
    worlds.includes("usableNetworkCommitted = true;") &&
    /!mountedRef\.current\s*\|\|\s*usableNetworkCommitted/.test(worlds)
);

check(
  "empty refresh cannot blank visible catalog state",
  worlds.includes("if (!boundedNetwork?.songs.length) return;") &&
    !worlds.includes("setCatalog(EMPTY_CATALOG)") &&
    !worlds.includes("setMoodRooms([])")
);

check(
  "force refresh bypasses disk and can supersede a normal in-flight load",
  worlds.includes("const hydrationTask = forceRefresh\n        ? Promise.resolve()") &&
    worlds.includes("(!forceRefresh || loadInFlightForceRef.current)") &&
    worlds.includes("loadInFlightForceRef.current = forceRefresh;")
);

check(
  "identical concurrent loads retain existing in-flight dedupe",
  worlds.includes("return loadInFlightRef.current;") &&
    worlds.includes("loadInFlightRef.current = run;")
);

check(
  "every async catalog commit is mounted and generation guarded",
  (worlds.match(/generation !== loadGenerationRef\.current/g) || []).length >= 3 &&
    (worlds.match(/!mountedRef\.current/g) || []).length >= 3
);

check(
  "superseded finalizer cannot alter loading or clear the active run",
  worlds.includes("const ownsCurrentRun = loadInFlightRef.current === run;") &&
    worlds.includes("generation === loadGenerationRef.current") &&
    worlds.includes("if (ownsCurrentRun) {")
);

check(
  "preference hydration and request dedupe remain intact without polling",
    worlds.includes("const preferencesTask = hydrateDiscoveryPreferredGenres()") &&
    worlds.includes("Promise.allSettled([preferencesTask, catalogTask])") &&
    (worlds.match(/setTimeout\(/g) || []).length === 2 &&
    !worlds.includes("setInterval(")
);

check(
  "playback ownership and navigation remain outside the load coordinator",
  !worlds.slice(
    worlds.indexOf("const loadExplore = useCallback"),
    worlds.indexOf("useEffect(() =>", worlds.indexOf("const loadExplore = useCallback"))
  ).includes("playSong(")
);

console.log(`Worlds catalog race contract: ${checks.length}/${checks.length} PASS`);
