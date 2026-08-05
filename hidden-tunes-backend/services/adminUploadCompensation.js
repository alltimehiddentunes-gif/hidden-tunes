import fs from "node:fs";
import path from "node:path";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const DEFAULT_MANIFEST = "/var/lib/hidden-tunes/admin-upload-cleanup.jsonl";
const MAX_READ_BYTES = 8 * 1024 * 1024;

export function cleanupManifestPath() {
  return process.env.ADMIN_UPLOAD_CLEANUP_MANIFEST || DEFAULT_MANIFEST;
}

export function appendCleanupRecord(record, manifestPath = cleanupManifestPath()) {
  const entry = { timestamp: new Date().toISOString(), ...record };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true, mode: 0o700 });
  fs.appendFileSync(manifestPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(manifestPath, 0o600);
  return entry;
}

export function readCleanupRecords(manifestPath = cleanupManifestPath()) {
  if (!fs.existsSync(manifestPath)) return [];
  const stat = fs.statSync(manifestPath);
  if (stat.size > MAX_READ_BYTES) throw new Error("Upload cleanup manifest exceeds bounded read size.");
  return fs.readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function signedObjectBelongsToActor(records, actorId, objectKey) {
  return records.some((record) =>
    record.event === "signed_object_authorized" &&
    record.actorId === actorId &&
    record.objectKey === objectKey &&
    record.objectNew === true
  );
}

async function objectReferenceCount(db, key, column) {
  const result = await db.from("songs").select("id", { count: "exact", head: true }).eq(column, key);
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

export async function compensateFailedUpload({
  db,
  objectStore,
  bucket,
  manifestPath,
  attempt,
  append = appendCleanupRecord,
}) {
  const records = readCleanupRecords(manifestPath);
  const results = [];
  append({ ...attempt, event: "cleanup_started", cleanupStatus: "started" }, manifestPath);

  for (const resource of [
    { key: attempt.audioKey, column: "r2_audio_key", kind: "audio" },
    { key: attempt.artworkKey, column: "r2_cover_key", kind: "artwork" },
  ]) {
    if (!resource.key) continue;
    const owned = signedObjectBelongsToActor(records, attempt.actorId, resource.key);
    if (!owned) {
      results.push({ kind: resource.kind, key: resource.key, cleanupEligibility: "never_delete_unproven_or_reused", cleanupStatus: "retained" });
      continue;
    }
    const references = await objectReferenceCount(db, resource.key, resource.column);
    if (references > 0) {
      results.push({ kind: resource.kind, key: resource.key, cleanupEligibility: "referenced", cleanupStatus: "retained" });
      continue;
    }
    try {
      await objectStore.send(new DeleteObjectCommand({ Bucket: bucket, Key: resource.key }));
      results.push({ kind: resource.kind, key: resource.key, cleanupEligibility: "owned_unreferenced", cleanupStatus: "deleted" });
    } catch {
      results.push({ kind: resource.kind, key: resource.key, cleanupEligibility: "owned_unreferenced", cleanupStatus: "delete_failed" });
    }
  }

  if (attempt.artistState === "created") {
    results.push({ kind: "artist", id: attempt.artistId, cleanupEligibility: "review_required_transaction_not_proven", cleanupStatus: "retained" });
  }
  if (attempt.albumState === "created") {
    results.push({ kind: "album", id: attempt.albumId, cleanupEligibility: "review_required_transaction_not_proven", cleanupStatus: "retained" });
  }

  const completed = append({
    ...attempt,
    event: "cleanup_completed",
    cleanupStatus: results.some((item) => item.cleanupStatus === "delete_failed") ? "partial" : "completed",
    cleanupResults: results,
    cleanupResultTimestamp: new Date().toISOString(),
  }, manifestPath);
  return completed;
}
