import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync as NativeDatabaseSync } from "node:sqlite";
import { APPLE_APP_STORE_APPLE_ID, APPLE_APP_STORE_APP_NAME } from "./appleAppStoreTypes";
import type { AppleAppStoreImport, AppleAppStoreMetric, AppleAppStoreMetricSummary, AppleAppStorePeriod, AppleAppStoreSource, AppleAppStoreSummary } from "./appleAppStoreTypes";

type SqlValue = string | number | null;
type SqlRow = Record<string, SqlValue>;
type Database = {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: SqlValue[]): unknown; get(...values: SqlValue[]): SqlRow | undefined; all(...values: SqlValue[]): SqlRow[] };
  close(): void;
};
type DayRow = { date: string; metric: AppleAppStoreMetric; value: number; source: AppleAppStoreSource; imported_at: string; provider_freshness: string | null; snapshot_id: number };
const DAY = 86_400_000;
const EARLIEST = "2015-01-01";
const METRICS: AppleAppStoreMetric[] = ["store_units", "store_updates"];
const MAX_ROWS = 20_000, MAX_BYTES = 2_000_000, MAX_DAYS = 50_000, MAX_VERSIONS = 2_000;
const SETTING_NAMES = ["APPLE_ASC_ISSUER_ID", "APPLE_ASC_KEY_ID", "APPLE_ASC_VENDOR_NUMBER"] as const;
let cached: { path: string; writable: boolean; db: Database } | null = null;

export class AppleAppStoreError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "AppleAppStoreError"; }
}
function fail(code: string, message: string): never { throw new AppleAppStoreError(code, message); }
function date(ms: number) { return new Date(ms).toISOString().slice(0, 10); }
function midnight(value: string) { return Date.parse(value + "T00:00:00.000Z"); }
function tomorrow(now = Date.now()) { return date(Math.floor(now / DAY) * DAY + DAY); }
function strictObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail("INVALID_REPORT", "Unexpected report fields.");
  return value as Record<string, unknown>;
}
function reportDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(midnight(value)) || date(midnight(value)) !== value || value < EARLIEST) fail("INVALID_REPORT", "Invalid report date.");
  return value;
}
function safeAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0 || left > Number.MAX_SAFE_INTEGER - right) fail("COUNTER_OVERFLOW", "Report total exceeds the supported safe integer range.");
  return left + right;
}
function appVersion(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > 32 || !/^[0-9][0-9A-Za-z.+_-]*$/.test(value)) fail("INVALID_REPORT", "Invalid Apple app version.");
  return value;
}
function freshness(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 40) fail("INVALID_REPORT", "Invalid provider timestamp.");
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))?)?$/.exec(value);
  if (!match || (match[2] && (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59)) || (match[5] && (Number(match[5]) > 23 || Number(match[6]) > 59))) fail("INVALID_REPORT", "Invalid provider timestamp.");
  reportDate(match[1]);
  return value;
}
function privateKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.APPLE_ASC_PRIVATE_KEY?.trim() || env.APPLE_ASC_PRIVATE_KEY_PATH?.trim());
}
export function appleAppStoreConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return SETTING_NAMES.every(name => Boolean(env[name]?.trim())) && privateKeyConfigured(env);
}

export function validateAppleAppStoreReport(input: unknown): AppleAppStoreImport {
  const doc = strictObject(input, ["schemaVersion", "appleId", "metric", "source", "coverage", "providerFreshness", "rows"]);
  if (doc.schemaVersion !== 1 || doc.appleId !== APPLE_APP_STORE_APPLE_ID || !METRICS.includes(doc.metric as AppleAppStoreMetric) || typeof doc.source !== "string" || !["apple_api", "apple_report"].includes(doc.source)) fail("INVALID_REPORT", "Unsupported Apple App Store report.");
  const window = strictObject(doc.coverage, ["from", "to"]);
  const from = reportDate(window.from), to = reportDate(window.to);
  if (from >= to || midnight(to) - midnight(from) > 366 * DAY || to > tomorrow()) fail("INVALID_REPORT", "Invalid report coverage.");
  if (!Array.isArray(doc.rows) || doc.rows.length > MAX_ROWS) fail("INVALID_REPORT", "Report row limit exceeded.");
  const keys = new Set<string>();
  let total = 0;
  const rows = doc.rows.map(value => {
    const row = strictObject(value, ["date", "country", "version", "value"]);
    const rowDate = reportDate(row.date);
    if (rowDate < from || rowDate >= to) fail("INVALID_REPORT", "Report row falls outside its coverage.");
    if (typeof row.country !== "string" || !/^[A-Z]{2}$/.test(row.country)) fail("INVALID_REPORT", "Country must be a coarse two-letter code or ZZ.");
    if (typeof row.value !== "number" || !Number.isSafeInteger(row.value) || row.value < 0) fail("INVALID_REPORT", "Invalid report counter.");
    const version = appVersion(row.version);
    const key = JSON.stringify([rowDate, row.country, version]);
    if (keys.has(key)) fail("INVALID_REPORT", "Duplicate report dimension.");
    keys.add(key);
    total = safeAdd(total, row.value);
    return { date: rowDate, country: row.country, version, value: row.value };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const result: AppleAppStoreImport = { schemaVersion: 1, appleId: APPLE_APP_STORE_APPLE_ID, metric: doc.metric as AppleAppStoreMetric, source: doc.source as AppleAppStoreSource, coverage: { from, to }, providerFreshness: freshness(doc.providerFreshness), rows };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_BYTES) fail("INVALID_REPORT", "Report payload limit exceeded.");
  return result;
}

function pathInside(value: string, parent: string) {
  const a = process.platform === "win32" ? value.toLowerCase() : value;
  const b = process.platform === "win32" ? parent.toLowerCase() : parent;
  return a === b || a.startsWith(b + sep);
}
function storePath(create: boolean) {
  const configured = process.env.ANALYTICS_DATA_DIR?.trim();
  if (!configured && process.platform === "win32") fail("NOT_CONFIGURED", "Analytics storage requires an explicit absolute data directory on Windows.");
  const directory = configured || "/var/lib/hidden-tunes-analytics";
  if (!isAbsolute(directory)) fail("INVALID_PATH", "Analytics storage must be an absolute path.");
  const full = resolve(directory), cwd = realpathSync(process.cwd());
  if (pathInside(full, resolve(process.cwd()))) fail("INVALID_PATH", "Analytics storage must be outside the application directory.");
  let ancestor = full;
  while (!existsSync(ancestor)) {
    if (lstatSync(ancestor, { throwIfNoEntry: false })?.isSymbolicLink()) fail("INVALID_PATH", "Analytics storage cannot use a dangling directory symlink.");
    const parent = dirname(ancestor);
    if (parent === ancestor) fail("INVALID_PATH", "Analytics storage has no valid ancestor.");
    ancestor = parent;
  }
  if (pathInside(resolve(realpathSync(ancestor), relative(ancestor, full)), cwd)) fail("INVALID_PATH", "Analytics storage cannot resolve inside the application directory.");
  if (create) mkdirSync(full, { recursive: true, mode: 0o700 });
  if (existsSync(full) && pathInside(realpathSync(full), cwd)) fail("INVALID_PATH", "Analytics storage cannot resolve inside the application directory.");
  if (create && process.platform !== "win32") chmodSync(full, 0o700);
  const path = join(full, "apple-app-store.sqlite");
  if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) fail("INVALID_PATH", "Analytics database must not be a symlink.");
  return path;
}
function connection(create: boolean): Database | null {
  const path = storePath(create);
  if (cached && (cached.path !== path || create && !cached.writable)) closeAppleAppStoreForTests();
  if (cached) return cached.db;
  if (!create && !existsSync(path)) return null;
  const db = new NativeDatabaseSync(path, { readOnly: !create }) as Database;
  try {
    db.exec("pragma busy_timeout=2000");
    if (create) {
      if (process.platform !== "win32") chmodSync(path, 0o600);
      db.exec("pragma journal_mode=WAL; pragma synchronous=FULL;");
      db.exec(
        "create table if not exists apple_app_store_days(metric text not null check(metric in('store_units','store_updates')),date text not null,value integer not null check(value>=0),source text not null,imported_at text not null,provider_freshness text,snapshot_id integer not null,primary key(metric,date)) without rowid;" +
        "create table if not exists apple_app_store_dimensions(metric text not null,date text not null,country text not null,version text not null,value integer not null check(value>=0),primary key(metric,date,country,version)) without rowid;" +
        "create table if not exists apple_app_store_import_journal(snapshot_id integer primary key autoincrement,content_hash text not null,metric text not null,source text not null,from_date text not null,to_date text not null,imported_at text not null,row_count integer not null);" +
        "create trigger if not exists apple_app_store_journal_no_update before update on apple_app_store_import_journal begin select raise(abort,'append_only'); end;" +
        "create trigger if not exists apple_app_store_journal_no_delete before delete on apple_app_store_import_journal begin select raise(abort,'append_only'); end;"
      );
    }
    cached = { path, writable: create, db };
    return db;
  } catch (error) { db.close(); throw error; }
}
export function closeAppleAppStoreForTests() { if (cached) { cached.db.close(); cached = null; } }
function atomic<T>(db: Database, fn: () => T) {
  db.exec("begin immediate");
  try { const result = fn(); db.exec("commit"); return result; }
  catch (error) { db.exec("rollback"); throw error; }
}
function readDays(db: Database, from: string, to: string): DayRow[] {
  const rows = db.prepare("select * from apple_app_store_days where date>=? and date<? order by date,metric limit ?").all(from, to, MAX_DAYS + 1);
  if (rows.length > MAX_DAYS) fail("SUMMARY_LIMIT", "Imported day coverage exceeds the bounded summary.");
  return rows as unknown as DayRow[];
}
export function importAppleAppStoreReport(input: unknown): { imported: number; duplicate: boolean } {
  const doc = validateAppleAppStoreReport(input);
  const hash = createHash("sha256").update(JSON.stringify(doc)).digest("hex");
  const db = connection(true)!;
  return atomic(db, () => {
    const { from, to } = doc.coverage;
    const current = db.prepare("select j.content_hash from apple_app_store_days d join apple_app_store_import_journal j on j.snapshot_id=d.snapshot_id where d.metric=? and d.date>=? and d.date<? limit 367").all(doc.metric, from, to);
    if (current.length === (midnight(to) - midnight(from)) / DAY && current.every(row => row.content_hash === hash)) return { imported: 0, duplicate: true };
    const importedAt = new Date().toISOString();
    db.prepare("insert into apple_app_store_import_journal(content_hash,metric,source,from_date,to_date,imported_at,row_count) values(?,?,?,?,?,?,?)").run(hash, doc.metric, doc.source, from, to, importedAt, doc.rows.length);
    const snapshotId = Number(db.prepare("select last_insert_rowid() as id").get()!.id);
    db.prepare("delete from apple_app_store_dimensions where metric=? and date>=? and date<?").run(doc.metric, from, to);
    db.prepare("delete from apple_app_store_days where metric=? and date>=? and date<?").run(doc.metric, from, to);
    const totals = new Map<string, number>();
    const insert = db.prepare("insert into apple_app_store_dimensions values(?,?,?,?,?)");
    for (const row of doc.rows) {
      insert.run(doc.metric, row.date, row.country, row.version || "", row.value);
      totals.set(row.date, safeAdd(totals.get(row.date) || 0, row.value));
    }
    const insertDay = db.prepare("insert into apple_app_store_days values(?,?,?,?,?,?,?)");
    for (let d = midnight(from); d < midnight(to); d += DAY) insertDay.run(doc.metric, date(d), totals.get(date(d)) || 0, doc.source, importedAt, doc.providerFreshness, snapshotId);
    const existing = db.prepare("select value from apple_app_store_days where metric=? limit ?").all(doc.metric, MAX_DAYS + 1);
    if (existing.length > MAX_DAYS) fail("SUMMARY_LIMIT", "Imported day coverage exceeds the supported limit.");
    existing.reduce((sum, row) => safeAdd(sum, Number(row.value)), 0);
    return { imported: doc.rows.length, duplicate: false };
  });
}

function metricSummary(rows: DayRow[], prior: DayRow[], metric: AppleAppStoreMetric, from: string, to: string, previousFrom: string | null, today: string): AppleAppStoreMetricSummary {
  const measured = rows.filter(row => row.metric === metric);
  if (!measured.length) return { value: null, change: null, coverage: { from: null, to: null, complete: false }, source: null, importedAt: null, providerFreshness: null };
  const value = measured.reduce((sum, row) => safeAdd(sum, row.value), 0);
  const wholeWindow = measured.length === (midnight(to) - midnight(from)) / DAY && to <= today;
  const previous = prior.filter(row => row.metric === metric);
  const previousComplete = previousFrom !== null && previous.length === (midnight(from) - midnight(previousFrom)) / DAY;
  const previousValue = previous.reduce((sum, row) => safeAdd(sum, row.value), 0);
  const sources = [...new Set(measured.map(row => row.source))].sort();
  const priorSources = [...new Set(previous.map(row => row.source))].sort();
  const change = wholeWindow && previousComplete && sources.join() === priorSources.join() && previousValue > 0 ? (value - previousValue) / previousValue * 100 : null;
  const latest = measured.slice().sort((a, b) => b.snapshot_id - a.snapshot_id)[0];
  return {
    value, change,
    coverage: { from: measured[0].date, to: date(midnight(measured[measured.length - 1].date) + DAY), complete: wholeWindow },
    source: sources.join(" + "), importedAt: latest.imported_at, providerFreshness: latest.provider_freshness,
  };
}

export function getAppleAppStoreSummary(period: AppleAppStorePeriod, now = new Date()): AppleAppStoreSummary {
  if (!["today", "7d", "30d", "all"].includes(period) || !(now instanceof Date) || !Number.isFinite(now.getTime()) || date(now.getTime()) < EARLIEST) fail("INVALID_PERIOD", "Invalid Apple App Store summary period.");
  const today = date(now.getTime()), to = tomorrow(now.getTime());
  const span = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const db = connection(false);
  const knownStart = db?.prepare("select min(date) as first_date from apple_app_store_days").get()?.first_date;
  const from = period === "all" ? typeof knownStart === "string" && knownStart < to ? knownStart : today : date(midnight(to) - span * DAY);
  const previousFrom = period === "all" ? null : date(midnight(from) - span * DAY);
  const allRows = db ? readDays(db, previousFrom || from, to) : [];
  const current = allRows.filter(row => row.date >= from);
  const prior = allRows.filter(row => row.date < from);
  const metrics = Object.fromEntries(METRICS.map(metric => [metric, metricSummary(current, prior, metric, from, to, previousFrom, today)])) as AppleAppStoreSummary["metrics"];
  const days = new Map<string, AppleAppStoreSummary["trend"][number]>();
  if ((midnight(to) - midnight(from)) / DAY > MAX_DAYS / 2) fail("SUMMARY_LIMIT", "Requested history exceeds the bounded summary.");
  for (let d = midnight(from); d < midnight(to); d += DAY) days.set(date(d), { date: date(d), store_units: null, store_updates: null });
  for (const row of current) days.get(row.date)![row.metric] = row.value;
  const countries = new Map<string, AppleAppStoreSummary["countries"][number]>();
  if (db) {
    const countryRows = db.prepare("select country,metric,sum(value) as value from apple_app_store_dimensions where date>=? and date<? group by country,metric order by country,metric limit 1353").all(from, to);
    if (countryRows.length > 1352) fail("SUMMARY_LIMIT", "Country dimensions exceed the bounded summary.");
    for (const row of countryRows) {
      const key = String(row.country), metric = row.metric as AppleAppStoreMetric;
      const entry = countries.get(key) || { country: key, store_units: metrics.store_units.value === null ? null : 0, store_updates: metrics.store_updates.value === null ? null : 0 };
      entry[metric] = Number(row.value); countries.set(key, entry);
    }
  }
  const versionRows = db ? db.prepare("select version,metric,sum(value) as value from apple_app_store_dimensions where date>=? and date<? group by version,metric order by version,metric limit ?").all(from, to, MAX_VERSIONS * 2 + 1) : [];
  if (versionRows.length > MAX_VERSIONS * 2) fail("SUMMARY_LIMIT", "Version dimensions exceed the bounded summary.");
  const versions = new Map<string, AppleAppStoreSummary["versions"][number]>();
  for (const row of versionRows) {
    const key = String(row.version) || "Unknown";
    const entry = versions.get(key) || { version: key, store_units: 0, store_updates: 0 };
    entry[row.metric as AppleAppStoreMetric] = Number(row.value);
    versions.set(key, entry);
  }
  const latestSource = db?.prepare("select source from apple_app_store_days order by snapshot_id desc limit 1").get()?.source;
  return {
    appleId: APPLE_APP_STORE_APPLE_ID, appName: APPLE_APP_STORE_APP_NAME, channel: "apple_app_store",
    status: latestSource === "apple_api" ? "DAILY_IMPORT" : latestSource === "apple_report" ? "MANUAL_IMPORT" : "NOT_CONNECTED",
    configured: appleAppStoreConfigured(),
    period, range: { from, to }, metrics, trend: [...days.values()], countries: [...countries.values()],
    versions: [...versions.values()].sort((a, b) => (b.store_units + b.store_updates) - (a.store_units + a.store_updates)).slice(0, MAX_VERSIONS),
    unavailable: ["sessions", "crashes", "active_devices", "acquisition_source", "proceeds_converted"],
    note: "Apple App Store Sales and Trends units/updates for Hidden Tunes (Apple ID 6773324462) are separate from Microsoft Store acquisitions/installs, artifact requests and first-party launches. Missing days remain N/A; omitted rows inside a complete daily snapshot mean provider-reported zero. Proceeds, sessions and crashes are not aggregated here. Configured reports setting presence only, not successful authorization. No App Store Connect secrets leave the server.",
  };
}
