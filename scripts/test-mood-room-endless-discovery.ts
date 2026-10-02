import assert from "node:assert/strict";

import {
  MOOD_ROOM_DISCOVERY,
  alignMoodRoomDiscoverySession,
  discoverMoodRoomPage,
  resetMoodRoomDiscoverySession,
  takeMoodPlaybackBuffer,
} from "../services/moodRoomDiscovery";
import { normalizeDiscoveryConcepts } from "../services/radioCatalogDiscovery";

function makeSong(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: String(extra.title || id),
    artist: String(extra.artist || "Artist"),
    genre: extra.genre,
    mood: extra.mood,
    tags: extra.tags,
    streamUrl: `https://example.com/${id}.mp3`,
    isOnline: true,
    ...extra,
  };
}

{
  const concepts = normalizeDiscoveryConcepts("Worship´Praise^Inspiration°Intimacy");
  assert.ok(concepts.includes("worship"));
  assert.ok(concepts.includes("praise"));
  assert.ok(concepts.includes("inspiration") || concepts.includes("inspirational"));
  assert.ok(concepts.includes("intimacy") || concepts.includes("intimate"));
}

{
  assert.ok(MOOD_ROOM_DISCOVERY.windowSize <= 100);
  assert.ok(MOOD_ROOM_DISCOVERY.maxWindowsPerRequest <= 10);
  assert.equal(
    takeMoodPlaybackBuffer(Array.from({ length: 40 }, (_, i) => ({ id: i })), 12).length,
    12
  );
}

void (async () => {
  const pages: Record<number, ReturnType<typeof makeSong>[]> = {
    1: Array.from({ length: 100 }, (_, i) =>
      makeSong(`pop-${i}`, { genre: "Pop", mood: "Upbeat", title: `Pop ${i}` })
    ),
    2: Array.from({ length: 100 }, (_, i) =>
      makeSong(`mid-${i}`, { genre: "R&B", mood: "Smooth", title: `Mid ${i}` })
    ),
    3: [
      makeSong("w1", {
        title: "Open Heaven",
        artist: "Elevation Worshippers",
        genre: "Gospel",
        mood: "Spiritual",
        tags: ["worship", "praise"],
      }),
      makeSong("w2", {
        title: "Praise Forever",
        artist: "Faith Band",
        genre: "Gospel",
        mood: "Inspiration",
        tags: ["praise"],
      }),
      makeSong("w3", {
        title: "Close To You",
        artist: "Soft Voices",
        genre: "R&B",
        mood: "Soft Intimacy",
        tags: ["intimacy"],
      }),
      ...Array.from({ length: 97 }, (_, i) =>
        makeSong(`g-${i}`, { genre: "Gospel", mood: "Worship", title: `Gospel ${i}` })
      ),
    ],
  };

  const fetchPage = async ({ page }: { page: number; limit: number }) => ({
    songs: pages[page] || [],
    hasMore: page < 3,
  });

  resetMoodRoomDiscoverySession("Worship,praise,inspiration,intimacy", "unit");
  const page1 = await discoverMoodRoomPage({
    moodLabel: "Worship,praise,inspiration,intimacy",
    id: "unit",
    limit: 20,
    reset: true,
    fetchPage,
  });
  assert.ok(page1.songs.length > 0, "paginated discovery must find mood matches across windows");
  assert.ok(page1.windowsScanned >= 1);
  assert.ok(
    page1.songs.every((song) => {
      const blob = `${song.genre} ${song.mood} ${JSON.stringify(song.tags)}`.toLowerCase();
      return (
        blob.includes("gospel") ||
        blob.includes("worship") ||
        blob.includes("praise") ||
        blob.includes("intimacy") ||
        blob.includes("inspiration")
      );
    }),
    "no random pop dump"
  );

  const page2 = await discoverMoodRoomPage({
    moodLabel: "Worship,praise,inspiration,intimacy",
    id: "unit",
    limit: 20,
    fetchPage,
  });
  const overlap = page2.songs.some((song) =>
    page1.songs.some((prior) => String(prior.id) === String(song.id))
  );
  assert.equal(overlap, false, "continuation must dedupe prior page");

  // Cached first-page align must not re-serve held rows on next discover.
  alignMoodRoomDiscoverySession(
    "Worship,praise,inspiration,intimacy",
    "align",
    page1.songs,
    true
  );
  const afterAlign = await discoverMoodRoomPage({
    moodLabel: "Worship,praise,inspiration,intimacy",
    id: "align",
    limit: 20,
    fetchPage,
  });
  const alignOverlap = afterAlign.songs.some((song) =>
    page1.songs.some((prior) => String(prior.id) === String(song.id))
  );
  assert.equal(alignOverlap, false, "aligned cache session must dedupe held rows");

  // Broadening: sparse exact mood → related gospel still continues (no dead end).
  const sparsePages: Record<number, ReturnType<typeof makeSong>[]> = {
    1: [makeSong("only-w", { genre: "Gospel", mood: "Worship", tags: ["worship"] })],
    2: Array.from({ length: 20 }, (_, i) =>
      makeSong(`related-${i}`, { genre: "Gospel", mood: "Spiritual", title: `Related ${i}` })
    ),
  };
  const fetchSparse = async ({ page }: { page: number; limit: number }) => ({
    songs: sparsePages[page] || [],
    hasMore: page < 2,
  });
  resetMoodRoomDiscoverySession("worship", "sparse");
  const sparse1 = await discoverMoodRoomPage({
    moodLabel: "worship",
    id: "sparse",
    limit: 5,
    reset: true,
    fetchPage: fetchSparse,
  });
  assert.ok(sparse1.songs.length >= 1);
  const sparse2 = await discoverMoodRoomPage({
    moodLabel: "worship",
    id: "sparse",
    limit: 5,
    fetchPage: fetchSparse,
  });
  assert.ok(
    sparse1.songs.length + sparse2.songs.length > 1,
    "broadening must continue after exact mood exhaustion"
  );

  console.log("PASS mood room endless discovery contract", {
    page1: page1.songs.length,
    page2: page2.songs.length,
    windows: page1.windowsScanned,
    afterAlign: afterAlign.songs.length,
    sparse: sparse1.songs.length + sparse2.songs.length,
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
