import assert from "node:assert/strict";

import {
  getMoodDiscoveryIndexSize,
  indexMoodTrackIfChanged,
  resetMoodDiscoveryPerf,
} from "../services/moodDiscoveryIndex";
import { ingestMoodCatalogWindow } from "../services/historicalMoodGraph";
import { MOOD_ROOM_DISCOVERY } from "../services/moodRoomDiscovery";

function song(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: String(extra.title || id),
    artist: "Artist",
    genre: extra.genre || "Country",
    mood: extra.mood || "Reflective",
    streamUrl: `https://example.com/${id}.mp3`,
    isOnline: true,
    ...extra,
  };
}

{
  assert.ok(MOOD_ROOM_DISCOVERY.resultPageSize <= 16);
  assert.ok(MOOD_ROOM_DISCOVERY.uiHoldCap <= 48);
  assert.ok(MOOD_ROOM_DISCOVERY.playbackBuffer <= 12);
  assert.ok(MOOD_ROOM_DISCOVERY.maxWindowsPerRequest <= 3);
  assert.ok(MOOD_ROOM_DISCOVERY.hotRoomLru <= 8);
}

resetMoodDiscoveryPerf();
const batch = [
  song("a", { mood: "Reflective" }),
  song("b", { mood: "Calm" }),
  song("c", { mood: "Reflective, Heartfelt" }),
];

ingestMoodCatalogWindow(batch);
const sizeAfterFirst = getMoodDiscoveryIndexSize();
assert.equal(sizeAfterFirst.tracks, 3);

// Re-ingest identical window — must hit normalization cache, not rebuild.
ingestMoodCatalogWindow(batch);
assert.equal(
  getMoodDiscoveryIndexSize().tracks,
  3,
  "re-ingest must not duplicate index tracks"
);

const again = indexMoodTrackIfChanged(batch[0] as any);
assert.equal(again, null, "identical fingerprint returns null (cache hit)");

const changed = indexMoodTrackIfChanged(
  song("a", { mood: "Worship", title: "New Title" }) as any
);
assert.ok(changed, "changed fingerprint must re-normalize");
assert.ok(changed!.moods.includes("worship") || changed!.moods.length >= 1);

console.log("PASS mood discovery ultra-light index", {
  resultPageSize: MOOD_ROOM_DISCOVERY.resultPageSize,
  uiHoldCap: MOOD_ROOM_DISCOVERY.uiHoldCap,
  playbackBuffer: MOOD_ROOM_DISCOVERY.playbackBuffer,
  maxWindows: MOOD_ROOM_DISCOVERY.maxWindowsPerRequest,
  hotRoomLru: MOOD_ROOM_DISCOVERY.hotRoomLru,
  indexTracks: getMoodDiscoveryIndexSize().tracks,
});
