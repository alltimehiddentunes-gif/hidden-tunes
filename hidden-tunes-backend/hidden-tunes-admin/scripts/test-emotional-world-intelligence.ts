import assert from "node:assert/strict";
import { EMOTIONAL_WORLD_REGISTRY, PUBLIC_EMOTIONAL_WORLDS } from "../lib/emotionalWorldRegistry";
import { catalogFingerprint, classifySong, isBackendPlayableSong, rankWorldCatalog, scoreSongForWorld } from "../lib/emotionalWorldIntelligence";

assert.equal(EMOTIONAL_WORLD_REGISTRY.length, 48, "canonical registry must contain 48 candidates");
assert.equal(new Set(EMOTIONAL_WORLD_REGISTRY.map((world) => world.id)).size, 48, "world IDs must be unique");
assert.deepEqual(PUBLIC_EMOTIONAL_WORLDS.map((world) => world.id).sort(), ["calm", "chill", "energetic", "happy", "melancholy", "motivational", "romantic"]);
assert(EMOTIONAL_WORLD_REGISTRY.filter((world) => world.status === "draft" || world.status === "curation_required").length === 41, "unproven worlds must remain non-public");

const base = { id: "song-1", title: "Untitled", artist: "Artist", audio_url: "https://media.example/song.mp3", analysis_status: "approved" };
assert.equal(isBackendPlayableSong(base), true);
assert.equal(isBackendPlayableSong({ ...base, audio_url: "javascript:alert(1)" }), false);
const contradiction = { ...base, title: "Happy Without You", mood: "heartbreak breakup lonely", emotion: "heartbreak" };
assert.equal(scoreSongForWorld(contradiction, EMOTIONAL_WORLD_REGISTRY.find((world) => world.id === "happy")!), null, "contradictions must override title keywords");
assert(classifySong({ ...base, mood: "calm peaceful healing romantic love chill smooth" }).length <= 3, "song memberships must remain bounded");
assert(EMOTIONAL_WORLD_REGISTRY.every((world) => world.profileVersion && world.artworkKey && world.family));
assert.deepEqual(
  Object.fromEntries(["active", "draft", "curation_required", "beta"].map((status) => [status, EMOTIONAL_WORLD_REGISTRY.filter((world) => world.status === status).length])),
  { active: 7, draft: 33, curation_required: 8, beta: 0 },
);
const happy = EMOTIONAL_WORLD_REGISTRY.find((world) => world.id === "happy")!;
const tied = [
  { ...base, id: "song-c", artist_id: "artist-1", album_id: "album-1", mood: "happy" },
  { ...base, id: "song-a", artist_id: "artist-1", album_id: "album-1", mood: "happy" },
  { ...base, id: "song-b", artist_id: "artist-2", album_id: "album-2", mood: "happy" },
];
assert.deepEqual(rankWorldCatalog(tied, happy).map((entry) => entry.song.id), ["song-a", "song-b", "song-c"], "ranking and diversification must be deterministic");
assert.notEqual(catalogFingerprint([base]), catalogFingerprint([{ ...base, atmosphere: "celebratory" }]), "every scoring input must invalidate the catalog fingerprint");
console.log("PASS emotional-world-intelligence: registry=48 active=7 draft=33 curation=8 beta=0 contradictions=on membership<=3 playability=on deterministic=on diversification=on");
