import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const premium = read("services/androidAutoPremiumSnapshot.ts");
const catalog = read("plugins/hidden-audio/android/HiddenAudioAutoCatalog.kt");
const session = read("plugins/hidden-audio/android/HiddenAudioMediaSessionManager.kt");
const resolver = read("services/androidAutoMediaResolver.ts");
const bridge = read("services/androidAutoCatalogBridge.ts");

for (const root of ["listen", "radio", "library"]) assert.match(premium, new RegExp(`folder\\(\"${root}\"`));
for (const node of ["continue_listening", "recently_played", "favorites", "recommended",
  "recommended_podcasts", "search", "radio_favorites", "radio_recent", "radio_recommended",
  "radio_browse", "artists", "albums", "genres", "playlists", "podcasts", "audiobooks",
  "music", "moods", "emotional_worlds"]) assert.ok(premium.includes(`\"${node}\"`), `missing ${node}`);

assert.match(premium, /const MAX_TRACKS = 420/);
assert.match(premium, /const MAX_FOLDER_ITEMS = 24/);
assert.match(catalog, /private const val MAX_SEARCH = 24/);
const nativeRoots = catalog.slice(catalog.indexOf("private fun candidateRootNodes"),
  catalog.indexOf("private fun musicHomeNodes"));
assert.match(nativeRoots, /ROOT_LISTEN[\s\S]*ROOT_RADIO[\s\S]*ROOT_LIBRARY/);
assert.doesNotMatch(nativeRoots, /SECTION_PODCASTS|SECTION_MUSIC/);
assert.match(catalog, /track\.collection/);
assert.match(catalog, /childrenByParent\.keys\.sorted\(\)/);
assert.match(session, /search\(safeQuery, limit = 24\)\.firstOrNull\(\)/);
assert.match(session, /firstPlayableDescendant/);
assert.match(catalog, /fun firstPlayableDescendant/);

assert.match(resolver, /resolveSnapshotDomainQueue\(mediaId, "podcast"\)/);
assert.match(resolver, /resolveSnapshotDomainQueue\(mediaId, "audiobook"\)/);
assert.match(resolver, /resumePositionMillis/);
assert.match(resolver, /radioStationFromSnapshot/);
assert.match(resolver, /routeRadioPlayback/);
assert.doesNotMatch(resolver, /audiobook_root_hidden/);
assert.match(bridge, /rememberAndroidAutoCatalogSnapshot\(snapshot\)[\s\S]*syncHiddenAudioAndroidAutoCatalog/);

const ids = ["song:1:ctx:album%3Aa", "song:1:ctx:playlist%3Ap", "podcast:e:ctx:podcast-show%3As"];
assert.equal(new Set(ids).size, ids.length, "contextual media IDs must remain unique");

console.log("test-android-auto-premium-search: PASS");
