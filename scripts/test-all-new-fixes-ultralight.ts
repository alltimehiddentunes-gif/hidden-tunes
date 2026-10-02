/**
 * Ultra-light contract for ALL new discovery/queue systems in this workstream.
 * Behavior unchanged — only hot-path cost bounds.
 */
import assert from "node:assert/strict";

import {
  ENDLESS_MUSIC_LIMITS,
  buildLocalContinuationPool,
  shouldRefillContinuationQueue,
} from "../services/endlessMusicContinuation";
import {
  MOOD_ROOM_DISCOVERY,
  discoverMoodRoomPage,
  resetMoodRoomDiscoverySession,
} from "../services/moodRoomDiscovery";
import {
  ROOM_DISCOVERY_LIMITS,
  peekRoomInitialTracks,
  resetRoomDiscoverySession,
  upsertRoomDiscoverySession,
} from "../services/roomDiscoverySession";
import {
  coalesceDiscoveryRequest,
  indexMoodTrackIfChanged,
} from "../services/moodDiscoveryIndex";
import { ingestMoodCatalogWindow } from "../services/historicalMoodGraph";
import {
  resolveDiscoveryToken,
  selectRadioCatalogCandidates,
} from "../services/radioCatalogDiscovery";

function song(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: String(extra.title || id),
    artist: String(extra.artist || "Artist"),
    genre: extra.genre || "Country",
    mood: extra.mood || "Reflective",
    streamUrl: `https://example.com/${id}.mp3`,
    isOnline: true,
    ...extra,
  };
}

void (async () => {
  let passed = 0;

  {
    assert.ok(MOOD_ROOM_DISCOVERY.resultPageSize <= 16);
    assert.ok(MOOD_ROOM_DISCOVERY.uiHoldCap <= 48);
    assert.ok(MOOD_ROOM_DISCOVERY.playbackBuffer <= 12);
    assert.ok(MOOD_ROOM_DISCOVERY.hotRoomLru <= 8);
    assert.ok(ENDLESS_MUSIC_LIMITS.queueCap <= 50);
    assert.ok(ENDLESS_MUSIC_LIMITS.refillBatch <= 12);
    assert.ok(ENDLESS_MUSIC_LIMITS.candidateCap <= 180);
    assert.ok(ROOM_DISCOVERY_LIMITS.maxTrackObjects <= MOOD_ROOM_DISCOVERY.uiHoldCap);
    passed += 1;
  }

  {
    const resolved = resolveDiscoveryToken("Worshp");
    assert.equal(resolved.kind, "typo");
    assert.ok(resolved.concepts.includes("worship"));
    passed += 1;
  }

  {
    const batch = [
      song("g1", { mood: "Reflective" }),
      song("g2", { mood: "Calm" }),
      song("g3", { mood: "Worship" }),
    ];
    ingestMoodCatalogWindow(batch as any);
    assert.equal(indexMoodTrackIfChanged(batch[0] as any), null);
    assert.equal(indexMoodTrackIfChanged(batch[1] as any), null);
    assert.equal(indexMoodTrackIfChanged(batch[2] as any), null);
    const changed = indexMoodTrackIfChanged(
      song("g1", { mood: "Worship", title: "Changed" }) as any
    );
    assert.ok(changed, "fingerprint change must re-index");
    passed += 1;
  }

  {
    const catalog = Array.from({ length: 400 }, (_, i) =>
      song(`a-${i}`, {
        artist: i < 30 ? "Target Artist" : `Other ${i}`,
        genre: "Pop",
        mood: "Upbeat",
      })
    );
    const started = Date.now();
    const picks = selectRadioCatalogCandidates(
      catalog as any,
      { artist: "Target Artist" },
      12
    );
    const elapsed = Date.now() - started;
    assert.equal(picks.length, 12);
    assert.ok(
      picks.every((entry) => /target artist/i.test(String(entry.artist))),
      "artist window must stay same-artist"
    );
    assert.ok(elapsed < 80, `artist radio selection too slow: ${elapsed}ms`);
    passed += 1;
  }

  {
    const sources = Array.from({ length: 2000 }, (_, i) =>
      song(`c-${i}`, {
        artist: i < 20 ? "Seed Artist" : `Noise ${i}`,
        genre: i < 20 ? "Jazz" : "Pop",
      })
    );
    const started = Date.now();
    const pool = buildLocalContinuationPool(sources as any, {
      current: song("seed", { artist: "Seed Artist", genre: "Jazz" }) as any,
      context: { artistName: "Seed Artist", genre: "Jazz" },
      excludeIds: new Set(["seed"]),
      cap: 40,
    });
    const elapsed = Date.now() - started;
    assert.ok(pool.length > 0 && pool.length <= 40);
    assert.ok(elapsed < 80, `continuation pool too slow: ${elapsed}ms`);
    passed += 1;
  }

  {
    assert.equal(
      shouldRefillContinuationQueue({
        domain: "music",
        enabled: true,
        userIntent: "playing",
        remaining: ENDLESS_MUSIC_LIMITS.lowWater + 1,
        refillInFlight: false,
      }),
      false
    );
    assert.equal(
      shouldRefillContinuationQueue({
        domain: "music",
        enabled: true,
        userIntent: "playing",
        remaining: ENDLESS_MUSIC_LIMITS.lowWater,
        refillInFlight: false,
      }),
      true
    );
    passed += 1;
  }

  {
    const many = Array.from({ length: 500 }, (_, i) =>
      song(`d-${i % 100}`, { title: `T${i % 100}`, artist: "A" })
    );
    const seen = new Set<string>();
    const unique: typeof many = [];
    many.forEach((entry) => {
      const key = String(entry.id);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(entry);
    });
    assert.equal(unique.length, 100);
    passed += 1;
  }

  {
    let runs = 0;
    const factory = () =>
      new Promise<number>((resolve) => {
        runs += 1;
        setTimeout(() => resolve(runs), 20);
      });
    const [a, b] = await Promise.all([
      coalesceDiscoveryRequest("k-ultralight", factory),
      coalesceDiscoveryRequest("k-ultralight", factory),
    ]);
    assert.equal(a, b);
    assert.equal(runs, 1, "identical in-flight discovery must coalesce");
    passed += 1;
  }

  {
    resetRoomDiscoverySession({
      type: "mood",
      id: "handoff",
      title: "Reflective",
    });
    upsertRoomDiscoverySession({
      type: "mood",
      id: "handoff",
      title: "Reflective",
      initialTracks: Array.from({ length: 12 }, (_, i) =>
        song(`h-${i}`, { mood: "Reflective" })
      ) as any,
    });
    const peeked = peekRoomInitialTracks({
      type: "mood",
      id: "handoff",
      title: "Reflective",
    });
    assert.equal(peeked.length, 12);
    passed += 1;
  }

  {
    resetMoodRoomDiscoverySession("Chill", "ultralight-all");
    const pages: Record<number, any[]> = {
      1: Array.from({ length: 60 }, (_, i) =>
        song(`n-${i}`, { mood: "Upbeat", genre: "Pop" })
      ),
      2: Array.from({ length: 20 }, (_, i) =>
        song(`chill-${i}`, { mood: "Chill", tags: ["chill"] })
      ),
    };
    const page = await discoverMoodRoomPage({
      moodLabel: "Chill",
      id: "ultralight-all",
      limit: 12,
      reset: true,
      fetchPage: async ({ page: p }) => ({
        songs: pages[p] || [],
        hasMore: p < 2,
      }),
    });
    assert.ok(page.songs.length > 0);
    assert.ok(page.windowsScanned <= MOOD_ROOM_DISCOVERY.maxWindowsPerRequest);
    assert.ok(
      page.sourceSongCount <=
        MOOD_ROOM_DISCOVERY.windowSize * MOOD_ROOM_DISCOVERY.maxWindowsPerRequest
    );
    passed += 1;
  }

  console.log(`PASS all-new-fixes ultra-light (${passed} checks)`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
