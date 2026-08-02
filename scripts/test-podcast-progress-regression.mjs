import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const player = read("context/PlayerContext.tsx");

assert.match(player, /const PLAYBACK_UPDATE_INTERVAL_MS = 1500;/);
assert.match(player, /const PODCAST_POSITION_STATE_UPDATE_MIN_MS = 1000;/);
assert.match(player, /function isPodcastPlaybackDomain\(/);
assert.match(player, /getPositionStateUpdateMinMs\(appStateRef\.current, isPodcast\)/);
assert.match(player, /const resolvePodcastQueueTarget = useCallback/);
assert.match(player, /fetchPodcastEpisodePlay\(episodeId/);
assert.match(player, /reason: "podcast_target_resolve_failed"/);
assert.match(player, /await resolvePodcastQueueTarget\(targetSong\)/);
assert.match(player, /await resolvePodcastQueueTarget\(targetSongAtIndex\)/);
assert.match(player, /queue\.map\(\(entry, queueIndex\) => \(queueIndex === safeIndex \? song : entry\)\)/);
assert.match(player, /now - lastPositionStateUpdateRef\.current >= positionStateMinMs &&/);
assert.match(player, /const positionDeltaMinMs = isLiveRadio \? 5_000 : 400;/);
assert.match(read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"), /CMTime\(seconds: 1\.0/);
assert.match(read("plugins/hidden-audio/android/HiddenAudioCore.kt"), /PROGRESS_LOOP_INTERVAL_MS = 1000L/);
assert.match(read("components/MiniPlayer.tsx"), /usePlayerProgress\(\)/);
assert.match(read("app/player.tsx"), /usePlayerProgress\(\)/);

console.log("test-podcast-progress-regression: PASS");
