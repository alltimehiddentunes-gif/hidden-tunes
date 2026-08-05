import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  adminCors,
  adminRateLimit,
  createRequireAdminCatalogRole,
  requireAdminCatalogRole,
  requireAdminCatalogUploadEnabled,
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
    headers: {},
    ip: "127.0.0.1",
    ...overrides,
  };
}

for (const scenario of [
  { name: "invalid token", double: clientDouble({ user: null, authError: new Error("expired") }), status: 401 },
  { name: "ordinary user", double: clientDouble({ profile: { id: "user-1", role: "artist", status: "active" } }), status: 403 },
  { name: "wrong admin role", double: clientDouble({ profile: { id: "user-1", role: "moderator", status: "active" } }), status: 403 },
]) {
  const guard = createRequireAdminCatalogRole({ getClient: () => scenario.double.client });
  const res = response();
  let parserOrHandlerCalled = false;
  await guard(request({ headers: { authorization: "Bearer test-token" } }), res, () => {
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
  const req = request({ headers: { authorization: "Bearer valid-token" } });
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
    await guard(request({ headers: { authorization: "Bearer valid-token" } }), res, () => {});
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
  for (let index = 0; index < 11; index += 1) {
    last = response();
    adminRateLimit(request(), last, () => {});
  }
  assert.equal(last.statusCode, 429);
}

const server = fs.readFileSync(path.resolve("server.js"), "utf8");
const mount = server.slice(server.indexOf('app.use(\n  "/api/admin"'));
const guardIndex = mount.indexOf("requireAdminCatalogRole");
const gateIndex = mount.indexOf("requireAdminCatalogUploadEnabled");
const routerIndex = mount.indexOf("adminUploadRouter");
assert.ok(guardIndex >= 0 && gateIndex > guardIndex && routerIndex > gateIndex,
  "auth and disabled gate must precede multipart router");
assert.match(server, /ADMIN_CATALOG_UPLOAD_ENABLED|requireAdminCatalogUploadEnabled/);
assert.doesNotMatch(server, /express\.json\(\{ limit: ["']100mb["']/);

const upload = fs.readFileSync(path.resolve("routes/adminUpload.js"), "utf8");
assert.doesNotMatch(upload, /details:\s*error\.message/);

console.log("admin-catalog-security: PASS");
