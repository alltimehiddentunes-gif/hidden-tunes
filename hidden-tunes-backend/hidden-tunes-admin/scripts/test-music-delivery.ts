import assert from "node:assert/strict";

import {
  getMusicRenditionStorageKey,
  isMusicPlaybackAuthorized,
  selectMusicRendition,
} from "../lib/musicPlaybackResolver";

const versions = {
  ultraLight: { r2Key: "songs/test/ultra-light.m4a", bitrateKbps: 64 },
  standard: { r2Key: "songs/test/standard.m4a", bitrateKbps: 160 },
};

assert.equal(selectMusicRendition(versions, "data_saver")?.tier, "ultraLight");
assert.equal(selectMusicRendition(versions, "automatic")?.tier, "standard");
assert.equal(selectMusicRendition(versions, "high_quality")?.tier, "standard");
assert.equal(selectMusicRendition(versions, "lossless")?.tier, "standard");
assert.equal(
  getMusicRenditionStorageKey(selectMusicRendition(versions, "automatic")?.rendition || null),
  "songs/test/standard.m4a"
);

const allowed = {
  is_public: true,
  rights_status: "licensed",
  rights_expires_at: "2026-07-14T00:00:00.000Z",
  rights_regions: ["DE", "GB"],
};
const now = new Date("2026-07-13T12:00:00.000Z");
assert.equal(isMusicPlaybackAuthorized(allowed, "DE", now), true);
assert.equal(isMusicPlaybackAuthorized(allowed, "US", now), false);
assert.equal(isMusicPlaybackAuthorized({ ...allowed, is_public: false }, "DE", now), false);
assert.equal(
  isMusicPlaybackAuthorized({ ...allowed, rights_status: "revoked" }, "DE", now),
  false
);
assert.equal(
  isMusicPlaybackAuthorized(
    { ...allowed, rights_expires_at: "2026-07-12T00:00:00.000Z" },
    "DE",
    now
  ),
  false
);

console.log("Music delivery tests passed.");
