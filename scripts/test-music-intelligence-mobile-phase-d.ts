import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  isCurrentMusicRecommendationResult,
  isMusicRecommendationAuthSnapshotCurrent,
  requestMusicRecommendationsOverTransport,
  selectServerRecommendedSongs,
  type MusicRecommendationRequest,
  type MusicRecommendationResult,
} from "../services/musicIntelligenceRefill";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const request: MusicRecommendationRequest = {
  seedSongId: "seed-a",
  journeyIntent: "CONTINUE",
  limit: 10,
  generationToken: "7:seed-a",
  recentSongIds: [],
  recentlySkippedSongIds: [],
  manuallyQueuedSongIds: ["manual-1", "manual-2", "manual-3"],
  listener: { favorites: ["song-2"] },
};
const result: MusicRecommendationResult = {
  seedSongId: request.seedSongId,
  effectiveIntent: request.journeyIntent,
  generationToken: request.generationToken,
  rankingVersion: "test",
  recommendations: [
    { songId: "manual-1", position: 1, finalScore: 0.95, profileConfidence: 1, journeyCompatibility: 0.9, rankingVersion: "test" },
    { songId: "song-2", position: 2, finalScore: 0.9, profileConfidence: 1, journeyCompatibility: 0.8, rankingVersion: "test" },
    { songId: "song-1", position: 3, finalScore: 0.8, profileConfidence: 1, journeyCompatibility: 0.7, rankingVersion: "test" },
    { songId: "song-2", position: 4, finalScore: 0.7, profileConfidence: 1, journeyCompatibility: 0.6, rankingVersion: "test" },
    { songId: "missing", position: 5, finalScore: 0.6, profileConfidence: 1, journeyCompatibility: 0.5, rankingVersion: "test" },
  ],
};
const successBody = { success: true, ...result };
const response = (ok: boolean, body: unknown) => ({
  ok,
  json: async () => body,
});

async function main() {
const successfulTransport = await requestMusicRecommendationsOverTransport(
  request,
  async () => response(true, successBody)
);
assert.deepEqual(
  successfulTransport?.recommendations.map((entry) => entry.songId),
  ["manual-1", "song-2", "song-1", "missing"],
  "a valid backend response must enter the server-ranked path"
);
assert.equal(
  await requestMusicRecommendationsOverTransport(request, async () => {
    throw new Error("timeout");
  }),
  null,
  "a timeout must fail open"
);
assert.equal(
  await requestMusicRecommendationsOverTransport(request, async () => response(false, {})),
  null,
  "HTTP 500/401 responses must fail open"
);
assert.equal(
  await requestMusicRecommendationsOverTransport(request, async () => response(true, {
    ...successBody,
    recommendations: [],
  })),
  null,
  "an empty response must fail open"
);
assert.equal(
  await requestMusicRecommendationsOverTransport(request, async () => response(true, {
    success: true,
    seedSongId: request.seedSongId,
    generationToken: request.generationToken,
  })),
  null,
  "a malformed response must fail open"
);
assert.equal(
  await requestMusicRecommendationsOverTransport(request, async () => response(true, {
    ...successBody,
    generationToken: "stale-generation",
  })),
  null,
  "a mismatched generation echo must fail open"
);

assert.equal(isCurrentMusicRecommendationResult(result, {
  seedSongId: "seed-a",
  generationToken: "7:seed-a",
  liveSeedSongId: "seed-a",
  liveGenerationToken: "7:seed-a",
}), true);
assert.equal(isCurrentMusicRecommendationResult(result, {
  seedSongId: "seed-a",
  generationToken: "7:seed-a",
  liveSeedSongId: "seed-c",
  liveGenerationToken: "9:seed-c",
}), false, "Seed A must not commit after rapid skips reach Seed C");
assert.equal(isCurrentMusicRecommendationResult({
  ...result,
  seedSongId: "seed-b",
  generationToken: "8:seed-b",
}, {
  seedSongId: "seed-b",
  generationToken: "8:seed-b",
  liveSeedSongId: "seed-c",
  liveGenerationToken: "9:seed-c",
}), false, "Seed B must not commit after rapid skips reach Seed C");
assert.equal(isMusicRecommendationAuthSnapshotCurrent(
  { namespace: "profile:user-a", epoch: 3 },
  { namespace: "profile:user-b", epoch: 4 }
), false, "User A results must not enter User B state");

const manualIds = new Set(["seed-a", "manual-1", "manual-2", "manual-3"]);
const selected = selectServerRecommendedSongs(
  result,
  [
    { id: "manual-1" },
    { id: "song-1" },
    { id: "song-2" },
    { id: "song-3" },
  ],
  manualIds,
  10
);
assert.deepEqual(selected.map((song) => song.id), ["song-2", "song-1"],
  "server order must be retained while duplicates, missing tracks, and queued tracks are rejected");
assert.deepEqual(
  ["manual-1", "manual-2", "manual-3", ...selected.map((song) => song.id)].slice(0, 3),
  ["manual-1", "manual-2", "manual-3"],
  "manual queue entries must remain ahead of Auto Queue additions"
);

const benchmarkCandidates = Array.from({ length: 200 }, (_, index) => ({ id: `song-${index}` }));
const benchmarkStarted = performance.now();
for (let index = 0; index < 1_000; index += 1) {
  selectServerRecommendedSongs(result, benchmarkCandidates, manualIds, 10);
}
const mappingAverageMs = (performance.now() - benchmarkStarted) / 1_000;
assert.ok(mappingAverageMs < 2, `recommendation mapping is too slow: ${mappingAverageMs} ms`);

const playerSource = fs.readFileSync(path.join(root, "context", "PlayerContext.tsx"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "services", "musicIntelligenceApi.ts"), "utf8");
const refillSource = fs.readFileSync(path.join(root, "services", "musicIntelligenceRefill.ts"), "utf8");
const domainGuard = playerSource.indexOf('if (domain !== "music")');
const requestCall = playerSource.indexOf("requestMusicRecommendations(recommendationRequest)");
const fallbackGate = playerSource.indexOf("if (!freshRelated.length)", requestCall);
const localCandidateBuild = playerSource.indexOf("const combinedLibrary", requestCall);
const localFallback = playerSource.indexOf("rankContinuationCandidates(combinedLibrary", requestCall);

assert.ok(domainGuard >= 0 && requestCall > domainGuard,
  "Radio, TV, Podcasts, Audiobooks, Lectures, and Motivationals must be rejected before the request");
assert.ok(fallbackGate > requestCall && localCandidateBuild > fallbackGate && localFallback > fallbackGate,
  "successful server results must skip catalog candidate construction and local ranking");
assert.match(playerSource, /networkAllowed:\s*false/,
  "queue exhaustion must use the immediate local-only path");
assert.match(playerSource, /networkAllowed:\s*true/,
  "low-water refill must prefetch without blocking the active Next transition");
assert.match(playerSource, /continuationRefillRequestRef\.current !== refillRequestId/,
  "duplicate and stale refill requests must be invalidated");
assert.match(playerSource, /manuallyQueuedSongIds:\s*smartQueue[\s\S]*?\.slice\(smartIndex \+ 1\)/,
  "future manual/current queue entries must remain ahead of Auto Queue additions");
assert.match(refillSource, /body\.generationToken !== input\.generationToken/,
  "the server generation echo must be validated");
assert.match(apiSource, /activeControllers\.forEach\(\(controller\) => controller\.abort\(\)\)/,
  "account changes must abort recommendation requests");
assert.match(apiSource, /isMusicRecommendationAuthSnapshotCurrent/,
  "the live account namespace and epoch must guard result delivery");
assert.doesNotMatch(playerSource, /musicIntelligence[\s\S]{0,100}lyrics/i,
  "playback integration must not perform lyrics analysis");

console.log("Music Intelligence Mobile Phase D contract: PASS", {
  mappingAverageMs: Number(mappingAverageMs.toFixed(4)),
});
}

void main();
