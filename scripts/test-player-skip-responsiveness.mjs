import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const player = read("context/PlayerContext.tsx");
const mini = read("components/MiniPlayer.tsx");
const full = read("app/player.tsx");
const remote = read("components/RemoteMediaControlsBridge.tsx");

// Both phone surfaces and remote/vehicle commands share PlayerContext authority.
assert.match(mini, /runQueueAction\("next", nextSong\)/);
assert.match(mini, /runQueueAction\("previous", previousSong\)/);
assert.match(mini, /queueCommandTailRef\.current/);
assert.match(full, /void nextSong\(\)/);
assert.match(full, /void previousSong\(\)/);
assert.match(remote, /await nextSongRef\.current\(\)/);
assert.match(remote, /await previousSongRef\.current\(\)/);

const nextStart = player.indexOf("const nextSong = useCallback");
const previousStart = player.indexOf("const previousSong = useCallback");
const nextBody = player.slice(nextStart, previousStart);
const previousBody = player.slice(previousStart, player.indexOf("const tryResumeHiddenAudioForSong"));
const queuedNextBody = nextBody.slice(nextBody.indexOf("const safeIndex ="));
const loadBody = player.slice(
  player.indexOf("const loadAndPlay = useCallback"),
  player.indexOf("const playQueueAtIndex = useCallback")
);

assert.ok(!nextBody.includes('queueControlTapGuardRef.current("next_song")'));
assert.ok(!previousBody.includes('queueControlTapGuardRef.current("previous_song")'));
assert.ok(queuedNextBody.indexOf("native_transition_called") < queuedNextBody.indexOf("persistActiveQueueDeferred"));
assert.ok(queuedNextBody.indexOf("native_transition_called") < queuedNextBody.indexOf("extendQueueWithSmartTracksRef"));
assert.match(player, /void removeStoredValues\(\[POSITION_KEY\]\);[\s\S]*?loadAndPlayRef\.current/);
assert.match(player, /queueTransition: !isAutoAdvance/);
assert.match(player, /!options\?\.queueTransition &&[\s\S]*?shouldProbeNativePlayback/);
assert.match(player, /!preserveNativePlayback && !options\?\.queueTransition/);
assert.match(loadBody, /playback_recovery_stale_restore_skipped/);
assert.match(player, /pause_during_transition[\s\S]*?loadRequestIdRef\.current \+= 1/);
assert.match(player, /const playSong = useCallback[\s\S]*?manualQueueCommandGenerationRef\.current \+= 1/);
assert.match(player, /const stopPlayback = useCallback[\s\S]*?manualQueueCommandGenerationRef\.current \+= 1/);
assert.match(player, /const togglePlayPause = useCallback[\s\S]*?manualQueueCommandGenerationRef\.current \+= 1/);

for (const marker of [
  "control_press",
  "shared_handler_enter",
  "queue_resolved",
  "native_transition_called",
  "native_load_start",
  "native_ready",
  "first_playing",
  "visible_track_updated",
  "deferred_work_start",
  "deferred_work_end",
]) {
  assert.ok(player.includes(`"${marker}"`), `missing timing marker: ${marker}`);
}

// Behavioral model of the synchronous in-memory index update used by manual skips.
const queue = ["album-1", "album-2", "album-3", "album-4", "album-5", "album-6"];
let index = 0;
let generation = 0;
const requests = [];
const command = (direction) => {
  const mine = ++generation;
  index = direction === "next" ? Math.min(index + 1, queue.length - 1) : Math.max(index - 1, 0);
  requests.push({ mine, track: queue[index] });
  return mine;
};
for (let i = 0; i < 5; i += 1) command("next");
assert.equal(index, 5);
assert.equal(requests.at(-1).track, "album-6");
command("previous");
command("next");
assert.equal(requests.at(-1).mine, generation);
assert.equal(requests.at(-1).track, "album-6");
assert.deepEqual(queue, ["album-1", "album-2", "album-3", "album-4", "album-5", "album-6"]);

// Domain routing remains present and separate.
assert.match(nextBody, /activeQueueModeRef\.current === "live_stream"/);
assert.match(previousBody, /activeQueueModeRef\.current === "live_stream"/);
assert.match(player, /isPodcastPlaybackDomain/);
assert.match(player, /isAudiobookPlaybackDomain/);
assert.match(player, /source: "remote"/);

console.log("Player Next/Previous responsiveness contracts passed.");
