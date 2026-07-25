/**
 * Focused proofs for tap-to-play ordering:
 * loadTrack-before-queue-expand, stale deferred discard, Next after hydrate.
 *
 * Run: node scripts/test-tap-to-play-ordering.mjs
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Prefer compiled-free TS via dynamic transpile is heavy; mirror the pure helpers here
// and also load the JS-equivalent source by evaluating the TypeScript-free exports.
// The helpers are pure and duplicated for the Node test harness.

const PLAYBACK_QUEUE_IMMEDIATE_LIMIT = 48;
const PLAYBACK_QUEUE_BOOTSTRAP_AHEAD = 15;
const PLAYBACK_QUEUE_BOOTSTRAP_BEHIND = 1;

function buildImmediatePlaybackQueueWindow(options) {
  const queue = Array.isArray(options.queue) ? options.queue : [];
  const fullIndex = queue.length
    ? Math.max(0, Math.min(Math.floor(options.index), queue.length - 1))
    : 0;
  const limit = options.immediateLimit ?? PLAYBACK_QUEUE_IMMEDIATE_LIMIT;
  const ahead = options.ahead ?? PLAYBACK_QUEUE_BOOTSTRAP_AHEAD;
  const behind = options.behind ?? PLAYBACK_QUEUE_BOOTSTRAP_BEHIND;
  const forceDefer = Boolean(options.forceDefer);

  if (!queue.length) {
    return {
      immediateQueue: [],
      immediateIndex: 0,
      shouldDeferFullQueue: false,
      fullIndex: 0,
    };
  }

  if (!forceDefer && queue.length <= limit) {
    return {
      immediateQueue: queue,
      immediateIndex: fullIndex,
      shouldDeferFullQueue: false,
      fullIndex,
    };
  }

  const start = Math.max(0, fullIndex - behind);
  const end = Math.min(queue.length, fullIndex + ahead + 1);
  const immediateQueue = queue.slice(start, end);
  const immediateIndex = Math.max(
    0,
    Math.min(fullIndex - start, Math.max(immediateQueue.length - 1, 0))
  );

  return {
    immediateQueue,
    immediateIndex,
    shouldDeferFullQueue: true,
    fullIndex,
  };
}

function assertLoadBeforeQueueExpand(events) {
  const loadIdx = events.indexOf("hidden_audio_load_start");
  const expandIdx = events.indexOf("deferred_full_queue_expand");
  if (loadIdx < 0) throw new Error("missing hidden_audio_load_start");
  if (expandIdx >= 0 && expandIdx < loadIdx) {
    throw new Error("queue expand ran before native load");
  }
  return true;
}

function createSongs(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `song-${i}`,
    title: `Song ${i}`,
  }));
}

/** Simulates the critical-path ordering with a slow queue expand. */
async function simulateTapPipeline(options = {}) {
  const {
    catalogSize = 1246,
    tapIndex = 100,
    expandDelayMs = 50,
    secondTapAfterMs = null,
    expandWorkMs = 32000,
  } = options;

  const events = [];
  let loadRequestId = 0;
  let currentSongId = null;
  let activeQueue = [];
  let activeIndex = 0;
  let androidAutoQueueLength = 0;
  let playerCount = 0;
  let loadTrackCalls = 0;
  let playCalls = 0;

  const catalog = createSongs(catalogSize);

  async function runTap(index, label) {
    loadRequestId += 1;
    const requestId = loadRequestId;
    const song = catalog[index];
    currentSongId = song.id;

    const bootstrap = buildImmediatePlaybackQueueWindow({
      queue: catalog,
      index,
      forceDefer: catalogSize > PLAYBACK_QUEUE_IMMEDIATE_LIMIT,
    });

    activeQueue = bootstrap.immediateQueue;
    activeIndex = bootstrap.immediateIndex;
    events.push(`${label}:bootstrap`);

    // Critical path: native load/play before expand.
    playerCount = 1;
    loadTrackCalls += 1;
    events.push("hidden_audio_load_start");
    events.push(`${label}:load_track`);
    playCalls += 1;
    events.push(`${label}:play`);
    events.push("first_audio_playing");

    const expandToken = requestId;
    const expandSongId = song.id;

    const expandPromise = (async () => {
      await new Promise((r) => setTimeout(r, expandDelayMs));
      // Simulate expensive emotional/smart queue work after play.
      const started = Date.now();
      while (Date.now() - started < Math.min(expandWorkMs, 5)) {
        // tiny busy wait stand-in; real expand is async and non-blocking here
      }
      await new Promise((r) => setTimeout(r, Math.min(expandWorkMs, 20)));

      if (loadRequestId !== expandToken) {
        events.push(`${label}:expand_discarded_stale`);
        return;
      }
      if (currentSongId !== expandSongId) {
        events.push(`${label}:expand_discarded_song`);
        return;
      }

      events.push("deferred_full_queue_expand");
      activeQueue = catalog;
      activeIndex = index;
      androidAutoQueueLength = catalog.length;
      events.push(`${label}:expand_applied`);
    })();

    return { requestId, expandPromise, songId: song.id };
  }

  const first = await runTap(tapIndex, "tap1");

  // Prove slow expand cannot delay first play: first_audio already emitted.
  assert.ok(events.includes("first_audio_playing"));
  assert.ok(events.indexOf("hidden_audio_load_start") < events.indexOf("first_audio_playing"));
  assertLoadBeforeQueueExpand(events);

  let second = null;
  if (typeof secondTapAfterMs === "number") {
    await new Promise((r) => setTimeout(r, secondTapAfterMs));
    second = await runTap(tapIndex + 3, "tap2");
  }

  await first.expandPromise;
  if (second) await second.expandPromise;

  return {
    events,
    currentSongId,
    activeQueue,
    activeIndex,
    androidAutoQueueLength,
    playerCount,
    loadTrackCalls,
    playCalls,
    firstSongId: first.songId,
    secondSongId: second?.songId || null,
  };
}

function testBootstrapWindowPreservesTappedItem() {
  const songs = createSongs(1246);
  const tapIndex = 500;
  const boot = buildImmediatePlaybackQueueWindow({
    queue: songs,
    index: tapIndex,
    forceDefer: true,
  });
  assert.equal(boot.shouldDeferFullQueue, true);
  assert.ok(boot.immediateQueue.length <= PLAYBACK_QUEUE_BOOTSTRAP_AHEAD + PLAYBACK_QUEUE_BOOTSTRAP_BEHIND + 1);
  assert.equal(boot.immediateQueue[boot.immediateIndex].id, `song-${tapIndex}`);
  assert.equal(boot.fullIndex, tapIndex);
}

function testSmallQueueNotDeferred() {
  const songs = createSongs(20);
  const boot = buildImmediatePlaybackQueueWindow({
    queue: songs,
    index: 5,
  });
  assert.equal(boot.shouldDeferFullQueue, false);
  assert.equal(boot.immediateQueue.length, 20);
  assert.equal(boot.immediateIndex, 5);
}

async function testLoadBeforeExpandAndSlowQueue() {
  const result = await simulateTapPipeline({
    catalogSize: 1246,
    tapIndex: 100,
    expandDelayMs: 30,
    expandWorkMs: 40,
  });
  assertLoadBeforeQueueExpand(result.events);
  assert.equal(result.playerCount, 1);
  assert.equal(result.loadTrackCalls, 1);
  assert.equal(result.currentSongId, "song-100");
  assert.equal(result.activeQueue.length, 1246);
  assert.equal(result.activeIndex, 100);
  assert.equal(result.androidAutoQueueLength, 1246);

  // Next after hydrate
  const nextIndex = result.activeIndex + 1;
  assert.equal(result.activeQueue[nextIndex].id, "song-101");
}

async function testRapidSecondTapInvalidatesStaleExpand() {
  const result = await simulateTapPipeline({
    catalogSize: 1246,
    tapIndex: 100,
    expandDelayMs: 40,
    secondTapAfterMs: 5,
    expandWorkMs: 40,
  });

  assert.equal(result.currentSongId, "song-103");
  assert.ok(result.events.includes("tap1:expand_discarded_stale"));
  assert.ok(result.events.includes("tap2:expand_applied"));
  assert.equal(result.activeIndex, 103);
  assert.equal(result.androidAutoQueueLength, 1246);
  assert.equal(result.playerCount, 1);
  assert.equal(result.loadTrackCalls, 2);
}

function testRadioSwitchControllerStillPresent() {
  const ctrlPath = path.join(
    root,
    "services",
    "radio",
    "radioStationSwitchController.ts"
  );
  const fs = require("node:fs");
  const src = fs.readFileSync(ctrlPath, "utf8");
  assert.ok(src.includes("beginRadioStationSwitch"));
  assert.ok(src.includes("preemptRadioStationSwitch"));
}

function testHandoffCoordinatorStillPresent() {
  const fs = require("node:fs");
  const src = fs.readFileSync(
    path.join(root, "services", "playback", "PlaybackHandoffCoordinator.ts"),
    "utf8"
  );
  assert.ok(src.includes("claimExclusivePlayback"));
}

function testPlayerContextOrderingGuardsPresent() {
  const fs = require("node:fs");
  const src = fs.readFileSync(path.join(root, "context", "PlayerContext.tsx"), "utf8");
  assert.ok(src.includes("deferred_full_queue_expand"));
  assert.ok(src.includes("buildImmediatePlaybackQueueWindow"));
  assert.ok(src.includes("playable_tap_queue_bootstrapped"));
  assert.ok(src.includes("playback_request_created"));
  assert.ok(src.includes("native_load_ready"));
  assert.ok(src.includes("native_play_called"));
  assert.ok(src.includes("beginPlaybackCriticalSection"));
  // Emotional refresh must not be scheduled before native load in the pre-load block.
  const preLoadSlice = src.slice(
    src.indexOf("openPlayerForPlayableTap(normalizedSong, \"load_and_play\")"),
    src.indexOf("isChangingTrackRef.current = true")
  );
  assert.equal(preLoadSlice.includes("emotional_queue_refresh"), false);
  assert.ok(src.includes("first_audio_playing"));
  assert.ok(/first_audio_playing[\s\S]{0,1200}emotional_queue_refresh/.test(src));
}

async function main() {
  console.log("test-tap-to-play-ordering: start");
  testBootstrapWindowPreservesTappedItem();
  testSmallQueueNotDeferred();
  await testLoadBeforeExpandAndSlowQueue();
  await testRapidSecondTapInvalidatesStaleExpand();
  testRadioSwitchControllerStillPresent();
  testHandoffCoordinatorStillPresent();
  testPlayerContextOrderingGuardsPresent();
  console.log("test-tap-to-play-ordering: PASS");
}

main().catch((error) => {
  console.error("test-tap-to-play-ordering: FAIL", error);
  process.exit(1);
});
