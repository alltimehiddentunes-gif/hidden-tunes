import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const security = fs.readFileSync(path.resolve("services/adminCatalogSecurity.js"), "utf8");
const upload = fs.readFileSync(path.resolve("routes/adminUploadCompatibility.js"), "utf8");
const compensation = fs.readFileSync(path.resolve("services/adminUploadCompensation.js"), "utf8");
const server = fs.readFileSync(path.resolve("server.js"), "utf8");

assert.match(security, /new Set\(\["owner", "admin", "upload_manager"\]\)/);
assert.doesNotMatch(security, /new Set\(\[[^\]]*"artist"/);
assert.match(security, /profile\.status !== "active"/);
assert.match(security, /ALLOWED_ROLES\.has\(profile\.role\)/);
assert.match(security, /adminCors/);
assert.match(upload, /adminCors,[\s\S]*attachAdminRequestId,[\s\S]*requireAdminCatalogRole,[\s\S]*adminRateLimit/);
assert.ok(upload.indexOf("requireAdminCatalogRole") < upload.indexOf("ensureR2ObjectExists"));
assert.match(upload, /function requestedPublication[\s\S]*return true;/);
assert.match(upload, /typeof body\.isPublic === "boolean"/);
assert.match(upload, /typeof body\.is_public === "boolean"/);
assert.match(upload, /idempotency-key/);
assert.match(upload, /duplicate_detected/);
assert.match(upload, /appendCleanupRecord/);
assert.match(upload, /compensateFailedUpload/);
assert.match(upload, /Catalogue upload failed\./);
assert.doesNotMatch(upload, /details:\s*error|error:\s*error\.message/);
assert.doesNotMatch(upload, /multer|memoryStorage/);
assert.match(server, /requireLegacyMultipartUploadEnabled/);

assert.match(compensation, /signedObjectBelongsToActor/);
assert.match(compensation, /objectReferenceCount/);
assert.match(compensation, /DeleteObjectCommand/);
assert.match(compensation, /never_delete_unproven_or_reused/);
assert.match(compensation, /review_required_transaction_not_proven/);

const artistPath = path.resolve("hidden-tunes-admin/app/api/artist-submissions/route.ts");
if (fs.existsSync(artistPath)) {
  const artist = fs.readFileSync(artistPath, "utf8");
  assert.match(artist, /status:\s*["']pending_review["']/);
  assert.doesNotMatch(artist, /adminUploadCompatibility|requestedPublication/);
}

console.log("admin-upload-freeze: PASS");
