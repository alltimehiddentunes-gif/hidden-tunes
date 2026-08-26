import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildEmotionalProfile } from "../lib/musicIntelligence/emotionalProfile";
import { EMPTY_LISTENER, GOLDEN_SEED_IDS, GOLDEN_SONGS } from "../lib/musicIntelligence/goldenDataset";
import { rankCandidates } from "../lib/musicIntelligence/ranker";
import { RecommendationCache } from "../lib/musicIntelligence/recommendationCache";
import { InMemoryMusicRepository, songRowEligible } from "../lib/musicIntelligence/recommendationRepositories";
import { recommendMusic } from "../lib/musicIntelligence/recommendationService";
import type { RecommendationSuccess } from "../lib/musicIntelligence/recommendationTypes";
import { parseRecommendationRequest } from "../lib/musicIntelligence/recommendationValidation";

const profiles = new Map(GOLDEN_SONGS.map((song) => [song.id, buildEmotionalProfile(song)]));
const repository = new InMemoryMusicRepository(GOLDEN_SONGS, profiles);
const request = (seedSongId: string, extra: Record<string, unknown> = {}) => ({ seedSongId, journeyIntent: "CONTINUE", limit: 10, generationToken: `g-${seedSongId}`, ...extra });
function success(value: { success: boolean }): asserts value is RecommendationSuccess { assert.equal(value.success, true); }

async function main() {
assert.throws(() => parseRecommendationRequest({ seedSongId: "x", journeyIntent: "RANDOM" }));
assert.throws(() => parseRecommendationRequest({ seedSongId: "x", recentSongIds: Array(51).fill("x") }));
assert.equal(parseRecommendationRequest({ seedSongId: "x" }).journeyIntent, "CONTINUE");

for (const seedId of GOLDEN_SEED_IDS) {
  const seed = GOLDEN_SONGS.find((song) => song.id === seedId)!;
  const expected = rankCandidates({ seed, candidates: GOLDEN_SONGS, journey: "CONTINUE", listener: EMPTY_LISTENER, profileCache: profiles, limit: 10 }).map((entry) => entry.song.id);
  const actual = await recommendMusic(request(seedId), "fixture-user", { catalog: repository, profiles: repository }); success(actual);
  assert.deepEqual(actual.recommendations.map((entry) => entry.songId), expected, `Phase A parity: ${seedId}`);
  assert.equal(actual.generationToken, `g-${seedId}`);
  assert(actual.recommendations.every((entry) => entry.rankingVersion && entry.position > 0));
}

const excluded = await recommendMusic(request("afro-heart", { recentlySkippedSongIds: ["afro-accept"], manuallyQueuedSongIds: ["soul-long"] }), "u1", { catalog: repository, profiles: repository }); success(excluded);
assert(!excluded.recommendations.some((item) => ["afro-accept", "soul-long", "afro-heart"].includes(item.songId)));
assert.equal(new Set(excluded.recommendations.map((item) => item.songId)).size, excluded.recommendations.length);

const mature = await recommendMusic(request("afro-heart"), "u1", { catalog: repository, profiles: repository }); success(mature); assert(!mature.recommendations.some((item) => item.songId === "mature"));
assert.equal(songRowEligible({ id: "x", is_public: false, audio_url: "https://x" }), false);
assert.equal(songRowEligible({ id: "x", is_public: true, audio_url: "javascript:x" }), false);
assert.equal(songRowEligible({ id: "x", is_public: true, audio_url: "https://x", review_status: "quarantined" }), false);
assert.equal(songRowEligible({ id: "x", is_public: true, audio_url: "https://x", rejection_reason: "rights" }), false);

const journeys = await Promise.all(["CONTINUE", "DEEPEN", "RECOVER", "UPLIFT"].map((journeyIntent) => recommendMusic({ ...request("grief-deep"), journeyIntent, generationToken: journeyIntent }, "u1", { catalog: repository, profiles: repository })));
assert(journeys.every((result) => result.success));
assert(new Set(journeys.map((result) => result.success ? result.recommendations.slice(0, 3).map((entry) => entry.songId).join() : "")).size > 1);

let calls = 0;
const counting = { ...repository, getSeed: async (id: string) => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return repository.getSeed(id); }, getCandidates: repository.getCandidates.bind(repository) };
const cache = new RecommendationCache<Omit<RecommendationSuccess, "generationToken" | "diagnostics">>(10, 60_000);
const same = request("afro-heart", { generationToken: "storm" });
const storm = await Promise.all(Array.from({ length: 20 }, () => recommendMusic(same, "same-user", { catalog: counting, profiles: repository, cache })));
assert(storm.every((result) => result.success)); assert.equal(calls, 1, "same request coalesced");
await recommendMusic(same, "different-user", { catalog: counting, profiles: repository, cache }); assert.equal(calls, 2, "cache account-isolated");

const missing = await recommendMusic(request("missing"), "u1", { catalog: repository, profiles: repository }); assert.equal(missing.success, false); if (!missing.success) assert.equal(missing.error, "seed_not_found");
const brokenCatalog = { getSeed: async () => { throw new Error("offline"); }, getCandidates: async () => [] };
const failed = await recommendMusic(request("afro-heart", { generationToken: "repository-failure" }), "failure-user", { catalog: brokenCatalog, profiles: repository }); assert.equal(failed.success, false); if (!failed.success) assert.equal(failed.error, "service_unavailable");
const noProfiles = new InMemoryMusicRepository(GOLDEN_SONGS);
const fallback = await recommendMusic(request("no-lyrics-afro"), "u1", { catalog: noProfiles, profiles: noProfiles }); success(fallback); assert(fallback.recommendations.length > 0);
class BrokenCache<T> extends RecommendationCache<T> { override get(): T | undefined { throw new Error("cache offline"); } override set(): void { throw new Error("cache offline"); } override async coalesce(key: string, work: () => Promise<T>): Promise<never> { void key; void work; throw new Error("cache offline"); } }
const cacheFailure = await recommendMusic(request("afro-heart", { generationToken: "cache-failure" }), "u1", { catalog: repository, profiles: repository, cache: new BrokenCache() }); success(cacheFailure);

const uncached: number[] = []; const cached: number[] = [];
for (let index = 0; index < 40; index++) { const started = performance.now(); await recommendMusic(request("afro-heart", { generationToken: `perf-${index}` }), "perf", { catalog: repository, profiles: repository, cache: new RecommendationCache() }); uncached.push(performance.now() - started); }
const perfCache = new RecommendationCache<Omit<RecommendationSuccess, "generationToken" | "diagnostics">>();
for (let index = 0; index < 40; index++) { const started = performance.now(); await recommendMusic(request("afro-heart", { generationToken: "cached" }), "perf", { catalog: repository, profiles: repository, cache: perfCache }); cached.push(performance.now() - started); }
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const result = { goldenSeeds: GOLDEN_SEED_IDS.length, parity: "PASS", eligibility: "PASS", skipExclusion: "PASS", manualExclusion: "PASS", accountIsolation: "PASS", stormCoalescing: "PASS", fallback: "PASS", cachedP50Ms: percentile(cached, .5), cachedP95Ms: percentile(cached, .95), uncachedP50Ms: percentile(uncached, .5), uncachedP95Ms: percentile(uncached, .95) };
assert(result.cachedP95Ms < 150); assert(result.uncachedP95Ms < 400); console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
