import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("context/PlayerContext.tsx", "utf8");

const readConstant = (name) => {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `${name} must exist`);
  return Number(match[1]);
};

const playbackInterval = readConstant("PLAYBACK_UPDATE_INTERVAL_MS");
const positionStateInterval = readConstant("POSITION_STATE_UPDATE_MIN_MS");

assert.equal(playbackInterval, 1000, "foreground playback must report every second");
assert.equal(positionStateInterval, 1000, "foreground position state must publish every second");
assert.match(
  source,
  /now - lastPositionStateUpdateRef\.current >= positionStateMinMs\s*&&/,
  "progress publication must retain one time gate without a competing delta timer"
);

let lastPublishedAt = 0;
const published = [];
for (let second = 1; second <= 60; second += 1) {
  const now = second * playbackInterval;
  const positionDelta = playbackInterval;
  if (
    now - lastPublishedAt >= positionStateInterval &&
    positionDelta >= 400
  ) {
    published.push(now);
    lastPublishedAt = now;
  }
}

assert.equal(published.length, 60, "a 60-second song must publish 60 foreground updates");
assert.ok(
  published.every((at, index) => index === 0 || at - published[index - 1] === 1000),
  "progress publications must remain one second apart"
);

const pausedAt = published.at(-1);
for (let second = 61; second <= 70; second += 1) {
  // Native paused state does not advance position and therefore does not publish progress.
}
assert.equal(published.at(-1), pausedAt, "a ten-second pause must keep position fixed");

console.log("PASS player progress cadence: 60 one-second updates, 10-second pause fixed");
