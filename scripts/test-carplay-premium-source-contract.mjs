import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const premium = read("services/carPlayPremiumCatalog.ts");
const bridge = read("services/carPlayCatalogBridge.ts");
const resolver = read("services/carPlayMediaResolver.ts");
const manager = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift");
const catalog = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayCatalog.swift");
const player = read("context/PlayerContext.tsx");

assert.match(premium, /loadPodcastRecentlyPlayed/);
assert.match(premium, /getSavedPodcastEpisodes/);
assert.match(premium, /getFollowedPodcastShows/);
assert.match(premium, /listAudiobookProgress/);
assert.match(premium, /fetchAudiobookChapterQueuePlay/);
assert.match(premium, /loadRecentlyPlayedRadioItems/);
assert.match(premium, /readCachedRadioStations/);
assert.match(premium, /isCarPlayContentVisible/);
assert.doesNotMatch(premium, /setInterval|setTimeout/);
assert.doesNotMatch(premium, /fetchAudiobooksBrowse|fetchPodcastShows\(/);
assert.match(bridge, /collectCarPlayPremiumCatalog\(\{ allowNetwork, preferences \}\)/);
assert.match(bridge, /publishCarPlayCatalogSnapshot\(true\)/);
assert.match(resolver, /const domainQueue = isRadio \? \[song\] : queue/);
assert.match(resolver, /queueType: "podcast"/);
assert.match(resolver, /queueType: "audiobook"/);
assert.match(resolver, /queueType: "live_radio"/);
assert.match(player, /resolved\.resumePositionMillis > 0/);
assert.match(manager, /private var hasPendingCatalogRefresh = false/);
assert.match(manager, /interfaceController\.templates\.count == 1/);
assert.match(manager, /interfaceController\.presentedTemplate == nil/);
assert.match(manager, /templateDidAppear/);
assert.match(manager, /guard HiddenAudioCarPlayCatalog\.track\(for: mediaId\) != nil/);
assert.match(catalog, /for trackMap in tracks\.prefix\(80\)/);
assert.match(catalog, /if matches\.count >= limits\.search/);
assert.doesNotMatch(catalog, /if track\.isLiveStream \{ continue \}/);

console.log("carplay-premium-source-contract: PASS");
