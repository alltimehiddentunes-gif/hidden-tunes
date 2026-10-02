import type { MicrosoftStoreImport } from "./microsoftStoreTypes";

const APPLICATION_ID = "9N9XGSTD8889" as const;
const API_ORIGIN = "https://manage.devcenter.microsoft.com";
const API_PATH = "/v1.0/my/analytics/";
const DAY_MS = 86_400_000;
const PAGE_SIZE = 10_000;
const MAX_PAGES = 20;
const MAX_QUERY_ROWS = 20_000;
const MAX_TOTAL_ROWS = 100_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
type Metric = MicrosoftStoreImport["metric"];
type Budget = { bytes: number; rows: number; deadline: number };
type Json = Record<string, unknown>;
type Options = { from: string; to: string; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch };
const REPORTS: Array<{ metric: Metric; endpoint: string; count: string; groupby: string }> = [
  { metric: "store_acquisitions", endpoint: "appacquisitions", count: "acquisitionQuantity", groupby: "date,market" },
  { metric: "store_installs", endpoint: "installs", count: "successfulInstallCount", groupby: "date,market,packageVersion" },
];

export class MicrosoftStoreClientError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "MicrosoftStoreClientError"; }
}
function fail(code: string, message: string): never { throw new MicrosoftStoreClientError(code, message); }
function record(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_RESPONSE", "Microsoft Store returned an invalid report.");
  return value as Json;
}
function dayValue(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("INVALID_RANGE", "Use ISO calendar dates for the reporting interval.");
  const ms = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) fail("INVALID_RANGE", "The reporting interval contains an invalid date.");
  return ms;
}
function days(options: Options): string[] {
  const from = dayValue(options.from), to = dayValue(options.to);
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  if (options.from < "2015-01-01" || from >= to || to - from > 31 * DAY_MS || to > today) fail("INVALID_RANGE", "Request between one and 31 completed UTC days; to is exclusive.");
  return Array.from({ length: (to - from) / DAY_MS }, (_, i) => new Date(from + i * DAY_MS).toISOString().slice(0, 10));
}
function credentials(env: NodeJS.ProcessEnv) {
  const tenant = env.MICROSOFT_STORE_TENANT_ID?.trim();
  const client = env.MICROSOFT_STORE_CLIENT_ID?.trim();
  const secret = env.MICROSOFT_STORE_CLIENT_SECRET;
  const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!tenant || !client || !secret?.trim()) fail("NOT_CONFIGURED", "Microsoft Store analytics credentials are not configured.");
  if (!guid.test(tenant) || !guid.test(client) || secret.length > 4096) fail("INVALID_CONFIGURATION", "Microsoft Store analytics configuration is invalid.");
  return { tenant, client, secret };
}
async function jsonRequest(url: string, init: RequestInit, fetcher: typeof fetch, budget: Budget, kind: "token" | "report"): Promise<Json> {
  const remaining = Math.min(REQUEST_TIMEOUT_MS, budget.deadline - Date.now());
  if (remaining <= 0) fail("TIMEOUT", "Microsoft Store reporting exceeded its time limit.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new MicrosoftStoreClientError("TIMEOUT", "Microsoft Store request timed out.")); }, remaining);
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await Promise.race([fetcher(url, { ...init, signal: controller.signal, redirect: "error", cache: "no-store", credentials: "omit" }), deadline]);
    if (response.status !== 200) {
      if (response.status === 429) fail("RATE_LIMITED", "Microsoft Store analytics is rate limited. Retry later.");
      fail("HTTP_ERROR", "Microsoft Store " + kind + " request failed (HTTP " + response.status + ").");
    }
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!contentType || !/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/.test(contentType)) fail("INVALID_RESPONSE", "Microsoft Store returned an unexpected response format.");
    const limit = kind === "token" ? 65_536 : MAX_BODY_BYTES;
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) fail("RESPONSE_LIMIT", "Microsoft Store response exceeds the allowed size.");
    reader = response.body?.getReader();
    if (!reader) fail("INVALID_RESPONSE", "Microsoft Store returned an empty response.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      budget.bytes += value.byteLength;
      if (size > limit || budget.bytes > MAX_TOTAL_BYTES) fail("RESPONSE_LIMIT", "Microsoft Store response exceeds the allowed size.");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (error) {
    if (error instanceof MicrosoftStoreClientError) throw error;
    return fail("REQUEST_FAILED", "Microsoft Store request failed; no partial report was returned.");
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    if (reader) { void reader.cancel().catch(() => {}); }
  }
}
function freshness(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) fail("INVALID_RESPONSE", "Microsoft Store freshness metadata is invalid.");
  dayValue(value.slice(0, 10));
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59
    || !Number.isFinite(Date.parse(/[Z+-]/.test(value.slice(19)) ? value : value + "Z"))) fail("INVALID_RESPONSE", "Microsoft Store freshness metadata is invalid.");
  return value; // Preserve the provider's literal timezone/precision; never replace with polling time.
}
function parseRow(value: unknown, date: string, report: typeof REPORTS[number]): MicrosoftStoreImport["rows"][number] {
  const row = record(value);
  if (row.applicationId !== APPLICATION_ID || row.date !== date) fail("INVALID_RESPONSE", "Microsoft Store returned a different product or reporting date.");
  if (typeof row.market !== "string" || !/^[A-Z]{2}$/.test(row.market)) fail("INVALID_RESPONSE", "Microsoft Store must return an explicit country code, not a total or missing market.");
  const count = row[report.count];
  if (!Number.isSafeInteger(count) || Number(count) < 0) fail("INVALID_RESPONSE", "Microsoft Store returned an invalid counter.");
  let version: string | null = null;
  if (report.metric === "store_installs") {
    if (typeof row.packageVersion !== "string" || !/^\d{1,5}(?:\.\d{1,5}){3}$/.test(row.packageVersion)
      || row.packageVersion.split(".").some(part => Number(part) > 65535)) fail("INVALID_RESPONSE", "Microsoft Store returned an invalid MSIX package version.");
    version = row.packageVersion;
  }
  return { date, country: row.market, version, value: count as number };
}
function nextPage(value: unknown, current: URL, nextSkip: number): boolean {
  if (value == null) return false;
  if (typeof value !== "string" || !value || value.length > 4096) fail("INVALID_PAGINATION", "Microsoft Store pagination metadata is invalid.");
  let next: URL;
  try { next = new URL(value, API_ORIGIN); } catch { fail("INVALID_PAGINATION", "Microsoft Store pagination metadata is invalid."); }
  if (next.origin !== API_ORIGIN || next.pathname !== current.pathname || next.username || next.password || next.hash) fail("INVALID_PAGINATION", "Microsoft Store returned an unsafe pagination link.");
  for (const key of ["applicationId", "startDate", "endDate", "aggregationLevel", "groupby", "orderby", "top"]) {
    const values = next.searchParams.getAll(key);
    if (values.length > 1 || (values.length === 1 && values[0] !== current.searchParams.get(key))) fail("INVALID_PAGINATION", "Microsoft Store pagination changed the reporting query.");
  }
  if (next.searchParams.getAll("skip").length > 1 || (next.searchParams.has("skip") && next.searchParams.get("skip") !== String(nextSkip))) fail("INVALID_PAGINATION", "Microsoft Store pagination did not advance correctly.");
  return true; // Never fetch this URL; requests are reconstructed from our fixed query.
}
async function dailyReport(date: string, report: typeof REPORTS[number], token: string, fetcher: typeof fetch, budget: Budget): Promise<MicrosoftStoreImport> {
  const url = new URL(API_PATH + report.endpoint, API_ORIGIN);
  const apiDate = date.slice(5, 7) + "/" + date.slice(8, 10) + "/" + date.slice(0, 4);
  url.search = new URLSearchParams({ applicationId: APPLICATION_ID, startDate: apiDate, endDate: apiDate, aggregationLevel: "day", groupby: report.groupby, orderby: report.groupby, top: String(PAGE_SIZE), skip: "0" }).toString();
  const rows: MicrosoftStoreImport["rows"] = [];
  const seen = new Set<string>();
  let expected: number | undefined, providerFreshness: string | null | undefined;
  let sum = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    url.searchParams.set("skip", String(rows.length));
    const body = await jsonRequest(url.href, { method: "GET", headers: { Authorization: "Bearer " + token, Accept: "application/json" } }, fetcher, budget, "report");
    if (!Array.isArray(body.Value) || body.Value.length > PAGE_SIZE || !Number.isSafeInteger(body.TotalCount) || Number(body.TotalCount) < 0 || Number(body.TotalCount) > MAX_QUERY_ROWS) fail("INVALID_RESPONSE", "Microsoft Store returned an invalid page or row count.");
    if (expected !== undefined && expected !== body.TotalCount) fail("UNSTABLE_REPORT", "Microsoft Store report changed during pagination; retry the complete report.");
    expected = body.TotalCount as number;
    const pageFreshness = freshness(body.DataFreshnessTimestamp);
    if (providerFreshness !== undefined && providerFreshness !== pageFreshness) fail("UNSTABLE_REPORT", "Microsoft Store freshness changed during pagination; retry the complete report.");
    providerFreshness = pageFreshness;
    if ((!body.Value.length && rows.length < expected) || rows.length + body.Value.length > expected) fail("INCOMPLETE_REPORT", "Microsoft Store returned incomplete or inconsistent pagination.");
    for (const value of body.Value) {
      const row = parseRow(value, date, report);
      const key = JSON.stringify([row.date, row.country, row.version]);
      if (seen.has(key)) fail("DUPLICATE_ROW", "Microsoft Store returned a duplicate grouped row.");
      seen.add(key);
      sum += row.value;
      if (!Number.isSafeInteger(sum) || ++budget.rows > MAX_TOTAL_ROWS) fail("RESPONSE_LIMIT", "Microsoft Store aggregate exceeds safe limits.");
      rows.push(row);
    }
    const hasNext = nextPage(body["@nextLink"], url, rows.length);
    if (rows.length === expected) {
      if (hasNext) fail("INCOMPLETE_REPORT", "Microsoft Store pagination continues beyond its reported total.");
      const result: MicrosoftStoreImport = {
        schemaVersion: 1, applicationId: APPLICATION_ID, metric: report.metric, source: "microsoft_api",
        coverage: { from: date, to: new Date(dayValue(date) + DAY_MS).toISOString().slice(0, 10) },
        providerFreshness: providerFreshness ?? null, rows,
      };
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2_000_000)
        fail("RESPONSE_LIMIT", "Microsoft Store normalized report exceeds the import size limit.");
      return result;
    }
    if (!hasNext) fail("INCOMPLETE_REPORT", "Microsoft Store omitted a required continuation page.");
  }
  fail("RESPONSE_LIMIT", "Microsoft Store report exceeded the pagination limit.");
}

/** Complete daily MSIX reports only; no persistence, UI scraping, console output or partial return. */
export async function fetchMicrosoftStoreReports(options: Options): Promise<MicrosoftStoreImport[]> {
  const dates = days(options);
  const { tenant, client, secret } = credentials(options.env ?? process.env);
  const fetcher = options.fetchImpl ?? fetch;
  const budget: Budget = { bytes: 0, rows: 0, deadline: Date.now() + 15 * 60_000 };
  const tokenBody = await jsonRequest("https://login.microsoftonline.com/" + tenant + "/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: client, client_secret: secret, resource: API_ORIGIN }).toString(),
  }, fetcher, budget, "token");
  if (typeof tokenBody.access_token !== "string" || !/^[a-z0-9._~+\/-]+=*$/i.test(tokenBody.access_token) || tokenBody.access_token.length > 32768
    || (tokenBody.token_type != null && String(tokenBody.token_type).toLowerCase() !== "bearer")) fail("INVALID_RESPONSE", "Microsoft Store authentication returned an invalid token response.");
  const reports: MicrosoftStoreImport[] = [];
  for (const date of dates) {
    for (const report of REPORTS) reports.push(await dailyReport(date, report, tokenBody.access_token, fetcher, budget));
  }
  return reports;
}
