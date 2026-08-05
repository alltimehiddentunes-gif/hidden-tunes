import assert from "node:assert/strict";
import fs from "node:fs";
import {
  artworkDescriptor,
  dedupeCarPlayRows,
  formatCarPlaySubtitle,
  sanitizeCarPlayText,
} from "../services/carPlayPresentation.ts";

assert.equal(sanitizeCarPlayText(" Artist  • •  Album "), "Artist • Album");
assert.equal(sanitizeCarPlayText("https://private.example/item"), "");
assert.equal(formatCarPlaySubtitle("Song", ["Song", "Artist", "Album"]), "Artist • Album");
assert.equal(formatCarPlaySubtitle("Station", ["GB", "Rock"]), "GB • Rock");
assert.equal(formatCarPlaySubtitle("Episode", ["Show", "12:30 / 45:00"]), "Show • 12:30 / 45:00");

const rows = dedupeCarPlayRows([
  { mediaId: "song:1", title: "One", playable: true },
  { mediaId: "song:1", title: "One duplicate", playable: true },
  { mediaId: "empty:test", title: "Your music will appear here.", playable: false },
]);
assert.deepEqual(rows.map((row) => row.mediaId), ["song:1"], "content suppresses empty row and duplicates");
assert.deepEqual(dedupeCarPlayRows([
  { mediaId: "empty:test:a", title: "Empty A", playable: false },
  { mediaId: "empty:test:b", title: "Empty B", playable: false },
]).map((row) => row.mediaId), ["empty:test:a"], "one empty row per parent");

const art = artworkDescriptor("https://img.example/cover.jpg", "podcast", "row", "small");
assert.deepEqual(art, {
  source: "https://img.example/cover.jpg", fallbackKey: "podcast",
  cacheIdentity: "podcast:https://img.example/cover.jpg", role: "row", sizeClass: "small",
});
assert.equal(artworkDescriptor("javascript:alert(1)", "music", "row"), null);

const snapshot = fs.readFileSync(new URL("../services/carPlayCatalogSnapshot.ts", import.meta.url), "utf8");
const premium = fs.readFileSync(new URL("../services/carPlayPremiumCatalog.ts", import.meta.url), "utf8");
const manager = fs.readFileSync(new URL(
  "../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift", import.meta.url
), "utf8");
const nativeCatalog = fs.readFileSync(new URL(
  "../plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift", import.meta.url
), "utf8");
assert.match(snapshot, /dedupeCarPlayRows/);
assert.match(snapshot, /artworkDescriptor/);
assert.doesNotMatch(`${snapshot}\n${premium}\n${manager}`,
  /Nothing here yet|Hidden Tunes is ready|Native CarPlay interface|Music Root|Track Artist|Media Items/);
assert.match(manager, /interfaceController\.templates\.count == 1/);
assert.match(manager, /hasPendingCatalogRefresh/);
assert.match(manager, /logical_template_already_in_stack/);
assert.match(manager, /reason": "duplicate_tap"/);
assert.match(manager, /#if DEBUG[\s\S]*carplay_navigation_latency/);
assert.doesNotMatch(manager, /UIWindow\(|RCTRootView|setInterval|setTimeout/);
const recommendedBranch = nativeCatalog.slice(nativeCatalog.indexOf('if parentId == "made_for_you"'),
  nativeCatalog.indexOf("let nodes = childrenByParent", nativeCatalog.indexOf('if parentId == "made_for_you"')));
assert.doesNotMatch(recommendedBranch, /childrenByParent\["music"\]|playableBrowseNodes/,
  "Recommended never substitutes raw music");

console.log("carplay-premium-browse: PASS");
