import assert from "node:assert/strict";

import {
  MOOD_ROOM_DISCOVERY,
  discoverMoodRoomPage,
  resetMoodRoomDiscoverySession,
  takeMoodPlaybackBuffer,
} from "../services/moodRoomDiscovery";
import {
  ROOM_DISCOVERY_LIMITS,
  appendRoomDiscoveryTracks,
  compactRoomDiscoverySessionForOffscreen,
  peekRoomInitialTracks,
  resetRoomDiscoverySession,
  upsertRoomDiscoverySession,
} from "../services/roomDiscoverySession";
import { setCatalogViewSeed } from "../services/catalogViewSeed";

{
  // Ultra-light hard bounds — never scan/rank thousands on one interaction.
  assert.ok(MOOD_ROOM_DISCOVERY.windowSize <= 80);
  assert.ok(MOOD_ROOM_DISCOVERY.maxWindowsPerRequest <= 4);
  assert.ok(
    MOOD_ROOM_DISCOVERY.windowSize * MOOD_ROOM_DISCOVERY.maxWindowsPerRequest <= 240,
    "per-request candidate ceiling must stay tiny"
  );
  assert.ok(MOOD_ROOM_DISCOVERY.uiHoldCap <= 96);
  assert.ok(MOOD_ROOM_DISCOVERY.playbackBuffer <= 16);
  assert.ok(ROOM_DISCOVERY_LIMITS.maxTrackObjects <= MOOD_ROOM_DISCOVERY.uiHoldCap);
  assert.equal(
    takeMoodPlaybackBuffer(Array.from({ length: 80 }, (_, i) => ({ id: i })), 12).length,
    12
  );
}

void (async () => {
  resetRoomDiscoverySession({
    type: "mood",
    id: "ultra-light",
    title: "Chill Station",
  });

  const explore = Array.from({ length: 12 }, (_, i) => ({
    id: `e-${i}`,
    title: `Track ${i}`,
    artist: "Artist",
    streamUrl: `https://example.com/e-${i}.mp3`,
  }));

  setCatalogViewSeed({
    type: "mood",
    id: "ultra-light",
    title: "Chill Station",
    songs: explore as any,
  });

  assert.equal(
    peekRoomInitialTracks({
      type: "mood",
      id: "ultra-light",
      title: "Chill Station",
    }).length,
    12,
    "Explore handoff remains instant initial page"
  );

  // Append many pages — track objects stay bounded; IDs may grow lightly.
  for (let page = 0; page < 20; page += 1) {
    appendRoomDiscoveryTracks(
      { type: "mood", id: "ultra-light", title: "Chill Station" },
      Array.from({ length: 24 }, (_, i) => ({
        id: `p${page}-${i}`,
        title: `P${page}-${i}`,
        artist: "A",
        streamUrl: `https://example.com/p${page}-${i}.mp3`,
      })) as any,
      { hasMore: true }
    );
  }

  const held = peekRoomInitialTracks({
    type: "mood",
    id: "ultra-light",
    title: "Chill Station",
  });
  assert.ok(
    held.length <= ROOM_DISCOVERY_LIMITS.maxTrackObjects,
    `track object window must stay <= ${ROOM_DISCOVERY_LIMITS.maxTrackObjects}, got ${held.length}`
  );

  compactRoomDiscoverySessionForOffscreen({
    type: "mood",
    id: "ultra-light",
    title: "Chill Station",
  });
  const offscreen = peekRoomInitialTracks({
    type: "mood",
    id: "ultra-light",
    title: "Chill Station",
  });
  assert.ok(offscreen.length <= 12, "offscreen must drop heavy track objects");

  // Paginated discovery still finds matches without full-catalog hydrate.
  const pages: Record<number, any[]> = {
    1: Array.from({ length: 60 }, (_, i) => ({
      id: `noise-${i}`,
      title: `Noise ${i}`,
      artist: "X",
      genre: "Pop",
      mood: "Upbeat",
      streamUrl: `https://example.com/n-${i}.mp3`,
    })),
    2: Array.from({ length: 20 }, (_, i) => ({
      id: `chill-${i}`,
      title: `Chill ${i}`,
      artist: "Y",
      genre: "LoFi",
      mood: "Chill",
      tags: ["chill", "relax"],
      streamUrl: `https://example.com/c-${i}.mp3`,
    })),
  };
  resetMoodRoomDiscoverySession("Chill", "ultra");
  const page1 = await discoverMoodRoomPage({
    moodLabel: "Chill",
    id: "ultra",
    limit: 12,
    reset: true,
    fetchPage: async ({ page }) => ({
      songs: pages[page] || [],
      hasMore: page < 2,
    }),
  });
  assert.ok(page1.songs.length > 0);
  assert.ok(page1.windowsScanned <= MOOD_ROOM_DISCOVERY.maxWindowsPerRequest);
  assert.ok(page1.sourceSongCount <= MOOD_ROOM_DISCOVERY.windowSize * MOOD_ROOM_DISCOVERY.maxWindowsPerRequest);

  console.log("PASS ultra-light endless discovery", {
    held: held.length,
    offscreen: offscreen.length,
    windows: page1.windowsScanned,
    sourceSongCount: page1.sourceSongCount,
    playbackBuffer: MOOD_ROOM_DISCOVERY.playbackBuffer,
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
