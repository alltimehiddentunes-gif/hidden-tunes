import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canCommitLyricsResult,
  findActiveLyricIndex,
  getLyricsSyncOffset,
  parseLrc,
  resolveLyricsDisplay,
} from "../utils/lyrics";

function request(activeSongId: string, requestedSongId: string, requestGeneration: number, latestGeneration: number) {
  return canCommitLyricsResult({
    activeSongId,
    requestedSongId,
    requestGeneration,
    latestGeneration,
  });
}

assert.equal(request("B", "A", 1, 2), false, "A must not commit after B becomes active");
assert.equal(request("C", "B", 2, 3), false, "B must not commit after rapid A-B-C");
assert.equal(request("C", "C", 2, 3), false, "an older C generation must not commit");
assert.equal(request("C", "C", 3, 3), true, "only the latest active song request may commit");

const lines = parseLrc([
  "[offset:+100]",
  "[00:01.25]first",
  "[00:02.500]second",
  "[00:02.500]duplicate",
  "[00:04.005]last",
].join("\n"));

assert.deepEqual(lines.map((line) => line.timeMs), [1350, 2600, 2600, 4105]);
assert.equal(findActiveLyricIndex(lines, 0), -1, "instrumental pre-roll has no active line");
assert.equal(findActiveLyricIndex(lines, 1349), -1);
assert.equal(findActiveLyricIndex(lines, 1350), 0);
assert.equal(findActiveLyricIndex(lines, 2599), 0);
assert.equal(findActiveLyricIndex(lines, 2600), 2, "latest duplicate timestamp wins deterministically");
assert.equal(findActiveLyricIndex(lines, 4105), 3);
assert.equal(findActiveLyricIndex(lines, 60_000), 3);

assert.equal(getLyricsSyncOffset("synced"), 0, "the client must not apply an unproven timing correction");
assert.equal(resolveLyricsDisplay("", "plain line").mode, "plain");
assert.equal(resolveLyricsDisplay("", "plain line").hasSyncedLyrics, false);

const lyricsScreen = fs.readFileSync(
  path.resolve(process.cwd(), "app/lyrics.tsx"),
  "utf8"
);
assert.match(
  lyricsScreen,
  /const songId = activeSongId \|\| routeSongId/,
  "authoritative active song must outrank immutable route params"
);
assert.match(lyricsScreen, /lyricsSongId === songId/);
assert.match(lyricsScreen, /canCommitLyricsResult\(\{/);
assert.match(lyricsScreen, /<LyricsPlaybackObserver onPosition=/);
assert.match(lyricsScreen, /const LYRICS_PRECISION_INTERVAL_MS = 250/);
assert.match(lyricsScreen, /const LyricsPrecisionObserver = memo/);
assert.match(lyricsScreen, /useFocusEffect\(/);
assert.match(lyricsScreen, /await bridgeGetProgress\(\)/);
assert.match(lyricsScreen, /enabled=\{hasTimedLyrics && isPlaying && !isLoading\}/);
assert.match(lyricsScreen, /foreground = nextState === "active"/);
assert.match(lyricsScreen, /cancelled = true;[\s\S]*clearTimer\(\);[\s\S]*appStateSubscription\.remove\(\)/);
assert.match(lyricsScreen, /precisionHoldUntilRef\.current = Date\.now\(\) \+ 1000/);
assert.match(lyricsScreen, /handlePlaybackPosition\(targetMs\)/);
assert.doesNotMatch(
  lyricsScreen,
  /export default function LyricsScreen\(\)[\s\S]*?const \{ positionMillis, durationMillis \} = usePlayerProgress\(\)/,
  "the full lyrics screen must not subscribe to every position update"
);
assert.doesNotMatch(lyricsScreen, /setInterval\(/);
assert.equal(
  (lyricsScreen.match(/requestAnimationFrame\(/g) || []).length,
  2,
  "only the two bounded one-shot scroll schedules are allowed"
);

function measureLag(transitions: number[], cadenceMs: number) {
  const lags = transitions.map(
    (timestamp) => Math.ceil(timestamp / cadenceMs) * cadenceMs - timestamp
  );
  return {
    worstMs: Math.max(...lags),
    averageMs: lags.reduce((sum, lag) => sum + lag, 0) / lags.length,
  };
}

const controlledTransitions = [125, 510, 880, 1_005, 1_240, 1_501, 1_875, 2_010];
const oneSecond = measureLag(controlledTransitions, 1_000);
const precision = measureLag(controlledTransitions, 250);
assert.deepEqual(oneSecond, { worstMs: 995, averageMs: 606.75 });
assert.deepEqual(precision, { worstMs: 249, averageMs: 169.25 });
assert.ok(precision.worstMs <= 250);

console.log("test-lyrics-identity-and-sync: PASS");
