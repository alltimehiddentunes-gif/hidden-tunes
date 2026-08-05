import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendCleanupRecord,
  compensateFailedUpload,
  readCleanupRecords,
  signedObjectBelongsToActor,
} from "../services/adminUploadCompensation.js";
import {
  resetRecentResultsForTests,
  resolveDuplicateCompletion,
} from "../routes/adminUploadCompatibility.js";

function fixture({ audioReferences = 0, coverReferences = 0, deleteFails = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ht-upload-compensation-"));
  const manifestPath = path.join(root, "manifest.jsonl");
  const mutations = { deletes: [], queries: [] };
  const db = {
    from(table) {
      assert.equal(table, "songs");
      return {
        select() { return this; },
        async eq(column, key) {
          mutations.queries.push({ column, key });
          return { count: column === "r2_audio_key" ? audioReferences : coverReferences, error: null };
        },
      };
    },
  };
  const objectStore = {
    async send(command) {
      mutations.deletes.push(command.input.Key);
      if (deleteFails) throw new Error("injected delete failure");
      return {};
    },
  };
  return { root, manifestPath, mutations, db, objectStore };
}

function attempt(overrides = {}) {
  return {
    correlationId: "request-1",
    actorId: "actor-1",
    actorRole: "owner",
    idempotencyKey: "header:actor-1:item-1",
    audioKey: "songs/new.mp3",
    artworkKey: "covers/new.png",
    audioObjectNew: true,
    artworkObjectNew: true,
    artistId: "artist-1",
    artistState: "created",
    albumId: "album-1",
    albumState: "created",
    songId: null,
    failureStage: "song_insert",
    cleanupEligibility: "pending_verification",
    cleanupStatus: "not_started",
    ...overrides,
  };
}

function authorize(manifestPath, key, actorId = "actor-1") {
  appendCleanupRecord({ event: "signed_object_authorized", actorId, objectKey: key, objectNew: true }, manifestPath);
}

{
  const f = fixture();
  authorize(f.manifestPath, "songs/new.mp3");
  authorize(f.manifestPath, "covers/new.png");
  const result = await compensateFailedUpload({ ...f, bucket: "test", attempt: attempt() });
  assert.deepEqual(f.mutations.deletes, ["songs/new.mp3", "covers/new.png"]);
  assert.equal(f.mutations.queries.length, 2);
  assert.equal(result.cleanupStatus, "completed");
  assert.match(JSON.stringify(result), /review_required_transaction_not_proven/);
}

{
  resetRecentResultsForTests();
  const mutations = { songReads: 0, songInserts: 0, artists: 0, albums: 0, r2Writes: 0 };
  const existingSong = { id: "song-1", is_public: true, r2_audio_key: "songs/existing.mp3" };
  const db = {
    from(table) {
      assert.equal(table, "songs");
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          mutations.songReads += 1;
          return { data: existingSong, error: null };
        },
      };
    },
  };
  const first = await resolveDuplicateCompletion({ db, key: "header:actor-1:same", audioKey: "songs/existing.mp3" });
  const repeat = await resolveDuplicateCompletion({ db, key: "header:actor-1:same", audioKey: "songs/existing.mp3" });
  assert.equal(first.source, "persistent");
  assert.equal(repeat.source, "memory");
  assert.deepEqual(repeat.payload.track, existingSong);
  assert.deepEqual(mutations, { songReads: 1, songInserts: 0, artists: 0, albums: 0, r2Writes: 0 });

  resetRecentResultsForTests();
  const afterRestart = await resolveDuplicateCompletion({ db, key: "header:actor-1:same", audioKey: "songs/existing.mp3" });
  assert.equal(afterRestart.source, "persistent");
  assert.deepEqual(mutations, { songReads: 2, songInserts: 0, artists: 0, albums: 0, r2Writes: 0 });
}

{
  const f = fixture({ audioReferences: 1 });
  authorize(f.manifestPath, "songs/new.mp3");
  await compensateFailedUpload({ ...f, bucket: "test", attempt: attempt({ artworkKey: null }) });
  assert.equal(f.mutations.deletes.length, 0, "referenced object is never deleted");
}

{
  const f = fixture();
  authorize(f.manifestPath, "songs/new.mp3", "different-actor");
  await compensateFailedUpload({ ...f, bucket: "test", attempt: attempt({ artworkKey: null }) });
  assert.equal(f.mutations.deletes.length, 0, "unproven or reused object is never deleted");
  assert.equal(f.mutations.queries.length, 0, "unowned object is not even considered deletable");
}

{
  const f = fixture({ deleteFails: true });
  authorize(f.manifestPath, "songs/new.mp3");
  const result = await compensateFailedUpload({ ...f, bucket: "test", attempt: attempt({ artworkKey: null }) });
  assert.equal(f.mutations.deletes.length, 1);
  assert.equal(result.cleanupStatus, "partial");
  assert.match(JSON.stringify(result), /delete_failed/);
}

{
  const f = fixture();
  authorize(f.manifestPath, "songs/new.mp3");
  const records = readCleanupRecords(f.manifestPath);
  assert.equal(signedObjectBelongsToActor(records, "actor-1", "songs/new.mp3"), true);
  assert.equal(signedObjectBelongsToActor(records, "actor-2", "songs/new.mp3"), false);
  if (process.platform !== "win32") {
    assert.equal((fs.statSync(f.manifestPath).mode & 0o777), 0o600);
  }
}

console.log("admin-upload-compensation: PASS");
