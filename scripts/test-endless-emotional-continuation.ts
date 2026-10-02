import assert from "node:assert/strict";

import {
  ENDLESS_MUSIC_LIMITS,
  buildLocalContinuationPool,
  createContinuationSession,
  formatSmartQueueLabel,
  rankContinuationCandidates,
  shouldRefillContinuationQueue,
} from "../services/endlessMusicContinuation";
import {
  extractRadioSeedArtist,
  selectRadioCatalogCandidates,
} from "../services/radioCatalogDiscovery";

const song = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  artist: "Artist",
  streamUrl: `https://example.com/${id}.mp3`,
  type: "r2",
  isOnline: true,
  ...extra,
});

function recordingKey(entry: { id?: string; title?: string; artist?: string }) {
  const title = String(entry.title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const artist = String(entry.artist || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (title && artist) return `meta:${title}:${artist}`;
  return `id:${String(entry.id || "").toLowerCase()}`;
}

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

{
  // Shepherd / Elevation Worshippers: intent pool must beat random catalog prefix.
  const seed = song("shepherd-seed", {
    title: "The lord is my shepherd",
    artist: "Elevation Worshippers",
    genre: "Gospel",
    mood: "Spiritual",
  });
  const unrelatedPrefix = Array.from({ length: 180 }, (_, index) =>
    song(`pop-prefix-${index}`, {
      title: `Pop Hit ${index}`,
      artist: `Pop Star ${index}`,
      genre: "Pop",
      streamUrl: `https://example.com/pop-${index}.mp3`,
    })
  );
  const related = [
    song("elev-1", {
      title: "Shepherd of Love",
      artist: "Elevation Worshippers",
      genre: "Gospel",
      mood: "Spiritual",
    }),
    song("elev-2", {
      title: "Praise Forever",
      artist: "Elevation Worshippers",
      genre: "Gospel",
    }),
    song("gospel-1", {
      title: "Holy Ground",
      artist: "Gospel Choir",
      genre: "Gospel",
      mood: "Spiritual",
    }),
    song("unrelated-deep", {
      title: "Club Banger",
      artist: "DJ Night",
      genre: "Dance",
    }),
  ];
  const catalog = [...unrelatedPrefix, ...related];
  const pool = buildLocalContinuationPool(catalog, {
    current: seed,
    context: {
      source: "search",
      searchQuery: "shepherd",
      artistName: "Elevation Worshippers",
      genre: "Gospel",
      mood: "Spiritual",
      label: "Search: shepherd",
    },
  });
  assert.ok(
    pool.every((entry) => entry.artist !== "Pop Star 0"),
    "intent pool must not start with random catalog prefix"
  );
  assert.ok(
    pool.filter((entry) => String(entry.artist).includes("Elevation")).length >= 2,
    "same-artist tracks must be in the intent pool"
  );
  const ranked = rankContinuationCandidates(pool, {
    ...baseInput,
    current: seed,
    context: {
      source: "search",
      searchQuery: "shepherd",
      artistName: "Elevation Worshippers",
      genre: "Gospel",
      mood: "Spiritual",
      label: "Search: shepherd",
    },
    existingQueue: [seed],
  });
  assert.ok(ranked.length > 0, "smart queue must produce candidates");
  assert.ok(
    ranked.every((entry) => {
      const artist = String(entry.song.artist || "").toLowerCase();
      const genre = String(entry.song.genre || "").toLowerCase();
      const title = String(entry.song.title || "").toLowerCase();
      return (
        artist.includes("elevation") ||
        genre.includes("gospel") ||
        title.includes("shepherd")
      );
    }),
    "ranked smart queue must stay relevant to seed"
  );
  assert.equal(
    formatSmartQueueLabel({
      source: "search",
      label: "Search: shepherd",
      searchQuery: "shepherd",
    }),
    "Smart Queue · Search: shepherd"
  );
}

{
  const a = song("id-a", { title: "Same Recording", artist: "Dup Artist" });
  const b = song("id-b", { title: "Same Recording", artist: "Dup Artist" });
  assert.equal(recordingKey(a), recordingKey(b));
  const ranked = rankContinuationCandidates([a, b], {
    ...baseInput,
    current: song("seed-dup", { title: "Seed", artist: "Dup Artist", genre: "R&B" }),
    context: { source: "artist", artistName: "Dup Artist" },
    existingQueue: [song("seed-dup")],
  });
  assert.equal(ranked.length, 1, "recording-level dedupe must collapse alternate ids");
}

{
  assert.equal(
    extractRadioSeedArtist({
      title: "Elevation Worshippers Radio",
      query: "Elevation Worshippers songs",
    }),
    "Elevation Worshippers"
  );
  const catalog = [
    song("elev-radio-1", {
      title: "The Lord Is My Shepherd",
      artist: "Elevation Worshippers",
      genre: "Gospel",
      mood: "Spiritual",
    }),
    song("gospel-radio-1", {
      title: "Amazing Grace",
      artist: "Faith Band",
      genre: "Gospel",
      mood: "Spiritual",
    }),
    song("pop-radio-1", {
      title: "Neon Lights",
      artist: "City Pop",
      genre: "Pop",
    }),
  ];
  const artistRadio = selectRadioCatalogCandidates(catalog, {
    title: "Elevation Worshippers Radio",
    query: "Elevation Worshippers songs",
    genre: "Gospel",
    mood: "Spiritual",
  });
  assert.ok(artistRadio.length > 0, "Artist Radio must not false-zero when catalog has matches");
  assert.ok(
    artistRadio.some((entry) => String(entry.artist).includes("Elevation")),
    "Artist Radio must prefer seed artist tracks"
  );

  const hiddenRadio = selectRadioCatalogCandidates(
    [
      song("h1", { artist: "A", genre: "Pop" }),
      song("h2", { artist: "B", genre: "Jazz" }),
      song("h3", { artist: "C", genre: "Gospel" }),
    ],
    { title: "Hidden Tunes Radio" }
  );
  assert.ok(hiddenRadio.length > 0, "Hidden Radio must use local diversified catalog");
}

console.log("PASS endless emotional continuation");
