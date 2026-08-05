import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  idempotencyKey,
  insertStagedSong,
  isMissingOptionalExplicitColumn,
  normalizedBody,
  requestedPublication,
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
  isPublic: true,
});

for (const role of ["owner", "admin", "upload_manager"]) {
  assert.equal(
    requestedPublication({}),
    true,
    `missing publication field defaults to public for role-gated ${role} flow`
  );
}
assert.equal(requestedPublication({ isPublic: false }), false);
assert.equal(requestedPublication({ is_public: false }), false);
assert.equal(requestedPublication({ isPublic: true }), true);
assert.equal(requestedPublication({ is_public: true }), true);
assert.equal(normalizedBody({}).explicit, null);

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

function databaseFixture(results) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      assert.equal(table, "songs");
      return {
        insert(payload) {
          inserts.push(payload);
          return {
            select() { return this; },
            async single() { return results.shift(); },
          };
        },
      };
    },
  };
}

assert.equal(
  isMissingOptionalExplicitColumn({
    code: "PGRST204",
    message: "Could not find the 'explicit' column of 'songs' in the schema cache",
  }),
  true
);

const productionSchema = databaseFixture([
  {
    data: null,
    error: {
      code: "PGRST204",
      message: "Could not find the 'explicit' column of 'songs' in the schema cache",
    },
  },
  { data: { id: "published-1", is_public: true }, error: null },
]);
const compatibleInsert = await insertStagedSong(productionSchema, {
  id: "published-1",
  title: "Compatibility Track",
  audio_url: body.audioUrl,
  r2_audio_key: body.audioKey,
  is_public: true,
  explicit: null,
});
assert.equal(compatibleInsert.error, null);
assert.equal(productionSchema.inserts.length, 2);
assert.equal(productionSchema.inserts[0].explicit, null);
assert.equal(Object.hasOwn(productionSchema.inserts[1], "explicit"), false);
assert.equal(productionSchema.inserts[1].is_public, true, "schema fallback preserves publication");

const privateSchema = databaseFixture([
  { data: { id: "private-1", is_public: false }, error: null },
]);
const privateInsert = await insertStagedSong(privateSchema, {
  id: "private-1",
  is_public: false,
  explicit: null,
});
assert.equal(privateInsert.data.is_public, false, "explicit private remains private");

const classifiedSchema = databaseFixture([
  {
    data: null,
    error: {
      code: "PGRST204",
      message: "Could not find the 'explicit' column of 'songs' in the schema cache",
    },
  },
]);
const classifiedInsert = await insertStagedSong(classifiedSchema, {
  id: "classified-1",
  is_public: false,
  explicit: true,
});
assert.equal(classifiedInsert.error.code, "PGRST204");
assert.equal(classifiedSchema.inserts.length, 1, "known classification is never silently dropped");

const panel = fs.readFileSync(
  path.resolve("hidden-tunes-admin/components/BulkUploadPanel.tsx"),
  "utf8"
);
assert.match(panel, /const API_UPLOAD_URL = "\/api\/admin\/upload-track"/);
assert.match(panel, /const API_SIGNED_UPLOAD_URL = "\/api\/upload-url"/);
assert.match(panel, /const API_SERVER_UPLOAD_URL = "\/api\/admin\/upload-file"/);
assert.match(panel, /for \(const item of pending\) \{\s*await uploadSingle\(item\);\s*\}/);

const artistSubmission = fs.readFileSync(
  path.resolve("hidden-tunes-admin/app/api/artist-submissions/route.ts"),
  "utf8"
);
assert.match(artistSubmission, /status:\s*["']pending_review["']/);
assert.doesNotMatch(artistSubmission, /requestedPublication/);

const compatibilitySource = fs.readFileSync(
  path.resolve("routes/adminUploadCompatibility.js"),
  "utf8"
);
assert.doesNotMatch(compatibilitySource, /Classification review is required before publication/);

console.log("admin-upload-compatibility: PASS");
