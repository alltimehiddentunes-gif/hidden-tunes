import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL(
  "../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift", import.meta.url
), "utf8");
const loader = fs.readFileSync(new URL(
  "../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayArtworkLoader.swift", import.meta.url
), "utf8");
const catalog = fs.readFileSync(new URL(
  "../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift", import.meta.url
), "utf8");
const snapshot = fs.readFileSync(new URL("../services/carPlayCatalogSnapshot.ts", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../services/carPlayCatalogBridge.ts", import.meta.url), "utf8");
const phone = fs.readFileSync(new URL("../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift", import.meta.url), "utf8");

assert.match(manager, /CPListItem\.maximumImageSize/);
assert.match(manager, /carTraitCollection\.displayScale/);
assert.match(manager, /item\.setImage\(image\)/);
assert.match(manager, /CPListItem\(text: node\.title,[\s\S]*image: fallback\)/);
assert.match(manager, /activeConnectionGeneration == generation/);
assert.match(manager, /listItemMediaIds\[ObjectIdentifier\(item\)\] == node\.mediaId/);
assert.match(manager, /cancelOutstandingRequests\(\)/);
assert.doesNotMatch(manager, /updateSections[\s\S]{0,300}setImage/);

for (const symbol of ["person.crop.square", "square.stack", "music.note.list",
  "dot.radiowaves.left.and.right", "mic", "book", "music.note"]) {
  assert.ok(manager.includes(symbol), `content fallback ${symbol}`);
}

assert.match(loader, /maximumEntryCount = 48/);
assert.match(loader, /maximumMemoryBytes = 6 \* 1024 \* 1024/);
assert.match(loader, /maximumConcurrentRequests = 3/);
assert.match(loader, /requestTimeoutSeconds: TimeInterval = 8/);
assert.match(loader, /CGImageSourceCreateThumbnailAtIndex/);
assert.match(loader, /queue\.qualityOfService = \.utility/);
assert.match(loader, /tasks\[key\] != nil[\s\S]*completions\[key, default: \[\]\]\.append/);
assert.match(loader, /payload\.count <= Self\.maximumMemoryBytes/);
assert.match(loader, /cache\.countLimit = Self\.maximumEntryCount/);
assert.match(loader, /cache\.totalCostLimit = Self\.maximumMemoryBytes/);

assert.match(catalog, /artworkUrl: \(item\["artworkUrl"\] as\? String\) \?\? ""/);
assert.match(snapshot, /isCarPlayContentVisible/);
assert.match(bridge, /configureCarPlayMatureVisibility\(shouldIncludeMatureInApi\)/);
assert.match(manager, /CPNowPlayingTemplate\.shared/);
assert.match(phone, /MPMediaItemPropertyArtwork/);
assert.doesNotMatch(`${manager}\n${loader}`, /RCTRootView|UIWindow\(/);

console.log("carplay-premium-artwork: PASS");
