import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const player = read("context/PlayerContext.tsx");
const bridge = read("services/playbackBridge.ts");
const nativeBridge = read("src/hidden-audio/hiddenAudioBridge.ts");

const readConstant = (name) => {
  const match = player.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `${name} must exist`);
  return Number(match[1]);
};

const foregroundMs = readConstant("POSITION_STATE_UPDATE_MIN_MS");
const backgroundMs = readConstant("POSITION_STATE_UPDATE_BACKGROUND_MS");
const jitterMs = readConstant("POSITION_STATE_UPDATE_JITTER_TOLERANCE_MS");
const staleMs = readConstant("NATIVE_PROGRESS_EVENT_STALE_MS");
assert.equal(readConstant("PLAYBACK_UPDATE_INTERVAL_MS"), 1000);
assert.equal(readConstant("PODCAST_POSITION_STATE_UPDATE_MIN_MS"), 1000);
assert.equal(foregroundMs, 1000);
assert.equal(backgroundMs, 5000);
assert.equal(jitterMs, 100);
assert.equal(staleMs, 2500);
assert.match(player, /positionStateMinMs - POSITION_STATE_UPDATE_JITTER_TOLERANCE_MS/);
assert.match(player, /&&\s*Math\.abs\(progress\.positionMillis - previousPosition\) >= positionDeltaMinMs/);
assert.match(bridge, /Platform\.OS !== "android" && Platform\.OS !== "ios"/);
assert.match(nativeBridge, /if \(!Number\.isFinite\(positionSeconds\) \|\| positionSeconds < 0\) return null;/);
assert.match(nativeBridge, /if \(!Number\.isFinite\(durationSeconds\) \|\| durationSeconds < 0\) return null;/);
assert.match(player, /Date\.now\(\) - lastNativeProgressEventAtRef\.current <= NATIVE_PROGRESS_EVENT_STALE_MS/);
assert.match(player, /lastNativeProgressEventAtRef\.current = Date\.now\(\)/);
assert.match(player, /lastNativeProgressEventAtRef\.current = 0;\s*unsubscribe\(\)/);
assert.match(player, /progress\.isPlaying &&\s*now - lastPositionStateUpdateRef\.current/);
assert.match(nativeBridge, /throw new Error\("HiddenAudio returned malformed progress"\)/);
assert.match(read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"), /CMTime\(seconds: 1\.0/);
assert.match(read("plugins/hidden-audio/android/HiddenAudioCore.kt"), /PROGRESS_LOOP_INTERVAL_MS = 1000L/);
assert.match(read("components/MiniPlayer.tsx"), /usePlayerProgress\(\)/);
assert.match(read("app/player.tsx"), /usePlayerProgress\(\)/);

function simulate(events, { cadence = foregroundMs, initialPosition = 0 } = {}) {
  let lastAt = 0;
  let position = initialPosition;
  const published = [];
  for (const event of events) {
    if (!Number.isFinite(event.position) || event.position < 0) continue;
    const delta = Math.abs(event.position - position);
    position = event.position;
    if (event.playing && event.at - lastAt >= cadence - jitterMs && delta >= 400) {
      lastAt = event.at;
      published.push({ at: event.at, position: event.position });
    }
  }
  return published;
}

const seconds = Array.from({ length: 60 }, (_, index) => ({
  at: (index + 1) * 1000,
  position: (index + 1) * 1000,
  playing: true,
}));
const sixty = simulate(seconds);
assert.equal(sixty.length, 60);
assert.ok(sixty.every((entry, index) => index === 0 || entry.position > sixty[index - 1].position));
assert.ok(sixty.every((entry, index) => index === 0 || entry.at - sixty[index - 1].at <= 2000));

let at = 0;
const jitterEvents = Array.from({ length: 60 }, (_, index) => {
  at += index % 2 === 0 ? 950 : 1050;
  return { at, position: (index + 1) * 1000, playing: true };
});
const jittered = simulate(jitterEvents);
assert.equal(jittered.length, 60, "950-1050ms jitter must not reject alternating events");
assert.ok(jittered.every((entry, index) => index === 0 || entry.at - jittered[index - 1].at <= 1050));

const duplicates = seconds.flatMap((event) => [event, { ...event, at: event.at + 10 }]);
assert.equal(simulate(duplicates).length, 60, "duplicate native events must not republish");

const paused = simulate([
  ...seconds.slice(0, 3),
  ...Array.from({ length: 10 }, (_, index) => ({ at: 4000 + index * 1000, position: 3000, playing: false })),
  { at: 14000, position: 4000, playing: true },
]);
assert.deepEqual(paused.map((entry) => entry.position), [1000, 2000, 3000, 4000]);

const seekForward = simulate([{ at: 1000, position: 1000, playing: true }, { at: 2000, position: 31000, playing: true }]);
assert.deepEqual(seekForward.map((entry) => entry.position), [1000, 31000]);
const seekBackward = simulate([{ at: 1000, position: 30000, playing: true }, { at: 2000, position: 5000, playing: true }]);
assert.deepEqual(seekBackward.map((entry) => entry.position), [30000, 5000]);

const background = simulate(
  Array.from({ length: 20 }, (_, index) => ({ at: (index + 1) * 1000, position: (index + 1) * 1000, playing: true })),
  { cadence: backgroundMs }
);
assert.deepEqual(background.map((entry) => entry.at), [5000, 10000, 15000, 20000]);

const hour = simulate(Array.from({ length: 3600 }, (_, index) => ({
  at: (index + 1) * 1000,
  position: (index + 1) * 1000,
  playing: true,
})));
assert.equal(hour.length, 3600);
assert.equal(hour.at(-1).position, 3_600_000);

assert.equal(simulate([{ at: 1000, position: Number.NaN, playing: true }]).length, 0);
assert.equal(simulate([{ at: 1000, position: -1, playing: true }]).length, 0);

console.log("PASS player progress cadence: jitter, duplicates, pause/resume, seek, background, one-hour simulation");
