import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/admin/distribution/microsoft-store/route";
import { closeMicrosoftStoreForTests } from "../lib/distribution/microsoftStoreStore";

const URL = "https://admin.hiddentunes.com/api/admin/distribution/microsoft-store";
const directory = mkdtempSync(join(tmpdir(), "ht-microsoft-route-test-"));
const environment = {
  ANALYTICS_DATA_DIR: directory,
  SUPABASE_URL: "https://microsoft-route-test.invalid",
  NEXT_PUBLIC_SUPABASE_URL: "https://microsoft-route-test.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "isolated-microsoft-test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "isolated-microsoft-test-service",
};
const previousEnvironment = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let role = "owner", status = "active", sequence = 1;
let identity = "00000000-0000-4000-8000-000000000001";
const observedNetwork: string[] = [];
function nextIdentity() { identity = `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`; }
function get(period = "all", authenticated = true) {
  return new NextRequest(URL + "?period=" + period, { headers: authenticated ? { Authorization: "Bearer isolated-owner-token" } : {} });
}
function post(body: unknown, options: { origin?: string | null; type?: string; authenticated?: boolean; raw?: boolean; declared?: string; reuseIdentity?: boolean } = {}) {
  if (!options.reuseIdentity) nextIdentity();
  const headers: Record<string, string> = { "Content-Type": options.type || "application/json" };
  if (options.origin !== null) headers.Origin = options.origin || "https://admin.hiddentunes.com";
  if (options.authenticated !== false) headers.Authorization = "Bearer isolated-owner-token";
  if (options.declared !== undefined) headers["Content-Length"] = options.declared;
  return new NextRequest(URL, { method: "POST", headers, body: options.raw ? String(body) : JSON.stringify(body) });
}
const report = {
  schemaVersion: 1, applicationId: "9N9XGSTD8889", metric: "store_acquisitions", source: "microsoft_report",
  coverage: { from: "2020-01-01", to: "2020-01-04" }, providerFreshness: "2020-01-05T03:04:05",
  rows: [{ date: "2020-01-01", country: "GB", version: null, value: 2 }, { date: "2020-01-02", country: "US", version: null, value: 3 }],
};
async function expectStatus(response: Response, expected: number) {
  assert.equal(response.status, expected);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return await response.json();
}

async function main() {
  Object.assign(process.env, environment);
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    observedNetwork.push(method + " " + url);
    assert.equal(method, "GET", "Authorization performs only read-only mocked requests");
    assert.ok(url.startsWith("https://microsoft-route-test.invalid/"), "No request can reach a production service");
    if (url.includes("/auth/v1/user")) return Response.json({ id: identity, aud: "authenticated", email: "isolated@example.invalid", created_at: "2020-01-01T00:00:00Z" });
    if (url.includes("/rest/v1/uploader_profiles")) return Response.json({ id: identity, email: "isolated@example.invalid", role, status });
    throw new Error("Unexpected network request in isolated Microsoft Store route test");
  };
  const path = join(directory, "microsoft-store.sqlite");
  await expectStatus(await GET(get("all", false)), 401);
  await expectStatus(await POST(post(report, { authenticated: false })), 401);
  for (role of ["uploader", "creator", "artist", "moderator", "upload_manager"]) {
    await expectStatus(await GET(get()), 403);
    await expectStatus(await POST(post(report)), 403);
  }
  role = "owner"; status = "inactive";
  await expectStatus(await GET(get()), 403);
  await expectStatus(await POST(post(report)), 403);
  status = "active";
  for (role of ["owner", "admin"]) {
    const result = await expectStatus(await GET(get()), 200);
    assert.equal(result.applicationId, "9N9XGSTD8889");
    assert.equal(result.metrics.store_acquisitions.value, null);
    assert.equal(result.metrics.store_installs.value, null);
    assert.equal(existsSync(path), false, "Authorized GET does not initialize a DB or seed zero counts");
  }
  role = "owner";
  await expectStatus(await GET(get("invalid")), 400);
  await expectStatus(await POST(post(report, { origin: "https://evil.example" })), 403);
  await expectStatus(await POST(post(report, { origin: "https://hiddentunes.com" })), 403);
  await expectStatus(await POST(post(report, { origin: null })), 403);
  await expectStatus(await POST(post(report, { type: "text/plain" })), 415);
  await expectStatus(await POST(post(report, { declared: "2000001" })), 413);
  await expectStatus(await POST(post(" ".repeat(2_000_001), { raw: true })), 413);
  await expectStatus(await POST(post("{invalid", { raw: true })), 400);
  await expectStatus(await POST(post({ ...report, source: "microsoft_api" })), 400);
  const privacy = await expectStatus(await POST(post({ ...report, userId: "PRIVATE_VALUE_MUST_NOT_ECHO" })), 400);
  assert.ok(!JSON.stringify(privacy).includes("PRIVATE_VALUE_MUST_NOT_ECHO"));
  await expectStatus(await POST(post({ ...report, applicationId: "different-product" })), 400);
  await expectStatus(await POST(post({ ...report, rows: [{ ...report.rows[0], value: Number.MAX_SAFE_INTEGER + 1 }] })), 400);
  assert.equal(existsSync(path), false, "Unauthorized and invalid reports never create storage");

  const imported = await expectStatus(await POST(post(report, { type: "application/json; charset=utf-8" })), 200);
  assert.deepEqual(imported, { imported: 2, duplicate: false });
  assert.deepEqual(await expectStatus(await POST(post(report)), 200), { imported: 0, duplicate: true });
  const current = await expectStatus(await GET(get()), 200);
  assert.equal(current.metrics.store_acquisitions.value, 5);
  assert.equal(current.metrics.store_installs.value, null);
  assert.equal(current.metrics.store_acquisitions.providerFreshness, report.providerFreshness);
  assert.equal(current.status, "MANUAL_IMPORT");
  assert.equal(current.trend.find((row: { date: string }) => row.date === "2020-01-03").store_acquisitions, 0);
  assert.equal(current.trend.find((row: { date: string }) => row.date === "2020-01-04").store_acquisitions, null);
  assert.ok(!("activeUsers" in current) && !("firstLaunches" in current), "Store reports do not fabricate client telemetry");

  const overlap = { ...report, coverage: { from: "2020-01-02", to: "2020-01-03" }, rows: [{ date: "2020-01-02", country: "US", version: null, value: 7 }] };
  role = "admin";
  assert.deepEqual(await expectStatus(await POST(post(overlap)), 200), { imported: 1, duplicate: false });
  const revised = await expectStatus(await GET(get()), 200);
  assert.equal(revised.metrics.store_acquisitions.value, 9, "Overlap replaces 3 with 7, retaining earlier 2");
  assert.equal(revised.countries.find((row: { country: string }) => row.country === "US").store_acquisitions, 7);

  const db = new DatabaseSync(path);
  try {
    db.exec("create trigger microsoft_route_failure before insert on microsoft_store_dimensions when new.value=777 begin select raise(abort,'PRIVATE_DATABASE_FAILURE'); end;");
    const failed = await expectStatus(await POST(post({ ...overlap, rows: [{ ...overlap.rows[0], value: 777 }] })), 503);
    assert.ok(!JSON.stringify(failed).includes("PRIVATE_DATABASE_FAILURE"));
    assert.ok(!JSON.stringify(failed).includes(directory));
    assert.equal((await expectStatus(await GET(get()), 200)).metrics.store_acquisitions.value, 9, "Storage failure preserves prior snapshot");
  } finally { db.exec("drop trigger microsoft_route_failure"); db.close(); }

  role = "owner"; nextIdentity();
  for (let i = 0; i < 6; i++) await expectStatus(await POST(post(overlap, { reuseIdentity: true })), 200);
  await expectStatus(await POST(post(overlap, { reuseIdentity: true })), 429);
  process.env.ANALYTICS_DATA_DIR = ".";
  const unavailable = await expectStatus(await GET(get()), 503);
  assert.equal(unavailable.error, "Microsoft Store reporting is temporarily unavailable.");
  assert.ok(!JSON.stringify(unavailable).includes(directory));
  assert.ok(observedNetwork.length > 0);
  assert.ok(observedNetwork.every(url => url.includes("/auth/v1/user") || url.includes("/rest/v1/uploader_profiles")), "Only permission reads were mocked; no catalog/playback/production writes");
  console.log("Microsoft Store routes: PASS (real shared owner/admin authorization; anonymous/inactive/role/origin/type/schema/source/byte/rate gates; isolated manual import, overlap, duplicate, zero-vs-unknown, safe storage errors; no production requests)");
}

void main().finally(() => {
  globalThis.fetch = originalFetch;
  closeMicrosoftStoreForTests();
  for (const [key, value] of Object.entries(previousEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const owned = resolve(directory), temp = resolve(tmpdir());
  assert.ok(owned.startsWith(temp + sep) && owned !== temp && !lstatSync(owned).isSymbolicLink());
  rmSync(owned, { recursive: true, force: true });
});
