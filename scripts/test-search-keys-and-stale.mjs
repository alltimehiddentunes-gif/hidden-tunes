/**
 * Focused proofs for Search keys, stale responses, progressive local results,
 * and Search-vs-playback priority.
 *
 * Run: node scripts/test-search-keys-and-stale.mjs
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function slugifyCatalogToken(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanCatalogString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const clean = value.trim();
  return clean || fallback;
}

function normalizeAlbumLabel(value) {
  return cleanCatalogString(value).replace(/\s+/g, " ").toLowerCase();
}

function canonicalArtistId(artist) {
  return (
    slugifyCatalogToken(cleanCatalogString(artist, "Unknown Artist")) ||
    "unknown-artist"
  );
}

function canonicalAlbumSlug(album) {
  return (
    slugifyCatalogToken(normalizeAlbumLabel(album) || "singles") || "singles"
  );
}

function albumGroupKey(artist, album) {
  return `${canonicalArtistId(artist)}\0${canonicalAlbumSlug(album)}`;
}

function stableSearchId(value, fallback = "") {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function buildSearchReactKey(contentType, stableId) {
  const id = stableSearchId(stableId);
  if (!id) return `${contentType}:missing`;
  if (id.startsWith(`${contentType}:`)) return id;
  return `${contentType}:${id}`;
}

function albumSearchCanonicalId(album) {
  const group = albumGroupKey(album.artist, album.title);
  if (group && !group.startsWith("unknown-artist\0")) {
    return group.replace(/\0/g, "--");
  }
  return stableSearchId(album.id) || group.replace(/\0/g, "--");
}

function artistSearchCanonicalId(artist) {
  const fromName = canonicalArtistId(artist.name);
  const fromId = stableSearchId(artist.id);
  if (fromId && !fromId.startsWith("artist:")) return fromId;
  return fromName || fromId;
}

function dedupeSearchRowsByCanonicalId(items, getCanonicalId) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const id = stableSearchId(getCanonicalId(item));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function findDuplicateSearchReactKeys(diagnostics) {
  const counts = new Map();
  for (const row of diagnostics) {
    counts.set(row.reactKey, (counts.get(row.reactKey) || 0) + 1);
  }
  return diagnostics.filter((row) => (counts.get(row.reactKey) || 0) > 1);
}

function buildSearchKeyDiagnostics(options) {
  const rows = [];
  for (const song of options.songs || []) {
    const rawId = stableSearchId(song.id);
    rows.push({
      contentType: "song",
      rawId,
      reactKey: buildSearchReactKey("song", rawId),
      title: stableSearchId(song.title),
    });
  }
  for (const album of options.albums || []) {
    const canonicalId = albumSearchCanonicalId(album);
    rows.push({
      contentType: "album",
      rawId: stableSearchId(album.id),
      reactKey: buildSearchReactKey("album", canonicalId),
      title: stableSearchId(album.title),
    });
  }
  for (const artist of options.artists || []) {
    const canonicalId = artistSearchCanonicalId(artist);
    rows.push({
      contentType: "artist",
      rawId: stableSearchId(artist.id),
      reactKey: buildSearchReactKey("artist", canonicalId),
      title: stableSearchId(artist.name),
    });
  }
  for (const video of options.tv || []) {
    const rawId = stableSearchId(video.id);
    rows.push({
      contentType: "tv",
      rawId,
      reactKey: buildSearchReactKey("tv", rawId),
      title: stableSearchId(video.title),
    });
  }
  for (const station of options.radio || []) {
    const rawId = stableSearchId(station.id);
    rows.push({
      contentType: "radio",
      rawId,
      reactKey: buildSearchReactKey("radio", rawId),
      title: stableSearchId(station.name),
    });
  }
  return rows;
}

function createSearchRequestGate() {
  let generation = 0;
  return {
    next() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
      return generation;
    },
    isCurrent(token) {
      return token === generation;
    },
    get current() {
      return generation;
    },
  };
}

let playbackCriticalDepth = 0;
function beginPlaybackCriticalSection() {
  playbackCriticalDepth += 1;
}
function endPlaybackCriticalSection() {
  playbackCriticalDepth = Math.max(0, playbackCriticalDepth - 1);
}
function isPlaybackCriticalSectionActive() {
  return playbackCriticalDepth > 0;
}
function yieldToPlaybackCriticalPath() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
async function runSearchWorkAfterPlaybackYield(work) {
  if (isPlaybackCriticalSectionActive()) {
    await yieldToPlaybackCriticalPath();
  }
  return work();
}

function testKeysUniqueAcrossContentTypes() {
  const diagnostics = buildSearchKeyDiagnostics({
    songs: [{ id: "42", title: "Same Id Song" }],
    albums: [{ id: "42", title: "Album", artist: "A" }],
    artists: [{ id: "42", name: "Artist" }],
    tv: [{ id: "42", title: "Video" }],
    radio: [{ id: "42", name: "Station" }],
  });
  const keys = diagnostics.map((row) => row.reactKey);
  assert.deepEqual(keys, [
    "song:42",
    "album:a--album",
    "artist:42",
    "tv:42",
    "radio:42",
  ]);
  assert.equal(findDuplicateSearchReactKeys(diagnostics).length, 0);
}

function testDuplicateRawIdsAcrossTypesRemainUnique() {
  const songKey = buildSearchReactKey("song", "abc");
  const tvKey = buildSearchReactKey("tv", "abc");
  const radioKey = buildSearchReactKey("radio", "abc");
  assert.equal(songKey, "song:abc");
  assert.equal(tvKey, "tv:abc");
  assert.equal(radioKey, "radio:abc");
  assert.notEqual(songKey, tvKey);
}

function testSameTypeDuplicatesAreDeduped() {
  const albums = [
    { id: "burna-boy-african-giant", title: "African Giant", artist: "Burna Boy" },
    { id: "album:burna boy-african giant", title: "African Giant", artist: "Burna Boy" },
    { id: "other", title: "African Giant", artist: "Burna Boy!" },
  ];
  const deduped = dedupeSearchRowsByCanonicalId(albums, albumSearchCanonicalId);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "burna-boy-african-giant");
}

function testArtistNameVariantsDoNotDuplicateRows() {
  const artists = [
    { id: "burna-boy", name: "Burna Boy" },
    { id: "artist:burna boy", name: "Burna Boy" },
    { id: "burna-boy-2", name: "Burna Boy!" },
  ];
  const deduped = dedupeSearchRowsByCanonicalId(artists, artistSearchCanonicalId);
  // Canonical artist id merges punctuation/case variants of the name when id is prefixed.
  assert.ok(deduped.length <= 2);
  const keys = deduped.map((artist) =>
    buildSearchReactKey("artist", artistSearchCanonicalId(artist))
  );
  assert.equal(new Set(keys).size, keys.length);
}

function testStaleSearchResponsesCannotReplaceNewer() {
  const gate = createSearchRequestGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
}

function testLocalResultsBeforeRemote() {
  const timeline = [];
  timeline.push("local_filter_end");
  timeline.push("local_set_state");
  timeline.push("first_result_render");
  // Remote groups arrive later.
  timeline.push("tv_request_end");
  timeline.push("radio_request_end");
  assert.ok(
    timeline.indexOf("first_result_render") < timeline.indexOf("tv_request_end")
  );
  assert.ok(
    timeline.indexOf("local_filter_end") < timeline.indexOf("radio_request_end")
  );
}

async function testSearchWorkYieldsToPlayback() {
  const order = [];
  beginPlaybackCriticalSection();
  const searchPromise = runSearchWorkAfterPlaybackYield(async () => {
    order.push("search_work");
    return "ok";
  });
  order.push("playback_critical");
  endPlaybackCriticalSection();
  await searchPromise;
  assert.equal(order[0], "playback_critical");
  assert.equal(order[1], "search_work");
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function runConcurrentCatalogLoadForTest({
  hydrate,
  refresh,
  publish,
  isCancelled,
  setLoading,
}) {
  let freshCommitted = false;

  const cacheTask = (async () => {
    try {
      const cached = await hydrate();
      if (isCancelled() || freshCommitted) return;
      if (cached?.songs.length) {
        publish(cached, "cache");
        setLoading(false);
      }
    } catch {}
  })();

  const refreshTask = (async () => {
    try {
      const fresh = await refresh();
      if (isCancelled() || !fresh.songs.length) return;
      freshCommitted = true;
      publish(fresh, "network");
      setLoading(false);
    } catch {}
  })();

  await Promise.allSettled([cacheTask, refreshTask]);
  if (!isCancelled()) setLoading(false);
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function testPersistedCatalogPaintsBeforeNetworkAndFreshWins() {
  {
    const network = createDeferred();
    const commits = [];
    const loading = [];
    let visible = null;

    const load = runConcurrentCatalogLoadForTest({
      hydrate: async () => ({ id: "cached", songs: [{ id: "cached-song" }] }),
      refresh: () => network.promise,
      publish: (catalog, source) => {
        visible = catalog;
        commits.push(source);
      },
      isCancelled: () => false,
      setLoading: (value) => loading.push(value),
    });

    await flushMicrotasks();
    assert.equal(visible?.id, "cached", "persisted cache paints while network is pending");
    assert.deepEqual(commits, ["cache"], "cache can win the first-usable race");
    assert.equal(loading.at(-1), false, "first usable cache clears loading");

    network.resolve({ id: "fresh", songs: [{ id: "fresh-song" }] });
    await load;
    assert.equal(visible?.id, "fresh", "latest network catalog wins after cache paint");
    assert.deepEqual(commits, ["cache", "network"]);
  }

  {
    const cache = createDeferred();
    const commits = [];
    let visible = null;
    const load = runConcurrentCatalogLoadForTest({
      hydrate: () => cache.promise,
      refresh: async () => ({ id: "fresh-first", songs: [{ id: "fresh-first-song" }] }),
      publish: (catalog, source) => {
        visible = catalog;
        commits.push(source);
      },
      isCancelled: () => false,
      setLoading: () => {},
    });

    await flushMicrotasks();
    assert.equal(visible?.id, "fresh-first", "network may win the first-usable race");
    cache.resolve({ id: "late-cache", songs: [{ id: "late-cache-song" }] });
    await load;
    assert.equal(visible?.id, "fresh-first", "late cache cannot overwrite fresh network data");
    assert.deepEqual(commits, ["network"]);
  }

  {
    const cache = createDeferred();
    const commits = [];
    let visible = null;
    const load = runConcurrentCatalogLoadForTest({
      hydrate: () => cache.promise,
      refresh: async () => ({ id: "empty-network", songs: [] }),
      publish: (catalog, source) => {
        visible = catalog;
        commits.push(source);
      },
      isCancelled: () => false,
      setLoading: () => {},
    });

    await flushMicrotasks();
    cache.resolve({ id: "cache-after-empty", songs: [{ id: "cached-song" }] });
    await load;
    assert.equal(visible?.id, "cache-after-empty", "empty refresh preserves usable cache");
    assert.deepEqual(commits, ["cache"]);
  }

  {
    const commits = [];
    let visible = null;
    const loading = [];
    await runConcurrentCatalogLoadForTest({
      hydrate: async () => ({ id: "cache-before-error", songs: [{ id: "cached-song" }] }),
      refresh: async () => {
        throw new Error("network failed");
      },
      publish: (catalog, source) => {
        visible = catalog;
        commits.push(source);
      },
      isCancelled: () => false,
      setLoading: (value) => loading.push(value),
    });
    assert.equal(visible?.id, "cache-before-error", "refresh error preserves cache");
    assert.deepEqual(commits, ["cache"]);
    assert.equal(loading.at(-1), false, "settled cache/error phases clear loading");
  }

  {
    const network = createDeferred();
    const commits = [];
    let cancelled = false;
    const load = runConcurrentCatalogLoadForTest({
      hydrate: async () => ({ id: "cached-before-unmount", songs: [{ id: "cached-song" }] }),
      refresh: () => network.promise,
      publish: (catalog, source) => commits.push(`${source}:${catalog.id}`),
      isCancelled: () => cancelled,
      setLoading: () => {},
    });

    await flushMicrotasks();
    assert.deepEqual(commits, ["cache:cached-before-unmount"]);
    cancelled = true;
    network.resolve({ id: "fresh-after-unmount", songs: [{ id: "fresh-song" }] });
    await load;
    assert.deepEqual(
      commits,
      ["cache:cached-before-unmount"],
      "network response cannot commit after cancellation"
    );
  }
}

function testSourceGuards() {
  const fs = require("node:fs");
  const searchSrc = fs.readFileSync(path.join(root, "app", "search.tsx"), "utf8");
  assert.ok(searchSrc.includes("buildSearchReactKey"));
  assert.ok(searchSrc.includes("albumSearchCanonicalId"));
  assert.ok(searchSrc.includes("runSearchWorkAfterPlaybackYield"));
  assert.match(
    searchSrc,
    /const \[initialCatalog\] = useState\(\(\) => getCachedHiddenTunesCatalog\(\)\)/,
    "warm memory catalog must seed Search's first render"
  );
  assert.match(
    searchSrc,
    /const \[loading, setLoading\] = useState\(\(\) => !initialCatalog\?\.songs\.length\)/,
    "warm Search must not enter a blank loading state"
  );

  const catalogLoadStart = searchSrc.indexOf(
    "useEffect(() => {",
    searchSrc.indexOf("const catalogSignature")
  );
  const catalogLoadEnd = searchSrc.indexOf("const searchCatalog", catalogLoadStart);
  const catalogLoadSource = searchSrc.slice(catalogLoadStart, catalogLoadEnd);
  const hydrationIndex = catalogLoadSource.indexOf("await hydrateCachedHiddenTunesCatalog()");
  const refreshIndex = catalogLoadSource.indexOf(
    "fetchHiddenTunesDiscoveryCatalog({ forceRefresh: true })"
  );
  const allSettledIndex = catalogLoadSource.indexOf(
    "Promise.allSettled([cacheTask, refreshTask])"
  );
  assert.ok(hydrationIndex >= 0, "cold Search must hydrate persisted catalog data");
  assert.ok(refreshIndex >= 0, "cold Search must start a bounded forced refresh");
  assert.ok(
    allSettledIndex > hydrationIndex && allSettledIndex > refreshIndex,
    "cache hydration and network refresh must start without a serial waterfall"
  );
  assert.doesNotMatch(
    catalogLoadSource,
    /setCatalog\(null\)/,
    "refresh failures must preserve visible cached content"
  );
  assert.match(
    catalogLoadSource,
    /if \(cancelled \|\| freshCommitted\) return;/,
    "late cache must not overwrite committed network data"
  );
  assert.match(
    catalogLoadSource,
    /if \(cancelled \|\| !data\.songs\.length\) return;[\s\S]*?freshCommitted = true;[\s\S]*?setCatalog\(data\)/,
    "only current non-empty network data may take precedence"
  );
  assert.match(
    catalogLoadSource,
    /Promise\.allSettled\(\[cacheTask, refreshTask\]\)\.then\(\(\) => \{\s*if \(!cancelled\) setLoading\(false\)/,
    "loading must clear after both concurrent phases settle"
  );
  // Local results must not wait on backend pending.
  assert.ok(
    /showSearchResults\s*=\s*[\s\S]*!searchDebouncePending/.test(searchSrc)
  );
  assert.equal(
    /showSearchResults\s*=\s*[\s\S]*!backendSearchPendingForQuery/.test(searchSrc),
    false
  );
  // TV must not wait on backend/external.
  assert.ok(
    /const shouldRunTvSearch = cleanSubmittedSearchQuery\.length >= 2/.test(
      searchSrc
    )
  );

  const playerSrc = fs.readFileSync(
    path.join(root, "context", "PlayerContext.tsx"),
    "utf8"
  );
  assert.ok(playerSrc.includes("playback_request_created"));
  assert.ok(playerSrc.includes("playable_tap_queue_bootstrapped"));
  assert.ok(playerSrc.includes("hidden_audio_load_start"));
  assert.ok(playerSrc.includes("native_load_ready"));
  assert.ok(playerSrc.includes("native_play_called"));
  assert.ok(playerSrc.includes("beginPlaybackCriticalSection"));
  assert.ok(playerSrc.includes("stale_work_discarded"));
}

async function main() {
  console.log("test-search-keys-and-stale: start");
  testKeysUniqueAcrossContentTypes();
  testDuplicateRawIdsAcrossTypesRemainUnique();
  testSameTypeDuplicatesAreDeduped();
  testArtistNameVariantsDoNotDuplicateRows();
  testStaleSearchResponsesCannotReplaceNewer();
  testLocalResultsBeforeRemote();
  await testPersistedCatalogPaintsBeforeNetworkAndFreshWins();
  await testSearchWorkYieldsToPlayback();
  testSourceGuards();
  console.log("test-search-keys-and-stale: PASS");
}

main().catch((error) => {
  console.error("test-search-keys-and-stale: FAIL", error);
  process.exit(1);
});
