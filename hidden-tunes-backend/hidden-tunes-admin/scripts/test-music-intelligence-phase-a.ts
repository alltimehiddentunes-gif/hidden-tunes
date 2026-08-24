import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { appendAutoQueueAfterManual, eligibleCandidates } from "../lib/musicIntelligence/candidateGeneration";
import { rankCurrentBaseline } from "../lib/musicIntelligence/currentBaseline";
import { emotionalCompatibility } from "../lib/musicIntelligence/emotionalCompatibility";
import { buildEmotionalProfile } from "../lib/musicIntelligence/emotionalProfile";
import { EMPTY_LISTENER, GOLDEN_SEED_IDS, GOLDEN_SONGS } from "../lib/musicIntelligence/goldenDataset";
import { normalizeLyrics } from "../lib/musicIntelligence/lyricsNormalization";
import { rankCandidates } from "../lib/musicIntelligence/ranker";
import type { JourneyMode, LabSong, ListenerSignals } from "../lib/musicIntelligence/types";

const byId = (id: string) => {
  const found = GOLDEN_SONGS.find((song) => song.id === id);
  assert(found, `missing fixture ${id}`); return found;
};
const rank = (seedId: string, journey: JourneyMode = "CONTINUE", listener: ListenerSignals = EMPTY_LISTENER) => rankCandidates({ seed: byId(seedId), candidates: GOLDEN_SONGS, journey, listener, limit: 10 });

assert.equal(normalizeLyrics("[ar:Test]\n[00:12.34] Broken heart\n[01:03] begin again"), "broken heart begin again");
const lrcProfile = buildEmotionalProfile({ ...byId("afro-heart"), lyrics: "[00:01.00] broken heart\n[00:12.00] but now I begin again", lyricsProvenance: "trusted_lrc" });
assert.equal(lrcProfile.direction, "recovering");
assert.equal(lrcProfile.lyricsProvenance, "trusted_lrc");
assert(lrcProfile.confidence > buildEmotionalProfile(byId("no-lyrics-afro")).confidence);

const heartbreak = rank("afro-heart");
assert(heartbreak.findIndex((x) => x.song.id === "soul-long") < heartbreak.findIndex((x) => x.song.id === "afro-party"), "lyrics meaning must beat same-genre party conflict");
const gospel = rank("gospel-victory");
assert(gospel.findIndex((x) => x.song.id === "worship-triumph") < gospel.findIndex((x) => x.song.id === "gospel-grief"), "victorious worship must beat same-genre grief");

const recover = rank("afro-heart", "RECOVER").slice(0, 5).map((x) => x.song.id);
const deepen = rank("afro-heart", "DEEPEN").slice(0, 5).map((x) => x.song.id);
const uplift = rank("afro-heart", "UPLIFT").slice(0, 5).map((x) => x.song.id);
assert.notDeepEqual(recover, deepen); assert.notDeepEqual(uplift, deepen);
assert(recover.some((id) => ["afro-accept", "rnb-reflect", "grief-heal"].includes(id)));
assert(uplift.some((id) => ["confidence-afro", "motivation-rise", "worship-triumph", "afro-party", "amapiano-party"].includes(id)));

const skippedListener = { ...EMPTY_LISTENER, immediateSkips: ["soul-long"] };
assert(!rank("afro-heart", "CONTINUE", skippedListener).some((x) => x.song.id === "soul-long"));
assert(!heartbreak.some((x) => ["unplayable", "unpublished", "mature", "afro-heart"].includes(x.song.id)));
assert.equal(new Set(heartbreak.map((x) => x.song.id)).size, heartbreak.length);
assert(Math.max(...[...new Set(heartbreak.map((x) => x.song.artistId))].map((artist) => heartbreak.filter((x) => x.song.artistId === artist).length)) <= 2);

const manual: LabSong[] = [byId("afro-party"), byId("gospel-victory")];
const appended = appendAutoQueueAfterManual(manual, heartbreak.map((x) => x.song));
assert.deepEqual(appended.slice(0, 2).map((x) => x.id), manual.map((x) => x.id));
assert.equal(eligibleCandidates({ seed: byId("afro-heart"), candidates: GOLDEN_SONGS, journey: "CONTINUE", listener: EMPTY_LISTENER }).length <= 160, true);
const noLyricsResults = rank("no-lyrics-afro");
assert(noLyricsResults.length >= 10);
assert(noLyricsResults.slice(0, 5).filter((x) => x.song.genre === "Afrobeats").length >= 3);
assert.equal(buildEmotionalProfile(byId("no-lyrics-afro")).analysisSource, "metadata_fallback_v1");

function incompatibility(seed: LabSong, songs: LabSong[]) {
  const seedProfile = buildEmotionalProfile(seed);
  return songs.filter((song) => emotionalCompatibility(seedProfile, buildEmotionalProfile(song)) < .2).length;
}

const comparisons = GOLDEN_SEED_IDS.map((seedId) => {
  const seed = byId(seedId);
  const baseline = rankCurrentBaseline(seed, GOLDEN_SONGS);
  const repaired = rankCandidates({ seed, candidates: GOLDEN_SONGS, journey: "CONTINUE", listener: EMPTY_LISTENER, limit: 10 });
  return {
    seed: seedId,
    baseline: baseline.map((x) => x.id),
    repaired: repaired.map((x) => x.song.id),
    baselineIncompatible: incompatibility(seed, baseline),
    repairedIncompatible: incompatibility(seed, repaired.map((x) => x.song)),
    topExplanation: repaired[0]?.reasons,
  };
});
const semanticComparisons = comparisons.filter((row) => buildEmotionalProfile(byId(row.seed)).confidence >= .6);
const baselineBad = semanticComparisons.reduce((n, row) => n + row.baselineIncompatible, 0);
const repairedBad = semanticComparisons.reduce((n, row) => n + row.repairedIncompatible, 0);
assert(repairedBad < baselineBad, `expected incompatibility improvement (${baselineBad} -> ${repairedBad})`);

const profileTimings: number[] = [];
for (let i = 0; i < 600; i += 1) {
  const start = performance.now(); buildEmotionalProfile(GOLDEN_SONGS[i % GOLDEN_SONGS.length]); profileTimings.push(performance.now() - start);
}
const profileCache = new Map(GOLDEN_SONGS.map((song) => [song.id, buildEmotionalProfile(song)]));
const timings: number[] = []; const cachedTimings: number[] = [];
for (let i = 0; i < 600; i += 1) {
  const start = performance.now(); rank(GOLDEN_SEED_IDS[i % GOLDEN_SEED_IDS.length]); timings.push(performance.now() - start);
  const cachedStart = performance.now();
  rankCandidates({ seed: byId(GOLDEN_SEED_IDS[i % GOLDEN_SEED_IDS.length]), candidates: GOLDEN_SONGS, journey: "CONTINUE", listener: EMPTY_LISTENER, limit: 10, profileCache });
  cachedTimings.push(performance.now() - cachedStart);
}
for (const values of [profileTimings, timings, cachedTimings]) values.sort((a, b) => a - b);
const percentile = (values: number[], p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
const report = {
  status: "PASS", fixtureCount: GOLDEN_SONGS.length, seedCount: GOLDEN_SEED_IDS.length,
  semanticConflicts: { afrobeats: "PASS", gospel: "PASS" },
  journeyModesDistinct: true, manualQueuePreserved: true, immediateSkipExcluded: true,
  unavailableRate: 0, duplicateRate: 0, maxArtistOccurrences: 2,
  incompatibility: { evaluableSeeds: semanticComparisons.length, baseline: baselineBad, repaired: repairedBad, improvementPercent: Number(((baselineBad - repairedBad) / Math.max(1, baselineBad) * 100).toFixed(1)) },
  performanceMs: {
    runs: timings.length,
    profile: { p50: Number(percentile(profileTimings, .5).toFixed(3)), p95: Number(percentile(profileTimings, .95).toFixed(3)) },
    uncachedRanking: { p50: Number(percentile(timings, .5).toFixed(3)), p95: Number(percentile(timings, .95).toFixed(3)) },
    cachedRanking: { p50: Number(percentile(cachedTimings, .5).toFixed(3)), p95: Number(percentile(cachedTimings, .95).toFixed(3)) },
    candidateBound: 160,
  },
  comparisons,
};
console.log(JSON.stringify(report, null, 2));
