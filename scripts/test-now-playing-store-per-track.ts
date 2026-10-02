import assert from "node:assert/strict";
import {
  getTrackPlaybackStatusSnapshot,
  setNowPlayingSnapshot,
  subscribeTrackPlaybackStatus,
} from "../utils/nowPlayingStore";

let songA = 0;
let songB = 0;
let songC = 0;

const unsubA = subscribeTrackPlaybackStatus("a", () => {
  songA += 1;
});
const unsubB = subscribeTrackPlaybackStatus("b", () => {
  songB += 1;
});
const unsubC = subscribeTrackPlaybackStatus("c", () => {
  songC += 1;
});

setNowPlayingSnapshot({ currentSongId: "a", isPlaying: true });
assert.equal(songA, 1, "active track notified on start");
assert.equal(songB, 0, "other tracks quiet on start");
assert.equal(songC, 0, "other tracks quiet on start");
assert.deepEqual(getTrackPlaybackStatusSnapshot("a"), {
  isActive: true,
  isPlaying: true,
});
assert.deepEqual(getTrackPlaybackStatusSnapshot("b"), {
  isActive: false,
  isPlaying: false,
});

setNowPlayingSnapshot({ currentSongId: "a", isPlaying: false });
assert.equal(songA, 2, "active track notified on pause");
assert.equal(songB, 0, "inactive still quiet on pause");

setNowPlayingSnapshot({ currentSongId: "b", isPlaying: true });
assert.equal(songA, 3, "previous active notified on switch");
assert.equal(songB, 1, "new active notified on switch");
assert.equal(songC, 0, "unrelated track never notified");

const statusB1 = getTrackPlaybackStatusSnapshot("b");
const statusB2 = getTrackPlaybackStatusSnapshot("b");
assert.equal(statusB1, statusB2, "cached status identity stable");

unsubA();
unsubB();
unsubC();
console.log("nowPlayingStore per-track notify: PASS");
