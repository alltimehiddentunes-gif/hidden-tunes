import assert from "node:assert/strict";
import { fetchMicrosoftStoreReports, MicrosoftStoreClientError } from "../lib/distribution/microsoftStoreClient";

const APP = "9N9XGSTD8889";
const API = "https://manage.devcenter.microsoft.com/v1.0/my/analytics/";
const ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  MICROSOFT_STORE_TENANT_ID: "11111111-2222-3333-4444-555555555555",
  MICROSOFT_STORE_CLIENT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  MICROSOFT_STORE_CLIENT_SECRET: "SYNTHETIC_SECRET_+&= ONLY",
};
const RANGE = { from: "2026-09-09", to: "2026-09-10" };
const FRESH = "2026-09-10T03:04:05.1234567";
const TOKEN = "SYNTHETIC_TOKEN_ONLY";
const token = () => Response.json({ access_token: TOKEN, token_type: "Bearer", expires_in: 3600 });
const acq = (market = "GH", acquisitionQuantity: unknown = 3, date = RANGE.from) => ({ applicationId: APP, date, market, acquisitionQuantity });
const install = (market = "GH", packageVersion: unknown = "1.0.1.0", date = RANGE.from) => ({ applicationId: APP, date, market, packageVersion, successfulInstallCount: 2 });
function page(rows: unknown[], total = rows.length, next?: string | null, fresh?: string | null) {
  return Response.json({ Value: rows, TotalCount: total, ...(next !== undefined ? { "@nextLink": next } : {}), ...(fresh !== undefined ? { DataFreshnessTimestamp: fresh } : {}) });
}
type Call = { url: URL; init: RequestInit };
type MockReply = Response | ((call: Call) => Response | Promise<Response>);
function mock(replies: MockReply[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init };
    const reply = replies[calls.length]; calls.push(call);
    if (!reply) throw new Error("Unexpected mocked request; SYNTHETIC_SECRET");
    return typeof reply === "function" ? reply(call) : reply;
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const run = (fetchImpl: typeof fetch, options: Partial<Parameters<typeof fetchMicrosoftStoreReports>[0]> = {}) => fetchMicrosoftStoreReports({ ...RANGE, env: ENV, fetchImpl, ...options });
async function rejected(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, error => {
    assert.ok(error instanceof MicrosoftStoreClientError);
    assert.equal(error.code, code);
    for (const sensitive of [ENV.MICROSOFT_STORE_CLIENT_SECRET!, TOKEN, "PRIVATE_ERROR_BODY", "203.0.113.9"]) assert.ok(!String(error).includes(sensitive));
    return true;
  });
}
let checks = 0;
async function test(action: () => Promise<void>) { await action(); checks++; }
async function main() {
  await test(async () => {
    const m = mock([token(), page([{ ...acq(), userId: "PRIVATE_USER", ip: "203.0.113.9" }], 1, null, FRESH), page([install()])]);
    const reports = await run(m.fetchImpl);
    assert.equal(reports.length, 2); assert.equal(m.calls.length, 3);
    const auth = m.calls[0];
    assert.equal(auth.url.href, "https://login.microsoftonline.com/" + ENV.MICROSOFT_STORE_TENANT_ID + "/oauth2/token");
    const form = new URLSearchParams(String(auth.init.body));
    assert.equal(form.get("resource"), "https://manage.devcenter.microsoft.com");
    assert.equal(form.get("client_id"), ENV.MICROSOFT_STORE_CLIENT_ID);
    assert.equal(form.get("client_secret"), ENV.MICROSOFT_STORE_CLIENT_SECRET);
    assert.equal(form.get("grant_type"), "client_credentials");
    assert.ok(!auth.url.search);
    for (const call of m.calls) {
      assert.equal(call.init.redirect, "error"); assert.equal(call.init.credentials, "omit"); assert.equal(call.init.cache, "no-store");
      assert.ok(call.init.signal instanceof AbortSignal);
    }
    for (const call of m.calls.slice(1)) {
      assert.equal(call.url.origin, "https://manage.devcenter.microsoft.com");
      assert.equal(call.url.searchParams.get("applicationId"), APP);
      assert.equal(call.url.searchParams.get("startDate"), "09/09/2026");
      assert.equal(call.url.searchParams.get("endDate"), "09/09/2026");
      assert.equal(call.url.searchParams.get("aggregationLevel"), "day");
      assert.equal(new Headers(call.init.headers).get("Authorization"), "Bearer " + TOKEN);
    }
    assert.equal(m.calls[1].url.searchParams.get("groupby"), "date,market");
    assert.equal(m.calls[2].url.searchParams.get("groupby"), "date,market,packageVersion");
    assert.equal(reports[0].metric, "store_acquisitions"); assert.equal(reports[1].metric, "store_installs");
    assert.equal(reports[0].providerFreshness, FRESH); assert.equal(reports[1].providerFreshness, null);
    assert.deepEqual(reports[0].coverage, RANGE); assert.equal(reports[0].rows[0].version, null);
    assert.equal(reports[1].rows[0].version, "1.0.1.0");
    for (const report of reports) { assert.equal(report.applicationId, APP); assert.equal(report.source, "microsoft_api"); }
    for (const privateValue of ["PRIVATE_USER", "203.0.113.9", TOKEN, ENV.MICROSOFT_STORE_CLIENT_SECRET!]) assert.ok(!JSON.stringify(reports).includes(privateValue));
  });
  await test(async () => {
    const m = mock([token(), page([acq("GH")], 2, API + "appacquisitions?skip=1", FRESH), page([acq("US")], 2, null, FRESH), page([install()])]);
    const reports = await run(m.fetchImpl);
    assert.equal(reports[0].rows.length, 2);
    assert.equal(m.calls[2].url.searchParams.get("skip"), "1");
    assert.equal(m.calls[2].url.searchParams.get("applicationId"), APP);
    assert.equal(m.calls[2].url.searchParams.get("groupby"), "date,market");
  });
  await test(async () => {
    const secondDay = "2026-09-10";
    const m = mock([token(), page([acq()]), page([install()]), page([acq("GH", 1, secondDay)]), page([install("US", "1.0.2.0", secondDay)])]);
    const reports = await run(m.fetchImpl, { to: "2026-09-11" });
    assert.equal(reports.length, 4);
    assert.deepEqual(reports.map(r => r.coverage), [RANGE, RANGE, { from: secondDay, to: "2026-09-11" }, { from: secondDay, to: "2026-09-11" }]);
  });
  await test(async () => {
    const m = mock([token(), page([], 0), page([], 0)]);
    const reports = await run(m.fetchImpl);
    assert.ok(reports.every(r => r.rows.length === 0 && r.providerFreshness === null));
  });
  await test(async () => {
    const m = mock([]);
    await rejected(() => run(m.fetchImpl, { env: { NODE_ENV: "test" } }), "NOT_CONFIGURED");
    await rejected(() => run(m.fetchImpl, { env: { ...ENV, MICROSOFT_STORE_TENANT_ID: "https://private.invalid/credential" } }), "INVALID_CONFIGURATION");
    assert.equal(m.calls.length, 0);
  });
  await test(async () => {
    const m = mock([]);
    await rejected(() => run(m.fetchImpl, { from: "2026-02-31" }), "INVALID_RANGE");
    await rejected(() => run(m.fetchImpl, { from: "2026-07-01", to: "2026-08-02" }), "INVALID_RANGE");
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    await rejected(() => run(m.fetchImpl, { from: today.toISOString().slice(0, 10), to: new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10) }), "INVALID_RANGE");
    assert.equal(m.calls.length, 0);
  });
  await test(async () => {
    for (const row of [{ ...acq(), applicationId: "WRONG_PRODUCT" }, { ...acq(), date: "2026-09-08" }, { ...acq(), date: undefined }]) {
      const m = mock([token(), page([row])]); await rejected(() => run(m.fetchImpl), "INVALID_RESPONSE");
    }
  });
  await test(async () => {
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, "4"]) {
      const m = mock([token(), page([acq("GH", value)])]); await rejected(() => run(m.fetchImpl), "INVALID_RESPONSE");
    }
    const m = mock([token(), page([acq("GH", Number.MAX_SAFE_INTEGER), acq("US", 1)])]);
    await rejected(() => run(m.fetchImpl), "RESPONSE_LIMIT");
  });
  await test(async () => {
    for (const market of ["All", "", "Unknown", "203.0.113.9"]) {
      const m = mock([token(), page([acq(market)])]); await rejected(() => run(m.fetchImpl), "INVALID_RESPONSE");
    }
  });
  await test(async () => {
    for (const version of ["1.0.1", "1.0.1.65536", "https://private.invalid", null]) {
      const m = mock([token(), page([acq()]), page([install("GH", version)])]); await rejected(() => run(m.fetchImpl), "INVALID_RESPONSE");
    }
  });
  await test(async () => {
    const m = mock([token(), page([acq()], 2, "https://untrusted.invalid/collect?skip=1")]);
    await rejected(() => run(m.fetchImpl), "INVALID_PAGINATION"); assert.equal(m.calls.length, 2);
  });
  await test(async () => {
    const m = mock([token(), page([acq()], 2, API + "appacquisitions?skip=0")]);
    await rejected(() => run(m.fetchImpl), "INVALID_PAGINATION");
  });
  await test(async () => {
    const m = mock([token(), page([acq()], 2, API + "appacquisitions?skip=1"), page([acq()], 2)]);
    await rejected(() => run(m.fetchImpl), "DUPLICATE_ROW");
  });
  await test(async () => {
    const m = mock([token(), page([acq()], 2, API + "appacquisitions?skip=1"), page([acq("US")], 3)]);
    await rejected(() => run(m.fetchImpl), "UNSTABLE_REPORT");
  });
  await test(async () => {
    const m = mock([token(), page([acq()], 2, API + "appacquisitions?skip=1", FRESH), page([acq("US")], 2, null, FRESH + "Z")]);
    await rejected(() => run(m.fetchImpl), "UNSTABLE_REPORT");
  });
  await test(async () => {
    for (const response of [page([acq()], 2), page([], 1), page([acq()], 0), page([acq()], 1, API + "appacquisitions?skip=1")]) {
      const m = mock([token(), response]); await rejected(() => run(m.fetchImpl), "INCOMPLETE_REPORT");
    }
  });
  await test(async () => {
    const m = mock([token(), page([acq()], 2, API + "appacquisitions?skip=1"), new Response("PRIVATE_ERROR_BODY " + TOKEN, { status: 503 })]);
    let result: unknown;
    await rejected(async () => { result = await run(m.fetchImpl); }, "HTTP_ERROR");
    assert.equal(result, undefined); assert.equal(m.calls.length, 3);
  });
  await test(async () => {
    const m = mock([token(), page([acq()]), new Response("PRIVATE_ERROR_BODY", { status: 429 })]);
    let result: unknown;
    await rejected(async () => { result = await run(m.fetchImpl); }, "RATE_LIMITED");
    assert.equal(result, undefined);
  });
  await test(async () => {
    const m = mock([() => { throw new Error("PRIVATE_ERROR_BODY " + ENV.MICROSOFT_STORE_CLIENT_SECRET); }]);
    await rejected(() => run(m.fetchImpl), "REQUEST_FAILED");
    const bad = mock([new Response("PRIVATE_ERROR_BODY " + TOKEN, { headers: { "Content-Type": "application/json" } })]);
    await rejected(() => run(bad.fetchImpl), "REQUEST_FAILED");
  });
  await test(async () => {
    const m = mock([token(), new Response("x".repeat(4 * 1024 * 1024 + 1), { headers: { "Content-Type": "application/json" } })]);
    await rejected(() => run(m.fetchImpl), "RESPONSE_LIMIT");
  });
  await test(async () => {
    const m = mock([token(), page([acq()], 1, null, "PRIVATE_ERROR_BODY")]);
    await rejected(() => run(m.fetchImpl), "INVALID_RESPONSE");
  });
  await test(async () => {
    const tooMany = mock([token(), page([], 20_001)]);
    await rejected(() => run(tooMany.fetchImpl), "INVALID_RESPONSE");
    const earlier = mock([]);
    await rejected(() => run(earlier.fetchImpl, { from: "2014-12-30", to: "2014-12-31" }), "INVALID_RANGE");
    assert.equal(earlier.calls.length, 0);
  });

  console.log("PASS Microsoft Store API client: " + checks + " mocked checks; audience, query contract, daily coverage, pagination, privacy, redaction, limits and no partial returns.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
