import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { APPLE_APP_STORE_APPLE_ID } from "./appleAppStoreTypes";
import type { AppleAppStoreImport } from "./appleAppStoreTypes";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const DAY_MS = 86_400_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const UNIT_TYPES = new Set(["1", "1F", "1T"]);
const UPDATE_TYPES = new Set(["7", "7F", "7T"]);
type Options = { from: string; to: string; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch };
type Budget = { bytes: number; deadline: number };

export class AppleAppStoreClientError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "AppleAppStoreClientError"; }
}
function fail(code: string, message: string): never { throw new AppleAppStoreClientError(code, message); }
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
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function credentials(env: NodeJS.ProcessEnv) {
  const issuer = env.APPLE_ASC_ISSUER_ID?.trim();
  const keyId = env.APPLE_ASC_KEY_ID?.trim();
  const vendor = env.APPLE_ASC_VENDOR_NUMBER?.trim();
  const pemInline = env.APPLE_ASC_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const pemPath = env.APPLE_ASC_PRIVATE_KEY_PATH?.trim();
  if (!issuer || !keyId || !vendor || (!pemInline && !pemPath)) fail("NOT_CONFIGURED", "Apple App Store Connect credentials are not configured.");
  if (!/^[0-9a-f-]{8,64}$/i.test(issuer) || !/^[A-Z0-9]{8,16}$/i.test(keyId) || !/^\d{1,15}$/.test(vendor)) fail("INVALID_CONFIGURATION", "Apple App Store Connect configuration is invalid.");
  let pem = pemInline || "";
  if (!pem && pemPath) {
    if (!pemPath.endsWith(".p8") || pemPath.includes("..")) fail("INVALID_CONFIGURATION", "Apple private key path is invalid.");
    try { pem = readFileSync(pemPath, "utf8"); } catch { fail("INVALID_CONFIGURATION", "Apple private key file could not be read."); }
  }
  if (!pem.includes("BEGIN PRIVATE KEY") || pem.length > 16_384) fail("INVALID_CONFIGURATION", "Apple private key material is invalid.");
  return { issuer, keyId, vendor, pem };
}
function createToken(env: NodeJS.ProcessEnv): string {
  const { issuer, keyId, pem } = credentials(env);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 16 * 60, aud: "appstoreconnect-v1" }));
  const data = `${header}.${payload}`;
  let key;
  try { key = createPrivateKey(pem); } catch { fail("INVALID_CONFIGURATION", "Apple private key material is invalid."); }
  const signer = createSign("SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  return `${data}.${b64url(signature)}`;
}
async function fetchBytes(url: string, token: string, fetcher: typeof fetch, budget: Budget): Promise<Buffer> {
  const remaining = Math.min(REQUEST_TIMEOUT_MS, budget.deadline - Date.now());
  if (remaining <= 0) fail("TIMEOUT", "Apple App Store reporting exceeded its time limit.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new AppleAppStoreClientError("TIMEOUT", "Apple App Store request timed out.")); }, remaining);
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await Promise.race([fetcher(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/a-gzip, application/json" },
      redirect: "error", cache: "no-store", credentials: "omit", signal: controller.signal,
    }), deadline]);
    if (response.status === 404) fail("REPORT_UNAVAILABLE", "Apple Sales report is not available for this date yet.");
    if (response.status === 401 || response.status === 403) fail("UNAUTHORIZED", "Apple App Store Connect rejected the analytics credentials.");
    if (response.status === 429) fail("RATE_LIMITED", "Apple App Store analytics is rate limited. Retry later.");
    if (response.status !== 200) fail("HTTP_ERROR", "Apple App Store report request failed (HTTP " + response.status + ").");
    reader = response.body?.getReader();
    if (!reader) fail("INVALID_RESPONSE", "Apple App Store returned an empty response.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      budget.bytes += value.byteLength;
      if (size > MAX_BODY_BYTES || budget.bytes > MAX_BODY_BYTES * 8) fail("RESPONSE_LIMIT", "Apple App Store response exceeds the allowed size.");
      chunks.push(value);
    }
    const bytes = Buffer.allocUnsafe(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } catch (error) {
    if (error instanceof AppleAppStoreClientError) throw error;
    fail("REQUEST_FAILED", "Apple App Store request failed; no partial report was returned.");
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    if (reader) { void reader.cancel().catch(() => {}); }
  }
}
function parseSalesReport(raw: Buffer, reportDate: string): { units: AppleAppStoreImport["rows"]; updates: AppleAppStoreImport["rows"] } {
  let text: string;
  try { text = gunzipSync(raw).toString("utf8"); }
  catch {
    try { text = raw.toString("utf8"); } catch { fail("INVALID_RESPONSE", "Apple App Store returned an undecodable report."); }
  }
  if (text.length > 20_000_000) fail("RESPONSE_LIMIT", "Apple App Store report text exceeds the allowed size.");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { units: [], updates: [] };
  const headers = lines[0].split("\t");
  const index = (name: string) => {
    const i = headers.indexOf(name);
    if (i < 0) fail("INVALID_RESPONSE", "Apple Sales report is missing a required column.");
    return i;
  };
  const appleIdIdx = index("Apple Identifier");
  const typeIdx = index("Product Type Identifier");
  const unitsIdx = index("Units");
  const countryIdx = index("Country Code");
  const versionIdx = headers.indexOf("Version");
  const beginIdx = headers.indexOf("Begin Date");
  const unitsMap = new Map<string, number>();
  const updatesMap = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    if (cols[appleIdIdx] !== APPLE_APP_STORE_APPLE_ID) continue;
    if (beginIdx >= 0 && cols[beginIdx]) {
      const begin = cols[beginIdx];
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(begin);
      if (m) {
        const iso = `${m[3]}-${m[1]}-${m[2]}`;
        if (iso !== reportDate) continue;
      }
    }
    const productType = cols[typeIdx];
    const count = Number(cols[unitsIdx]);
    if (!Number.isSafeInteger(count) || count < 0) fail("INVALID_RESPONSE", "Apple Sales report returned an invalid Units counter.");
    const country = (cols[countryIdx] || "ZZ").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) fail("INVALID_RESPONSE", "Apple Sales report returned an invalid country code.");
    const version = versionIdx >= 0 && cols[versionIdx] ? cols[versionIdx].trim() : "";
    if (version && (version.length > 32 || !/^[0-9][0-9A-Za-z.+_-]*$/.test(version))) fail("INVALID_RESPONSE", "Apple Sales report returned an invalid version.");
    const key = JSON.stringify([reportDate, country, version || null]);
    if (UNIT_TYPES.has(productType)) unitsMap.set(key, (unitsMap.get(key) || 0) + count);
    else if (UPDATE_TYPES.has(productType)) updatesMap.set(key, (updatesMap.get(key) || 0) + count);
  }
  const toRows = (map: Map<string, number>) => [...map.entries()].map(([key, value]) => {
    const [date, country, version] = JSON.parse(key) as [string, string, string | null];
    return { date, country, version, value };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { units: toRows(unitsMap), updates: toRows(updatesMap) };
}

async function dailyReports(date: string, token: string, vendor: string, fetcher: typeof fetch, budget: Budget): Promise<AppleAppStoreImport[]> {
  const url = new URL("/v1/salesReports", API_ORIGIN);
  url.search = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportType]": "SALES",
    "filter[reportSubType]": "SUMMARY",
    "filter[vendorNumber]": vendor,
    "filter[reportDate]": date,
  }).toString();
  const bytes = await fetchBytes(url.href, token, fetcher, budget);
  const parsed = parseSalesReport(bytes, date);
  const coverage = { from: date, to: new Date(dayValue(date) + DAY_MS).toISOString().slice(0, 10) };
  const base = { schemaVersion: 1 as const, appleId: APPLE_APP_STORE_APPLE_ID, source: "apple_api" as const, coverage, providerFreshness: null };
  return [
    { ...base, metric: "store_units" as const, rows: parsed.units },
    { ...base, metric: "store_updates" as const, rows: parsed.updates },
  ];
}

/** Complete daily Sales SUMMARY reports for Hidden Tunes only; no persistence or partial return. */
export async function fetchAppleAppStoreReports(options: Options): Promise<AppleAppStoreImport[]> {
  const dates = days(options);
  const env = options.env ?? process.env;
  const { vendor } = credentials(env);
  const token = createToken(env);
  const fetcher = options.fetchImpl ?? fetch;
  const budget: Budget = { bytes: 0, deadline: Date.now() + 15 * 60_000 };
  const reports: AppleAppStoreImport[] = [];
  for (const date of dates) reports.push(...await dailyReports(date, token, vendor, fetcher, budget));
  return reports;
}
