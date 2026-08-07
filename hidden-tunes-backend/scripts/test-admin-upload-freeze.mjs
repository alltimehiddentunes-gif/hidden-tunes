import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const security = fs.readFileSync(path.resolve("services/adminCatalogSecurity.js"), "utf8");
const upload = fs.readFileSync(path.resolve("routes/adminUploadCompatibility.js"), "utf8");
const compensation = fs.readFileSync(path.resolve("services/adminUploadCompensation.js"), "utf8");
const server = fs.readFileSync(path.resolve("server.js"), "utf8");
const panel = fs.readFileSync(
  path.resolve("hidden-tunes-admin/components/BulkUploadPanel.tsx"),
  "utf8"
);
const protectedRoute = fs.readFileSync(
  path.resolve("hidden-tunes-admin/app/api/admin/upload-track/route.ts"),
  "utf8"
);
const permission = fs.readFileSync(
  path.resolve("hidden-tunes-admin/lib/requireUploadPermission.ts"),
  "utf8"
);

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

// Permanent protected catalog-upload ownership and response contracts.
assert.match(panel, /const API_UPLOAD_URL = "\/api\/admin\/upload-track"/);
assert.match(panel, /Authorization: `Bearer \$\{accessToken\}`/);
assert.match(panel, /"Content-Type": "application\/json"/);
assert.match(panel, /if \(!response\.ok \|\| !data\?\.success\)/);
assert.ok(
  panel.indexOf('uploadFileToR2(\n        item.file,\n        "songs"') <
    panel.indexOf("fetch(API_UPLOAD_URL"),
  "R2 audio upload must remain before the catalog metadata request"
);

assert.match(protectedRoute, /export async function POST\(req: NextRequest\)/);
assert.match(protectedRoute, /requireUploadPermission\(req\)/);
assert.doesNotMatch(protectedRoute, /requireCatalogueUploadEnabled/);
assert.ok(
  protectedRoute.indexOf("requireUploadPermission(req)") <
    protectedRoute.indexOf("await req.json()"),
  "authentication and uploader authorization must precede request parsing and mutation"
);
const artistIndex = protectedRoute.indexOf('from("artists")');
const albumIndex = protectedRoute.indexOf('from("albums")');
const songIndex = protectedRoute.indexOf('from("songs")');
assert.ok(artistIndex >= 0 && artistIndex < albumIndex && albumIndex < songIndex);
assert.match(protectedRoute, /return NextResponse\.json\(\{\s*success: true,[\s\S]*track: \{/);
assert.match(protectedRoute, /track: \{[\s\S]*id: song\.id/);
assert.match(protectedRoute, /success: false,[\s\S]*\{ status: 500 \}/);
assert.doesNotMatch(protectedRoute, /adminUploadCompatibility|emotionalWorld/i);

assert.doesNotMatch(upload, /router\.post\("\/api\/admin\/upload-track"/);
assert.doesNotMatch(upload, /return res\.end\(\)/);
assert.doesNotMatch(server, /api\/admin\/upload-track/);
assert.match(permission, /canUploadMusic\(profile\.role\)/);
assert.match(permission, /profile\.status !== "active"/);

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
