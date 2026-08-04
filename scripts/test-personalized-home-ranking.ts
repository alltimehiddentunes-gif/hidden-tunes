import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildListenerPreferenceMaps,
  diversifyRankedSongs,
  filterEligibleHomeSongs,
  rankRelevantNewReleases,
  rankSongsForListener,
  selectPersonalizedHomeOrdering,
} from "../services/listenerRanking";

const NOW = Date.UTC(2026, 7, 4);
const song = (id: string, genre: string, artist: string, ageDays = 0, raw = {}) => ({
  id,
  title: id,
  genre,
  artist,
  artwork: `https://images.example/${id}.jpg`,
  cover: `https://images.example/${id}.jpg`,
  thumbnail: `https://images.example/${id}.jpg`,
  url: `https://audio.example/${id}.mp3`,
  streamUrl: `https://audio.example/${id}.mp3`,
  createdAt: new Date(NOW - ageDays * 86_400_000).toISOString(),
  sourceName: "Hidden Tunes" as const,
  type: "r2" as const,
  isOnline: true as const,
  raw,
});

const metal = Array.from({ length: 20 }, (_, index) =>
  song(`metal-${index}`, "Metal", `Metal Artist ${index % 5}`)
);
const afrobeats = Array.from({ length: 16 }, (_, index) =>
  song(`afrobeats-${index}`, "Afrobeats", `Afro Artist ${index % 5}`, 20 + index)
);
const gospel = Array.from({ length: 12 }, (_, index) =>
  song(`gospel-${index}`, "Gospel", `Gospel Artist ${index % 4}`, 10 + index)
);
const catalog = [...metal, ...afrobeats, ...gospel];

const afroMaps = buildListenerPreferenceMaps([], [], { genres: ["Afrobeats", "R&B"] });
const afroHome = diversifyRankedSongs(rankSongsForListener(catalog, afroMaps), 12, 4, 10);
assert.ok(afroHome.slice(0, 8).every((item) => item.genre === "Afrobeats"));
const afroNew = rankRelevantNewReleases(catalog, afroMaps, 10, 0.1);
assert.ok(afroNew.filter((item) => item.genre === "Metal").length <= 1);

const metalMaps = buildListenerPreferenceMaps([], [], { genres: ["Metal"] });
const metalNew = rankRelevantNewReleases(catalog, metalMaps, 10, 0.1);
assert.ok(metalNew.filter((item) => item.genre === "Metal").length >= 5);

const gospelMaps = buildListenerPreferenceMaps([], [], { genres: ["Gospel"] });
const gospelNew = rankRelevantNewReleases(catalog, gospelMaps, 10, 0.1);
assert.ok(gospelNew.filter((item) => item.genre === "Metal").length <= 1);

const onboardingHome = rankSongsForListener(catalog, afroMaps);
assert.equal(onboardingHome[0].genre, "Afrobeats");

const coldStart = rankRelevantNewReleases(catalog, buildListenerPreferenceMaps(), 10, 0.1);
assert.ok(coldStart.length > 0 && coldStart.length <= 10);
assert.ok(new Set(coldStart.map((item) => item.artist)).size > 1);
assert.ok(new Set(coldStart.map((item) => item.genre)).size > 1);

const target = song("target", "Afrobeats", "Target Artist", 100);
const repeatMaps = buildListenerPreferenceMaps([{ ...target, playCount: 5 }]);
const singlePlayMaps = buildListenerPreferenceMaps([{ ...metal[0], playCount: 1 }], [], {
  genres: ["Afrobeats"],
});
assert.equal(rankSongsForListener([target, ...metal], repeatMaps)[0].id, "target");
assert.equal(rankSongsForListener([...metal, ...afrobeats], singlePlayMaps)[0].genre, "Afrobeats");

const favoriteMaps = buildListenerPreferenceMaps([], [target]);
assert.equal(rankSongsForListener([metal[0], target], favoriteMaps)[0].id, "target");

const stableA = rankRelevantNewReleases(catalog, afroMaps, 10, 0.1).map((item) => item.id);
const stableB = rankRelevantNewReleases(catalog, afroMaps, 10, 0.1).map((item) => item.id);
assert.deepEqual(stableA, stableB);

const mature = song("mature", "Afrobeats", "Mature Artist", 0, { is_mature: true });
const quarantined = song("quarantined", "Afrobeats", "Q Artist", 0, { status: "quarantined" });
const unplayable = { ...song("unplayable", "Afrobeats", "U Artist"), streamUrl: "", url: "" };
const duplicate = { ...afrobeats[0], id: "duplicate-id" };
const eligible = filterEligibleHomeSongs([mature, quarantined, unplayable, afrobeats[0], duplicate]);
assert.deepEqual(eligible.map((item) => item.id), [afrobeats[0].id]);

const artistFlood = Array.from({ length: 20 }, (_, index) =>
  song(`flood-${index}`, `Genre ${index % 6}`, "One Artist")
);
assert.ok(diversifyRankedSongs(artistFlood, 20, 4, 10).length <= 4);
const genreFlood = Array.from({ length: 20 }, (_, index) =>
  song(`genre-flood-${index}`, "One Genre", `Artist ${index}`)
);
assert.ok(diversifyRankedSongs(genreFlood, 20, 4, 6).length <= 6);

for (const ratio of [0, 0.05, 0.1, 0.15, 1]) {
  const lane = rankRelevantNewReleases(catalog, afroMaps, 20, ratio);
  const unrelated = lane.filter((item) => item.genre !== "Afrobeats").length;
  assert.ok(unrelated >= 1 && unrelated <= 3);
}

const existing = catalog.slice(0, 10);
const personalized = [...existing].reverse();
assert.strictEqual(selectPersonalizedHomeOrdering(false, existing, personalized), existing);
assert.strictEqual(selectPersonalizedHomeOrdering(true, existing, []), existing);
assert.strictEqual(selectPersonalizedHomeOrdering(true, existing, personalized), personalized);

const cacheSource = readFileSync("services/discoveryCache.ts", "utf8");
const homeSource = readFileSync("app/music-feed.tsx", "utf8");
assert.match(cacheSource, /MAX_DISCOVERY_INPUT_SONGS = 220/);
assert.match(cacheSource, /\.slice\(0, MAX_DISCOVERY_INPUT_SONGS\)/);
assert.match(cacheSource, /if \(cachedKey === key && cachedSnapshot\)/);
assert.doesNotMatch(cacheSource, /setInterval|setTimeout|addEventListener/);
assert.match(homeSource, /HOME_FIRST_PAGE_LIMIT = 100/);
assert.match(homeSource, /limit: HOME_FIRST_PAGE_LIMIT/);
assert.match(homeSource, /personalizedHomeEnabled: PERSONALIZED_HOME_RANKING_ENABLED/);
assert.doesNotMatch(homeSource, /EXPO_PUBLIC_ENABLE_PERSONALIZED_HOME\s*=\s*["']true/);

console.log(
  "PASS personalized Home Phase 1: relevance, safety, caps, discovery, stability, cache, bounds, flags"
);
