import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(
  "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift",
  "utf8"
);
const catalog = fs.readFileSync(
  "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift",
  "utf8"
);
const artwork = fs.readFileSync(
  "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayArtworkLoader.swift",
  "utf8"
);

const applyStart = manager.indexOf("func applyCatalogSnapshot(");
const applyEnd = manager.indexOf("// MARK: - Safe fallback root", applyStart);
const applySnapshot = manager.slice(applyStart, applyEnd);
assert.match(applySnapshot, /snapshotData == lastCatalogSnapshotData[\s\S]*return/, "identical snapshot cannot rebuild templates");
assert.match(applySnapshot, /lastCatalogSnapshotData = snapshotData[\s\S]*reloadTemplates\(\)/, "only changed snapshots request refresh");
assert.match(manager, /hasPendingCatalogRefresh/, "single pending refresh remains");
assert.match(manager, /interfaceController\.templates\.count == 1/, "child navigation blocks refresh");

assert.equal(/progress|positionMillis|buffering/.test(applySnapshot), false, "playback progress cannot refresh browse templates");
assert.equal(manager.includes("updateTemplates("), false, "no updateTemplates path");
assert.equal(manager.includes("presentTemplate("), false, "Search crash fix remains");
assert.equal(manager.includes("CPSearchTemplate("), false, "navigation-only Search remains absent");

assert.match(artwork, /maximumConcurrentRequests = 3/, "artwork concurrency capped at three");
assert.match(artwork, /tasks\[key\] != nil \|\| pending\[key\] != nil/, "duplicate artwork requests coalesce");
assert.match(artwork, /CGImageSourceCreateThumbnailAtIndex/, "remote image is downsampled");
assert.equal(artwork.includes("Data(contentsOf:"), false, "no synchronous artwork network read");
assert.match(artwork, /queue\.qualityOfService = \.utility/, "decode runs off main");
assert.match(manager, /cachedArtwork \?\? fallbackArtwork/, "cached image is assigned during row creation");
assert.match(manager, /cachedArtwork == nil[\s\S]*item\.setImage\(image\)/, "only cache misses schedule setImage");
const imageCallback = manager.slice(manager.indexOf("if cachedArtwork == nil"), manager.indexOf("item.handler =", manager.indexOf("if cachedArtwork == nil")));
assert.equal(imageCallback.includes("updateSections"), false, "artwork callback does not replace sections");
assert.equal(imageCallback.includes("setRootTemplate"), false, "artwork callback does not replace root");
assert.match(manager, /fallbackArtworkCache\[symbol\]/, "fallback SF Symbols are cached");

for (const [name, value] of [
  ["continueListening", 6], ["recentlyPlayed", 8], ["radio", 8],
  ["artists", 24], ["albums", 24], ["genres", 16],
  ["playlists", 12], ["playlistTracks", 24], ["search", 30],
] as const) {
  assert.match(catalog, new RegExp(`${name}: ${value}`), `${name} cap`);
}
assert.match(manager, /children\.prefix\(HiddenAudioCarPlayCatalog\.limits\.browseNodes\)/, "child cap applied before CPListItem creation");

const rowBuilder = manager.slice(manager.indexOf("private func makeListItem("), manager.indexOf("private func fallbackArtwork", manager.indexOf("private func makeListItem(")));
assert.equal(rowBuilder.includes("HiddenAudioCarPlayCatalog.children"), false, "row construction performs no catalogue search");
assert.equal(rowBuilder.includes("selectPlayable"), false, "row construction performs no queue resolution");
assert.equal(rowBuilder.includes("NSLog"), false, "no per-row native log");
assert.equal(artwork.includes("NSLog"), false, "no per-artwork production log");

console.log("carplay-scroll-stability: PASS");
