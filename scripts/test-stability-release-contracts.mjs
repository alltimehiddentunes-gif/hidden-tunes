import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const layout = read("app/_layout.tsx");
const mini = read("components/MiniPlayer.tsx");
const scopedLock = read("utils/scopedActionLock.ts");
const player = read("context/PlayerContext.tsx");
const lyrics = read("app/lyrics.tsx");
const video = read("app/youtube-player.tsx");
const shell = read("components/navigation/AppShell.tsx");
const boundary = read("components/AppScreenErrorBoundary.tsx");
const fullPlayer = read("app/player.tsx");

assert.match(mini, /navigationLockRef\.current\.tryAcquire\(key\)/);
assert.match(scopedLock, /if \(active\) return false/);
assert.match(scopedLock, /dispose: release/);
assert.match(mini, /runQueueAction\("next", nextSong\)/);
assert.match(mini, /runQueueAction\("previous", previousSong\)/);
assert.match(mini, /runMiniPlayerAction\("play_pause", togglePlayPause\)/);
assert.match(shell, /if \(item\.active\) return/);
assert.match(shell, /createKeyedTapGuard\(360\)/);

assert.match(player, /queueTransitionTailRef\.current/);
assert.match(player, /loadRequestIdRef\.current !== requestId/);
assert.match(player, /manualQueueCommandGenerationRef\.current \+= 1/);
assert.match(player, /isMountedRef\.current/);

assert.match(video, /autoNextTimerRef\.current = setTimeout/);
assert.match(video, /autoNextUnlockTimerRef\.current = setTimeout/);
assert.match(video, /if \(!screenMountedRef\.current\) return/);
assert.match(video, /clearTimeout\(autoNextTimerRef\.current\)/);
assert.match(video, /clearTimeout\(autoNextUnlockTimerRef\.current\)/);
assert.match(lyrics, /scrollAnimFrameRef\.current = requestAnimationFrame/);
assert.match(lyrics, /cancelAnimationFrame\(scrollAnimFrameRef\.current\)/);
assert.match(fullPlayer, /tryAcquire\("player_close"\)/);
assert.match(lyrics, /tryAcquire\("lyrics_close"\)/);

assert.match(layout, /<AppScreenErrorBoundary>/);
assert.match(boundary, /getDerivedStateFromError/);
assert.match(boundary, /router\.replace\("\/music-feed"/);
assert.doesNotMatch(boundary, /Sentry|Crashlytics|Bugsnag/);

console.log("Hidden Tunes stability release contracts passed.");
