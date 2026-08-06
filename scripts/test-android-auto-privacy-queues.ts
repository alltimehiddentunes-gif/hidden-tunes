import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isAndroidAutoContentVisible } from "../services/androidAutoVisibility";

const playable = { id: "clean", title: "Clean", artist: "Artist", url: "https://media/clean.mp3" };

for (const domain of ["music", "radio", "podcast", "audiobook"] as const) {
  assert.equal(isAndroidAutoContentVisible({ ...playable, is_mature: true }, domain, { allowMature: false }), false,
    `mature ${domain} must be hidden`);
  assert.equal(isAndroidAutoContentVisible({ ...playable, is_mature: true }, domain, { allowMature: true }), true,
    `permitted mature ${domain} must remain visible`);
}
for (const matureShape of [{ isMature: true }, { isExplicit: true },
  { contentRating: "explicit" }, { matureLevel: "mature" }]) {
  assert.equal(isAndroidAutoContentVisible({ ...playable, ...matureShape }, "music", { allowMature: false }), false);
}
for (const item of [
  { ...playable, is_public: false },
  { ...playable, published: false },
  { ...playable, quarantined: true },
  { ...playable, disabled: true },
  { ...playable, url: "javascript:bad" },
  { ...playable, contentType: "video" },
  { ...playable, contentType: "sports" },
]) assert.equal(isAndroidAutoContentVisible(item, "music", { allowMature: true }), false);

const songs = [
  { ...playable, id: "one", title: "One", album: "Record", genre: "Rock" },
  { ...playable, id: "two", title: "Two", album: "Record", genre: "Rock", url: "https://media/two.mp3" },
  { ...playable, id: "private", is_public: false },
];
const contextualize = (parentId: string, ordered: typeof songs) => ordered
  .filter((song) => isAndroidAutoContentVisible(song, "music", { allowMature: true }))
  .map((song) => ({ ...song, parentId,
    mediaId: parentId === "recently_added" ? `song:${song.id}`
      : `song:${song.id}:ctx:${encodeURIComponent(parentId)}` }));
const sections = [
  ["recently_added", songs], ["artist:artist", songs], ["album:record", songs],
  ["genre:rock", songs], ["playlist:mix", [songs[1], songs[0], songs[2]]],
] as const;
for (const [parentId, ordered] of sections) {
  const queue = contextualize(parentId, [...ordered]);
  assert.equal(queue.length, 2);
  assert.equal(new Set(queue.map((item) => item.mediaId)).size, queue.length);
  assert.ok(queue.every((item) => item.url.startsWith("https://") && item.parentId === parentId));
}
assert.deepEqual(
  contextualize("playlist:mix", [songs[1], songs[0], songs[2]]).map((item) => item.title),
  ["Two", "One"],
  "playlist order must remain exact"
);

const sync = fs.readFileSync(path.resolve("services/androidAutoCatalogSync.ts"), "utf8");
assert.match(sync, /const LIMITS = \{[\s\S]*tracks: 420/);
assert.match(sync, /contextualSongMediaId/);
assert.match(sync, /parentId,[\s\S]*canonicalId: id/);
for (const context of ["artistSongs", "albumSongs", "genreSongs", "playlistSongs"])
  assert.match(sync, new RegExp(`const ${context} = [\\s\\S]*?isAndroidAutoContentVisible`));

const native = fs.readFileSync(path.resolve("plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt"), "utf8");
assert.match(native, /SNAPSHOT_SCHEMA_VERSION = 3/);
assert.match(native, /profileNamespace\.isBlank\(\)/);
assert.match(native, /isMature && !isMatureDomainAllowed\(contentType\)/);
assert.match(native, /maturePodcastAllowed/);
assert.match(native, /prefs\?\.edit\(\)\?\.remove\(PREFS_KEY\)/);
assert.match(native, /getTrack\(mediaId: String\).*isMatureDomainAllowed\(it\.contentType\)/s);

const auth = fs.readFileSync(path.resolve("services/mobileSupabaseAuth.ts"), "utf8");
assert.match(auth, /getCurrentSupabaseProfileNamespace/);
assert.match(auth, /invalidateAndroidAutoProfileSnapshot/);
const signInBody = auth.slice(
  auth.indexOf("export async function signInArtistWithPassword"),
  auth.indexOf("export async function signOutArtistSession")
);
assert.match(signInBody, /invalidateAndroidAutoProfileSnapshot/,
  "profile replacement invalidates the former Android Auto snapshot");
assert.match(signInBody, /syncAndroidAutoCatalogFromDerived/,
  "profile replacement publishes the new profile snapshot");
const bridge = fs.readFileSync(path.resolve("services/androidAutoCatalogBridge.ts"), "utf8");
assert.match(bridge, /snapshot\.profileNamespace/);
assert.match(bridge, /snapshot\.matureAllowed/);
assert.match(bridge, /snapshot\.maturePodcastAllowed/);
assert.match(bridge, /subscribeMaturePodcastSettings/);
assert.match(bridge, /profileNamespace === "anonymous"[\s\S]*premiumTracks: \[\]/);

const resolver = fs.readFileSync(path.resolve("services/androidAutoMediaResolver.ts"), "utf8");
assert.match(resolver, /isAndroidAutoContentVisible\(resolved\.song, "music"\)/,
  "catalog fallback revalidates music at playback time");
assert.match(resolver, /isAndroidAutoContentVisible\(station, "radio"\)/,
  "radio fallback revalidates visibility at playback time");
assert.match(resolver, /episode\.audioUrl[\s\S]*"podcast"/,
  "podcast fallback revalidates visibility at playback time");

console.log("test-android-auto-privacy-queues: PASS");
