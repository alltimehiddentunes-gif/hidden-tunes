import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  completeTrack,
  resetAdminUploadTestDependencies,
  resetRecentResultsForTests,
  setAdminUploadTestDependencies,
} from "../routes/adminUploadCompatibility.js";
import { appendCleanupRecord, compensateFailedUpload } from "../services/adminUploadCompensation.js";

function response() {
  return {
    statusCode: 200, body: null, ended: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

function makeFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ht-full-handler-"));
  const manifestPath = path.join(root, "cleanup.jsonl");
  const counts = { r2Create: 0, r2Delete: 0, artistCreate: 0, artistDelete: 0, albumCreate: 0, albumDelete: 0, songInsert: 0, songDelete: 0, audit: 0 };
  const req = {
    body: { title: "Matrix Track", artist: "Matrix Artist", album: "Matrix Album", audioUrl: "https://media.invalid/songs/matrix.mp3", audioKey: "songs/matrix.mp3", artworkUrl: "https://media.invalid/covers/matrix.png", artworkKey: "covers/matrix.png" },
    headers: { "idempotency-key": options.idempotencyKey || "matrix-1" },
    adminActor: { id: "actor-1", role: "owner" }, adminRequestId: options.requestId || "request-1",
    method: "POST", originalUrl: "/api/admin/upload-track", ip: "127.0.0.1", socket: {}, aborted: false, destroyed: false,
  };
  const rows = {
    artist: options.reuseArtist ? { id: "artist-reused", name: "Matrix Artist" } : null,
    album: options.reuseAlbum ? { id: "album-reused", title: "Matrix Album" } : null,
    song: options.existingSong || null,
  };
  class Builder {
    constructor(table) { this.table = table; this.mode = "select"; this.payload = null; this.count = false; }
    select(_fields, opts) { this.count = Boolean(opts?.count); return this; }
    eq() { return this; }
    insert(payload) { this.mode = "insert"; this.payload = payload; return this; }
    async maybeSingle() {
      if (options.unknownAt === `${this.table}_lookup`) throw new Error("secret database stack detail");
      if (this.table === "songs") return { data: rows.song, error: null };
      if (this.table === "artists") return { data: rows.artist, error: null };
      if (this.table === "albums") return { data: rows.album, error: null };
      return { data: null, error: null };
    }
    async single() {
      if (this.table === "artists") {
        if (options.failAt === "artist_create") return { data: null, error: new Error("artist failure") };
        counts.artistCreate += 1; rows.artist = { id: "artist-created", name: this.payload.name };
        if (options.abortAfter === "artist") req.aborted = true;
        return { data: rows.artist, error: null };
      }
      if (this.table === "albums") {
        if (options.failAt === "album_create") return { data: null, error: new Error("album failure") };
        counts.albumCreate += 1; rows.album = { id: "album-created", title: this.payload.title };
        if (options.abortAfter === "album") req.aborted = true;
        return { data: rows.album, error: null };
      }
      if (this.table === "songs") {
        if (options.failAt === "song_insert") return { data: null, error: new Error("secret song insert failure") };
        counts.songInsert += 1; rows.song = { ...this.payload };
        return { data: rows.song, error: null };
      }
    }
    then(resolve) { resolve({ count: options.referenced ? 1 : 0, error: null }); }
  }
  const db = { from(table) { return new Builder(table); } };
  const objectStore = { async send(command) {
    if (command.constructor.name === "DeleteObjectCommand") { counts.r2Delete += 1; if (options.deleteFails) throw new Error("delete failed"); }
    return {};
  } };
  appendCleanupRecord({ event: "signed_object_authorized", actorId: "actor-1", objectKey: req.body.audioKey, objectNew: !options.reusedObject }, manifestPath);
  appendCleanupRecord({ event: "signed_object_authorized", actorId: "actor-1", objectKey: req.body.artworkKey, objectNew: !options.reusedObject }, manifestPath);
  const append = (record, target = manifestPath) => {
    if (options.manifestFailsAfterSong && record.event === "completion_succeeded") throw new Error("manifest unavailable");
    return appendCleanupRecord(record, target);
  };
  setAdminUploadTestDependencies({ database: () => db, r2Client: () => objectStore, appendCleanupRecord: append, compensateFailedUpload, cleanupManifestPath: () => manifestPath });
  return { req, res: response(), counts, manifestPath, rows };
}

async function run(name, options, expected) {
  resetRecentResultsForTests();
  const f = makeFixture(options);
  const originalInfo = console.info;
  const originalError = console.error;
  const operational = [];
  console.info = (line) => {
    const event = JSON.parse(line);
    f.counts.audit += 1;
    if (options.auditFailsAfterSong && event.action === "item_published") throw new Error("audit unavailable");
  };
  console.error = (...args) => operational.push(args.map(String).join(" "));
  let repeatResponse = null;
  try {
    await completeTrack(f.req, f.res);
    if (options.repeatAfterSuccess) {
      const before = { ...f.counts };
      repeatResponse = response();
      await completeTrack(f.req, repeatResponse);
      for (const key of ["r2Create", "r2Delete", "artistCreate", "artistDelete", "albumCreate", "albumDelete", "songInsert", "songDelete"]) {
        assert.equal(f.counts[key], before[key], `${name}: repeat ${key}`);
      }
      assert.equal(repeatResponse.body?.idempotent, true, `${name}: reusable idempotency result`);
    }
  } finally { console.info = originalInfo; console.error = originalError; resetAdminUploadTestDependencies(); }
  const manifest = fs.readFileSync(f.manifestPath, "utf8");
  for (const [key, value] of Object.entries(expected.counts || {})) assert.equal(f.counts[key], value, `${name}: ${key}`);
  if (expected.status != null) assert.equal(f.res.statusCode, expected.status, `${name}: status`);
  if (expected.ended != null) assert.equal(f.res.ended, expected.ended, `${name}: ended`);
  if (expected.success != null) assert.equal(f.res.body?.success, expected.success, `${name}: success`);
  if (expected.redacted) assert.equal(JSON.stringify(f.res.body).includes("secret"), false, `${name}: response redacted`);
  for (const token of expected.manifest || []) assert.match(manifest, new RegExp(token), `${name}: manifest ${token}`);
  if (expected.operational) assert.ok(operational.some((line) => line.includes(expected.operational)), `${name}: bounded operational error`);
  return { name, ...f.counts, status: f.res.ended ? "closed" : f.res.statusCode, publicState: f.rows.song?.is_public ?? null, idempotency: repeatResponse?.body?.idempotent ?? f.res.body?.idempotent ?? false, cleanup: expected.manifest?.join(",") || "not_required" };
}

const matrix = [];
matrix.push(await run("1 audio exists; song insert fails", { failAt: "song_insert", reusedObject: true, reuseArtist: true, reuseAlbum: true }, { counts: { r2Delete: 0, artistCreate: 0, albumCreate: 0, songInsert: 0 }, status: 500, success: false, redacted: true, manifest: ["never_delete_unproven_or_reused", "song_insert"] }));
matrix.push(await run("2 artwork exists; song insert fails", { failAt: "song_insert" }, { counts: { r2Delete: 2, artistCreate: 1, albumCreate: 1, songInsert: 0 }, status: 500, manifest: ["cleanup_completed"] }));
matrix.push(await run("3 artist created; album fails", { failAt: "album_create" }, { counts: { r2Delete: 2, artistCreate: 1, albumCreate: 0, songInsert: 0 }, status: 500, redacted: true, manifest: ["album_resolution", "review_required_transaction_not_proven"] }));
matrix.push(await run("4 artist+album created; song fails", { failAt: "song_insert" }, { counts: { r2Delete: 2, artistCreate: 1, albumCreate: 1, songInsert: 0 }, status: 500, manifest: ["song_insert", "review_required_transaction_not_proven"] }));
matrix.push(await run("5 reused artist+album; song fails", { failAt: "song_insert", reuseArtist: true, reuseAlbum: true, reusedObject: true }, { counts: { r2Delete: 0, artistCreate: 0, albumCreate: 0, songInsert: 0 }, status: 500, manifest: ["never_delete_unproven_or_reused"] }));
matrix.push(await run("6 cleanup delete succeeds", { failAt: "song_insert" }, { counts: { r2Delete: 2 }, status: 500, manifest: ["deleted"] }));
matrix.push(await run("7 cleanup delete fails", { failAt: "song_insert", deleteFails: true }, { counts: { r2Delete: 2 }, status: 500, manifest: ["delete_failed", "partial"] }));
matrix.push(await run("8 referenced object retained", { failAt: "song_insert", referenced: true }, { counts: { r2Delete: 0 }, status: 500, manifest: ["referenced", "retained"] }));
matrix.push(await run("9 reused object retained", { failAt: "song_insert", reusedObject: true }, { counts: { r2Delete: 0 }, status: 500, manifest: ["never_delete_unproven_or_reused"] }));

resetRecentResultsForTests();
const persistent = makeFixture({ existingSong: { id: "existing", is_public: true, r2_audio_key: "songs/matrix.mp3" } });
const originalInfo = console.info;
console.info = () => { persistent.counts.audit += 1; };
await completeTrack(persistent.req, persistent.res);
const firstCounts = { ...persistent.counts };
const sameProcessRes = response(); await completeTrack(persistent.req, sameProcessRes);
const sameDelta = persistent.counts.audit - firstCounts.audit;
for (const key of ["r2Create", "r2Delete", "artistCreate", "artistDelete", "albumCreate", "albumDelete", "songInsert", "songDelete"]) assert.equal(persistent.counts[key], firstCounts[key]);
matrix.push({ name: "10 same-process repeat", ...persistent.counts, audit: sameDelta, status: sameProcessRes.statusCode, publicState: true, idempotency: true, cleanup: "not_required" });
resetRecentResultsForTests(); const beforeRestartAudit = persistent.counts.audit; const restartRes = response(); await completeTrack(persistent.req, restartRes);
const restartDelta = persistent.counts.audit - beforeRestartAudit;
for (const key of ["r2Create", "r2Delete", "artistCreate", "artistDelete", "albumCreate", "albumDelete", "songInsert", "songDelete"]) assert.equal(persistent.counts[key], firstCounts[key]);
matrix.push({ name: "11 post-restart repeat", ...persistent.counts, audit: restartDelta, status: restartRes.statusCode, publicState: true, idempotency: true, cleanup: "not_required" });
console.info = originalInfo;
resetAdminUploadTestDependencies();

matrix.push(await run("12 audit fails after persistence", { auditFailsAfterSong: true, manifestFailsAfterSong: true, repeatAfterSuccess: true }, { counts: { artistCreate: 1, albumCreate: 1, songInsert: 1, r2Delete: 0 }, status: 200, success: true, operational: "manifest write failed" }));
matrix.push(await run("13 timeout boundary", { abortAfter: "artist" }, { counts: { artistCreate: 1, albumCreate: 0, songInsert: 0, r2Delete: 2 }, status: 499, success: false, manifest: ["album_resolution", "cleanup_completed"] }));
matrix.push(await run("14 abort boundary", { abortAfter: "album" }, { counts: { artistCreate: 1, albumCreate: 1, songInsert: 0, r2Delete: 2 }, status: 499, success: false, manifest: ["song_insert", "cleanup_completed"] }));
matrix.push(await run("15 unknown full-handler error", { unknownAt: "artists_lookup" }, { counts: { artistCreate: 0, albumCreate: 0, songInsert: 0, r2Delete: 2 }, status: 500, success: false, redacted: true, manifest: ["artist_resolution", "cleanup_completed"] }));

console.log(JSON.stringify(matrix, null, 2));
console.log("admin-upload-failure-matrix: PASS");
