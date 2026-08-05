import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift", "utf8");
const catalog = fs.readFileSync("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift", "utf8");
const plugin = fs.readFileSync("plugins/hidden-audio/index.js", "utf8");
const snapshot = fs.readFileSync("services/carPlayCatalogSnapshot.ts", "utf8");

const openStart = manager.indexOf("private func presentSearchTemplate()");
const openEnd = manager.indexOf("private func ensureSessionConfiguration()", openStart);
const search = manager.slice(openStart, openEnd);
const discoveryStart = manager.indexOf("private func makeSearchDiscoverySections()");
const discoveryEnd = manager.indexOf("private func pushTemplateSafely(", discoveryStart);
const discovery = manager.slice(discoveryStart, discoveryEnd);
assert.ok(openStart >= 0 && openEnd > openStart, "Search opening path exists");
assert.match(search, /let search = CPListTemplate/, "Search opens an audio-safe visible list");
assert.match(search, /makeSearchDiscoverySections\(\)/, "Search contains actionable discovery");
assert.match(discovery, /remaining = HiddenAudioCarPlayCatalog\.limits\.search/, "screen is capped at 30");
assert.match(discovery, /Recently Played/, "recent playback section");

for (const domain of [
  "Artists", "Albums", "Songs", "Podcasts", "Audiobooks", "Radio",
  "Playlists", "Genres", "Moods & Emotional Worlds",
]) {
  assert.ok(discovery.includes(`title: "${domain}"`), `${domain} is discoverable`);
}

assert.match(catalog, /boundedVoiceSearchResults\(query:/, "bounded voice-query resolver exists");
assert.match(catalog, /emotionalTerms/, "emotional phrases map to recommendations");
assert.match(catalog, /updateSearchResults\(query: normalized\)/, "voice query uses canonical track index");
assert.match(catalog, /matches\.count >= limits\.search/, "query results capped at 30");
assert.match(manager, /selectPlayable\(mediaId: node\.mediaId, parentId: parentId\)/, "result uses authoritative playback");
assert.match(manager, /scheduleNowPlayingAfterSelectionCompletion\(\)/, "result updates Now Playing");

assert.equal(manager.includes("CPSearchTemplate("), false, "unsupported text template absent");
assert.equal(manager.includes("presentTemplate("), false, "unsupported modal path absent");
assert.match(manager, /logical_template_already_in_stack/, "rapid duplicate Search is rejected");
assert.match(manager, /stale_push_completion/, "disconnect/reconnect is generation safe");

// Apple requires an INPlayMediaIntent handler before an assistant cell is
// functional. This project does not yet include that target, so it must not
// display a dead/fake Siri control.
assert.equal(manager.includes("CPAssistantCellConfiguration("), false, "no assistant cell without intent handler");
assert.equal(plugin.includes("INPlayMediaIntent"), false, "plugin does not claim a missing intent target");

assert.match(snapshot, /isCarPlayContentVisible/, "phone mature authority filters snapshot");
assert.match(snapshot, /tracks: 80/, "registry remains bounded");
console.log("carplay-functional-search: PASS");
