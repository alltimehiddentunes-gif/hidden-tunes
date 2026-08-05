import assert from "node:assert/strict";

import {
  ENDLESS_MUSIC_LIMITS,
  createContinuationSession,
  rankContinuationCandidates,
  shouldRefillContinuationQueue,
} from "../services/endlessMusicContinuation";

const song = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  artist: "Artist",
  streamUrl: `https://example.com/${id}.mp3`,
  type: "r2",
  isOnline: true,
  ...extra,
});

const baseInput = {
  current: song("current", {
    genre: "R&B",
    emotionalMetadataRaw: {
      energy: 38,
      atmosphere: "intimate",
      emotion: "vulnerability",
      vocalFeel: "breathy",
      instrumentation: "piano",
    },
  }),
  context: { source: "mood", mood: "heartbreak" } as const,
  existingQueue: [song("current")],
  recentIds: [] as string[],
  favorites: new Set<string>(),
  playCounts: new Map<string, number>(),
  skippedIds: new Set<string>(),
  matureVisible: false,
  intent: "continue" as const,
};

{
  const session = createContinuationSession("seed", baseInput.context);
  assert.equal(session.enabled, true);
  assert.equal(session.userIntent, "playing");
}

{
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
  for (const userIntent of ["paused", "stopped"] as const) {
    assert.equal(
      shouldRefillContinuationQueue({
        domain: "music",
        enabled: true,
        userIntent,
        remaining: 0,
        refillInFlight: false,
      }),
      false
    );
  }
  assert.equal(
    shouldRefillContinuationQueue({
      domain: "podcast",
      enabled: true,
      userIntent: "playing",
      remaining: 0,
      refillInFlight: false,
    }),
    false
  );
}

{
  const compatible = song("compatible", {
    genre: "R&B",
    emotionalMetadataRaw: {
      energy: 42,
      atmosphere: "intimate",
      emotion: "vulnerability",
      vocalFeel: "breathy",
      instrumentation: "piano",
    },
  });
  const extreme = song("extreme", {
    artist: "Other",
    genre: "Metal",
    emotionalMetadataRaw: {
      energy: 100,
      atmosphere: "aggressive",
      emotion: "rage",
      vocalFeel: "shouted",
      instrumentation: "electric-guitar",
    },
  });
  const ranked = rankContinuationCandidates([extreme, compatible], baseInput);
  assert.equal(ranked[0]?.song.id, "compatible");
  assert.deepEqual(
    rankContinuationCandidates([extreme, compatible], baseInput).map((entry) => entry.song.id),
    ranked.map((entry) => entry.song.id)
  );
}

{
  const candidates = Array.from({ length: 260 }, (_, index) =>
    song(`candidate-${index}`, { artist: `Artist ${index % 8}`, genre: "R&B" })
  );
  const ranked = rankContinuationCandidates(candidates, baseInput);
  assert.ok(ranked.length <= ENDLESS_MUSIC_LIMITS.refillBatch);
  assert.ok(ENDLESS_MUSIC_LIMITS.candidateCap <= 220);
  assert.ok(ENDLESS_MUSIC_LIMITS.queueCap <= 60);
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  for (let run = 0; run < 100; run += 1) {
    rankContinuationCandidates(candidates, baseInput);
  }
  const averageMs = (performance.now() - startedAt) / 100;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  assert.ok(averageMs < 10, `average ranking exceeded 10 ms: ${averageMs}`);
  assert.ok(heapDeltaBytes < 16 * 1024 * 1024, `heap delta exceeded 16 MB: ${heapDeltaBytes}`);
  console.log("endless continuation benchmark", {
    candidates: ENDLESS_MUSIC_LIMITS.candidateCap,
    runs: 100,
    averageMs: Number(averageMs.toFixed(3)),
    heapDeltaBytes,
  });
}

{
  const mature = song("mature", { mature: true, genre: "R&B" });
  const safe = song("safe", { genre: "R&B" });
  const ranked = rankContinuationCandidates([mature, safe], baseInput);
  assert.deepEqual(ranked.map((entry) => entry.song.id), ["safe"]);
}

{
  const repeatedArtist = Array.from({ length: 10 }, (_, index) =>
    song(`same-${index}`, { artist: "Same Artist", genre: "R&B" })
  );
  const alternatives = Array.from({ length: 10 }, (_, index) =>
    song(`other-${index}`, { artist: `Other ${index}`, genre: "R&B" })
  );
  const ranked = rankContinuationCandidates([...repeatedArtist, ...alternatives], baseInput);
  assert.ok(ranked.filter((entry) => entry.song.artist === "Same Artist").length <= 2);
}

console.log("PASS endless emotional continuation");
