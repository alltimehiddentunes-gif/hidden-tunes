import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  adminCors,
  adminRateLimit,
  createRequireAdminCatalogRole,
  requireAdminCatalogRole,
  requireAdminCatalogUploadEnabled,
  requireLegacyMultipartUploadEnabled,
  resetAdminRateLimitsForTests,
} from "../services/adminCatalogSecurity.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    sendStatus(code) { this.statusCode = code; return this; },
  };
}

{
  const previous = process.env.ADMIN_LEGACY_MULTIPART_UPLOAD_ENABLED;
  delete process.env.ADMIN_LEGACY_MULTIPART_UPLOAD_ENABLED;
  const res = response();
  let nextCalled = false;
  requireLegacyMultipartUploadEnabled(request(), res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 503);
  assert.equal(nextCalled, false);
  if (previous === undefined) delete process.env.ADMIN_LEGACY_MULTIPART_UPLOAD_ENABLED;
  else process.env.ADMIN_LEGACY_MULTIPART_UPLOAD_ENABLED = previous;
}

function clientDouble({ user = { id: "user-1" }, authError = null, profile = null, profileError = null } = {}) {
  const calls = { getUser: 0, profileRead: 0, mutation: 0 };
  return {
    calls,
    client: {
      auth: {
        async getUser() {
          calls.getUser += 1;
          return { data: { user }, error: authError };
        },
      },
      from(table) {
        assert.equal(table, "uploader_profiles");
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            calls.profileRead += 1;
            return { data: profile, error: profileError };
          },
          insert() { calls.mutation += 1; throw new Error("mutation must not run"); },
          update() { calls.mutation += 1; throw new Error("mutation must not run"); },
        };
      },
    },
  };
}

function request(overrides = {}) {
  return {
    method: "POST",
    originalUrl: "/api/admin/song",
    headers: { origin: "https://admin.hiddentunes.com" },
    ip: "127.0.0.1",
    ...overrides,
  };
}

for (const scenario of [
  { name: "invalid token", double: clientDouble({ user: null, authError: new Error("expired") }), status: 401 },
  { name: "ordinary user", double: clientDouble({ profile: { id: "user-1", role: "artist", status: "active" } }), status: 403 },
  { name: "wrong admin role", double: clientDouble({ profile: { id: "user-1", role: "moderator", status: "active" } }), status: 403 },
  { name: "inactive owner", double: clientDouble({ profile: { id: "user-1", role: "owner", status: "inactive" } }), status: 403 },
]) {
  const guard = createRequireAdminCatalogRole({ getClient: () => scenario.double.client });
  const res = response();
  let parserOrHandlerCalled = false;
  await guard(request({ headers: { origin: "https://admin.hiddentunes.com", authorization: "Bearer test-token" } }), res, () => {
    parserOrHandlerCalled = true;
  });
  assert.equal(res.statusCode, scenario.status, scenario.name);
  assert.equal(parserOrHandlerCalled, false, `${scenario.name}: downstream parsing must not run`);
  assert.equal(scenario.double.calls.mutation, 0, `${scenario.name}: no mutation`);
  assert.equal(Object.hasOwn(res.payload, "details"), false, `${scenario.name}: safe error`);
}

for (const role of ["owner", "admin", "upload_manager"]) {
  const double = clientDouble({ profile: { id: "user-1", role, status: "active" } });
  const guard = createRequireAdminCatalogRole({ getClient: () => double.client });
  const res = response();
  let nextCalled = false;
  const req = request({ headers: { origin: "https://admin.hiddentunes.com", authorization: "Bearer valid-token" } });
  await guard(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, `${role} passes authorization`);
  assert.equal(req.adminActor.role, role);
  assert.equal(double.calls.mutation, 0);
}

{
  const double = clientDouble({ profileError: new Error("relation uploader_profiles leaked detail") });
  const guard = createRequireAdminCatalogRole({ getClient: () => double.client });
  const res = response();
  const originalError = console.error;
  console.error = () => {};
  try {
    await guard(request({ headers: { origin: "https://admin.hiddentunes.com", authorization: "Bearer valid-token" } }), res, () => {});
  } finally {
    console.error = originalError;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.stringify(res.payload).includes("uploader_profiles"), false);
  assert.ok(res.payload.requestId);
}

{
  const req = request();
  const res = response();
  let nextCalled = false;
  await requireAdminCatalogRole(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.equal(res.payload.error, "Authentication required.");
  assert.ok(res.payload.requestId);
}

{
  const previous = process.env.ADMIN_CATALOG_UPLOAD_ENABLED;
  delete process.env.ADMIN_CATALOG_UPLOAD_ENABLED;
  const res = response();
  let nextCalled = false;
  requireAdminCatalogUploadEnabled(request({ adminActor: { id: "admin" } }), res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 503);
  assert.equal(nextCalled, false);
  if (previous === undefined) delete process.env.ADMIN_CATALOG_UPLOAD_ENABLED;
  else process.env.ADMIN_CATALOG_UPLOAD_ENABLED = previous;
}

{
  const previous = process.env.ADMIN_ALLOWED_ORIGINS;
  process.env.ADMIN_ALLOWED_ORIGINS = "https://admin.hiddentunes.com";
  const res = response();
  adminCors(request({ headers: { origin: "https://evil.example" } }), res, () => {
    assert.fail("unknown origin must not pass");
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
  if (previous === undefined) delete process.env.ADMIN_ALLOWED_ORIGINS;
  else process.env.ADMIN_ALLOWED_ORIGINS = previous;
}

{
  resetAdminRateLimitsForTests();
  let last;
  for (let index = 0; index < 61; index += 1) {
    last = response();
    adminRateLimit(request(), last, () => {});
  }
  assert.equal(last.statusCode, 429);
}

const server = fs.readFileSync(path.resolve("server.js"), "utf8");
assert.ok(
  server.indexOf("app.use(adminUploadCompatibilityRouter)") < server.indexOf('app.use(\n  "/api/admin"'),
  "compatibility routes must precede the legacy multipart router"
);
const mount = server.slice(server.indexOf('app.use(\n  "/api/admin"'));
const guardIndex = mount.indexOf("requireAdminCatalogRole");
const gateIndex = mount.indexOf("requireAdminCatalogUploadEnabled");
const legacyGateIndex = mount.indexOf("requireLegacyMultipartUploadEnabled");
const routerIndex = mount.indexOf("adminUploadRouter");
assert.ok(guardIndex >= 0 && gateIndex > guardIndex && legacyGateIndex > gateIndex && routerIndex > legacyGateIndex,
  "auth and disabled gate must precede multipart router");
assert.match(server, /ADMIN_CATALOG_UPLOAD_ENABLED|requireAdminCatalogUploadEnabled/);
assert.doesNotMatch(server, /express\.json\(\{ limit: ["']100mb["']/);

const upload = fs.readFileSync(path.resolve("routes/adminUpload.js"), "utf8");
assert.doesNotMatch(upload, /details:\s*error\.message/);

const compatibility = fs.readFileSync(path.resolve("routes/adminUploadCompatibility.js"), "utf8");
for (const route of ["/api/upload-url", "/api/complete-song", "/api/admin/upload-file"]) {
  assert.ok(compatibility.includes(route), `${route} compatibility contract exists`);
}
assert.doesNotMatch(
  compatibility,
  /router\.post\("\/api\/admin\/upload-track"/,
  "protected upload-track route must not be owned by the compatibility router"
);
assert.doesNotMatch(
  compatibility,
  /return res\.end\(\)/,
  "compatibility failures must never return an unexplained empty 200"
);
const protectedUploadRoute = fs.readFileSync(
  path.resolve("hidden-tunes-admin/app/api/admin/upload-track/route.ts"),
  "utf8"
);
assert.match(
  protectedUploadRoute,
  /requireUploadPermission\(req\)/,
  "protected upload route retains its original authenticated permission helper"
);
assert.doesNotMatch(
  protectedUploadRoute,
  /requireCatalogueUploadEnabled/,
  "protected upload route must not be feature-flag rejected"
);
assert.match(compatibility, /is_public:\s*item\.isPublic/);
assert.match(compatibility, /requireAdminCatalogRole/);
assert.match(compatibility, /r2_audio_key/);
assert.match(compatibility, /idempotency-key/);
assert.doesNotMatch(compatibility, /multer|memoryStorage|req\.formData/);

console.log("admin-catalog-security: PASS");
