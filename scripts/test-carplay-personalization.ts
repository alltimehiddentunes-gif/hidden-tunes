import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CARPLAY_PREFERENCE_CAPS,
  allocateCarPlayRegistry,
  buildCarPlayPreferenceSnapshot,
  parseCarPlayPreferenceSnapshot,
  rankCarPlayMusic,
} from "../services/carPlayPersonalization.ts";

const preferenceInput = {
  genres: Array.from({ length: 20 }, (_, i) => `Genre ${i}`),
  moods: ["Calm", "Energetic"],
  artists: Array.from({ length: 30 }, (_, i) => `Artist ${i}`),
  recents: [{ id: "one", playCount: 1 }, { id: "repeat", playCount: 8 }],
  favorites: ["favorite"], podcastTokens: ["technology"], radioIds: ["radio-1"],
  unfinishedIds: ["podcast:unfinished"], discoveryStyle: "balanced", updatedAt: 100,
};
const preferences = buildCarPlayPreferenceSnapshot(preferenceInput);
assert.equal(preferences.genres.length, CARPLAY_PREFERENCE_CAPS.genres);
assert.equal(preferences.artists.length, CARPLAY_PREFERENCE_CAPS.artists);
assert.deepEqual(parseCarPlayPreferenceSnapshot(JSON.stringify(preferences)), preferences,
  "preference snapshot persists and hydrates without mutation");
assert.equal(parseCarPlayPreferenceSnapshot("{bad"), null, "malformed preference snapshot fails safely");
assert.equal(preferences.signature,
  buildCarPlayPreferenceSnapshot(preferenceInput).signature,
  "identical bounded input produces identical signature");

const songs = [
  { mediaId: "song:favorite", id: "favorite", title: "Fav", artist: "A", genre: "R&B", url: "https://a/f" },
  { mediaId: "song:repeat", id: "repeat", title: "Repeat", artist: "B", genre: "R&B", url: "https://a/r" },
  { mediaId: "song:one", id: "one", title: "Accidental", artist: "C", genre: "Metal", url: "https://a/o" },
  ...Array.from({ length: 20 }, (_, i) => ({ mediaId: `song:d${i}`, id: `d${i}`,
    title: `Discovery ${i}`, artist: `Artist ${i % 4}`, genre: i % 2 ? "R&B" : "Afrobeats",
    url: `https://a/${i}` })),
] as any[];
const ranked = rankCarPlayMusic(songs, preferences, 12);
assert.equal(ranked[0].id, "favorite", "favorite receives strongest relevance");
assert.ok(ranked.findIndex((song) => song.id === "repeat") < ranked.findIndex((song) => song.id === "one"),
  "repeat strength exceeds one accidental play");
assert.deepEqual(ranked.map((song) => song.id), rankCarPlayMusic(songs, preferences, 12).map((song) => song.id));
assert.ok(Math.max(...[...new Set(ranked.map((song) => song.artist))]
  .map((artist) => ranked.filter((song) => song.artist === artist).length)) <= 2, "artist cap is two");

const buckets = Array.from({ length: 10 }, (_, priority) => ({
  priority, items: Array.from({ length: 15 }, (_, i) => ({ mediaId: `p${priority}:${i}` })), quota: 10,
}));
const allocated = allocateCarPlayRegistry(buckets as any, 80);
assert.equal(allocated.length, 80);
assert.equal(new Set(allocated.map((item: any) => item.mediaId)).size, 80);

const source = fs.readFileSync(new URL("../services/carPlayPersonalization.ts", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../services/carPlayCatalogBridge.ts", import.meta.url), "utf8");
assert.match(source, /AsyncStorage/);
assert.match(source, /CARPLAY_PREFERENCE_STORAGE_KEY/);
assert.doesNotMatch(source, /fetch\(|axios|setInterval|setTimeout/);
assert.match(bridge, /buildCarPlayPreferenceSnapshot/);
assert.match(bridge, /rankCarPlayMusic/);
assert.doesNotMatch(bridge, /getSharedDiscoverySnapshot|from ["']\.\/discoveryCache/);

const benchmarkInput = Array.from({ length: 80 }, (_, i) => ({ mediaId: `song:b${i}`, id: `b${i}`,
  title: `Track ${i}`, artist: `Artist ${i % 12}`, genre: `Genre ${i % 8}`, url: `https://a/b${i}` })) as any[];
const heapBefore = process.memoryUsage().heapUsed;
const startedAt = performance.now();
for (let i = 0; i < 100; i += 1) rankCarPlayMusic(benchmarkInput, preferences, 12);
const elapsedMs = performance.now() - startedAt;
const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
assert.ok(elapsedMs < 250, `bounded ranking remains lightweight (${elapsedMs.toFixed(2)}ms/100 runs)`);

console.log("carplay-personalization: PASS", {
  candidates: 80, runs: 100, rankingMs: Number(elapsedMs.toFixed(2)),
  averageRankingMs: Number((elapsedMs / 100).toFixed(3)), heapDeltaBytes,
});
