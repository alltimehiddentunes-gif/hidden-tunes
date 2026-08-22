import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveMiniPlayerDestination } from "../utils/miniPlayerNavigation";
import type { AppSong, PlaybackQueueContext } from "../context/PlayerContext";

const baseContext: PlaybackQueueContext = { source: "unknown" };
const artistId = "11111111-1111-4111-8111-111111111111";
const albumId = "22222222-2222-4222-8222-222222222222";
const resolve = (song: Partial<AppSong>, context = baseContext) =>
  resolveMiniPlayerDestination(song as AppSong, context, {
    isYoutubeMode: false,
    isLiveRadioMode: false,
  });

assert.deepEqual(resolve({ artistId, albumId }), {
  pathname: "/artist/[id]", params: { id: artistId },
});
assert.deepEqual(resolve({ artistId: "Hidden Tunes", albumId }), {
  pathname: "/album/[id]", params: { id: albumId },
});
assert.deepEqual(resolve({ contentType: "podcast", showId: "show-7" }), {
  pathname: "/podcasts/show/[id]", params: { id: "show-7" },
});
assert.deepEqual(resolve({ contentType: "audiobook", albumId: "book-7" }), {
  pathname: "/audiobooks/[id]", params: { id: "book-7" },
});
assert.deepEqual(resolve({ albumId: "program-7" }, { source: "motivation", contextId: "program-7" }), {
  pathname: "/motivation/program/[id]", params: { id: "program-7" },
});
assert.deepEqual(resolve({ contentType: "lecture", albumId: "lecture-7" }), {
  pathname: "/lectures/[id]", params: { id: "lecture-7" },
});
assert.deepEqual(resolve({}, { source: "radio" }), { pathname: "/stations" });
assert.equal(resolve({ genre: "Gospel" }).pathname, "/genre");
assert.deepEqual(resolve({ artistId: "display name", albumId: "Singles" }), { pathname: "/music-feed" });
assert.deepEqual(resolveMiniPlayerDestination(null, baseContext, { isYoutubeMode: true, isLiveRadioMode: false }), { pathname: "/youtube-feed" });

const source = readFileSync(new URL("../components/MiniPlayer.tsx", import.meta.url), "utf8");
const scopedLockSource = readFileSync(new URL("../utils/scopedActionLock.ts", import.meta.url), "utf8");
assert.match(source, /accessibilityLabel="Open full player"[\s\S]*?onPress=\{handleOpenPlayer\}/);
assert.match(source, /accessibilityLabel=\{`Open details for \$\{title\}`\}[\s\S]*?onPress=\{handleOpenMetadata\}/);
assert.doesNotMatch(source, /<AnimatedPressable[\s\S]{0,180}onPress=\{handleOpenPlayer\}[\s\S]{0,500}<MiniPlayerMetadata/);
assert.match(source, /navigationLockRef\.current\.tryAcquire\(key\)/);
assert.match(scopedLockSource, /if \(active\) return false/);
assert.match(source, /const metadataDestination = useMemo/);
assert.doesNotMatch(source, /\[pathname,/);
assert.match(source, /queueCommandTailRef\.current/);
assert.match(source, /runMiniPlayerAction\("play_pause", togglePlayPause\)/);

console.log("MiniPlayer navigation and reentrancy contract passed.");
