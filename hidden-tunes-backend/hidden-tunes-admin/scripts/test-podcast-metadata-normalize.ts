import assert from "node:assert/strict";

import {
  normalizePodcastCountryCode,
  normalizePodcastLanguage,
  normalizePodcastTitleKey,
  parsePodcastExplicitFlag,
} from "../lib/podcastMetadataNormalize";

assert.equal(normalizePodcastLanguage("en-US"), "en");
assert.equal(normalizePodcastLanguage("es-MX"), "es");
assert.equal(normalizePodcastCountryCode("us"), "US");
assert.equal(normalizePodcastCountryCode("usa"), null);
assert.equal(parsePodcastExplicitFlag("yes"), true);
assert.equal(parsePodcastExplicitFlag("no"), false);
assert.equal(
  normalizePodcastTitleKey("Hidden Tunes: Test Podcast!"),
  "hidden tunes test podcast"
);

console.log("podcast metadata normalize tests passed");
