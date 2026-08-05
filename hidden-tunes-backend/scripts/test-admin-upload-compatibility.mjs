import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  idempotencyKey,
  normalizedBody,
} from "../routes/adminUploadCompatibility.js";

const body = normalizedBody({
  title: "Compatibility Track",
  artist: "Compatibility Artist",
  album: "Compatibility Album",
  genre: "Afrobeats",
  duration: 123.4,
  audioUrl: "https://media.invalid/songs/key.mp3",
  audioKey: "songs/key.mp3",
  artworkUrl: "https://media.invalid/covers/key.png",
  artworkKey: "covers/key.png",
  plainLyricsText: "plain lyrics",
  syncedLrcText: "[00:00.00] synced",
});

assert.deepEqual(body, {
  title: "Compatibility Track",
  artist: "Compatibility Artist",
  album: "Compatibility Album",
  genre: "Afrobeats",
  mood: "Unspecified",
  duration: 123,
  audioUrl: "https://media.invalid/songs/key.mp3",
  audioKey: "songs/key.mp3",
  artworkUrl: "https://media.invalid/covers/key.png",
  artworkKey: "covers/key.png",
  lyrics: "plain lyrics",
  syncedLyrics: "[00:00.00] synced",
  explicit: null,
});

const actor = { adminActor: { id: "actor-1" }, headers: {} };
assert.equal(idempotencyKey(actor, body), "audio:actor-1:songs/key.mp3");
assert.equal(
  idempotencyKey(
    { adminActor: { id: "actor-1" }, headers: { "idempotency-key": "item-1" } },
    body
  ),
  "header:actor-1:item-1"
);

const eight = Array.from({ length: 8 }, (_, index) =>
  idempotencyKey(actor, { ...body, audioKey: `songs/item-${index}.mp3` })
);
assert.equal(new Set(eight).size, 8, "eight intended items retain eight identities");

const panel = fs.readFileSync(
  path.resolve("hidden-tunes-admin/components/BulkUploadPanel.tsx"),
  "utf8"
);
assert.match(panel, /const API_UPLOAD_URL = "\/api\/admin\/upload-track"/);
assert.match(panel, /const API_SIGNED_UPLOAD_URL = "\/api\/upload-url"/);
assert.match(panel, /const API_SERVER_UPLOAD_URL = "\/api\/admin\/upload-file"/);
assert.match(panel, /for \(const item of pending\) \{\s*await uploadSingle\(item\);\s*\}/);

console.log("admin-upload-compatibility: PASS");
