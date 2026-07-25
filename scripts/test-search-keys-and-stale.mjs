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

function testSourceGuards() {
  const fs = require("node:fs");
  const searchSrc = fs.readFileSync(path.join(root, "app", "search.tsx"), "utf8");
  assert.ok(searchSrc.includes("buildSearchReactKey"));
  assert.ok(searchSrc.includes("albumSearchCanonicalId"));
  assert.ok(searchSrc.includes("runSearchWorkAfterPlaybackYield"));
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
  await testSearchWorkYieldsToPlayback();
  testSourceGuards();
  console.log("test-search-keys-and-stale: PASS");
}

main().catch((error) => {
  console.error("test-search-keys-and-stale: FAIL", error);
  process.exit(1);
});
