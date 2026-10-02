import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { DatabaseSync as NativeDatabaseSync } from "node:sqlite";
import { isIP } from "node:net";
import { isAbsolute, join, resolve, sep } from "node:path";
import { CHANNEL_PLATFORMS, EVENT_NAMES, SHARE_EVENT_NAMES, validateBatch } from "./validation";
import type {
  Breakdown, DistributionEvent, DistributionSummary, EvidenceImport,
  EvidenceMetric, ImportResult, IngestResult, Metric, Period, Source,
} from "./types";

type SqlValue = string | number | null;
type SqlRow = Record<string, string | number | null>;
type Statement = {
  run(...values: SqlValue[]): { changes: number | bigint };
  get(...values: SqlValue[]): SqlRow | undefined;
  all(...values: SqlValue[]): SqlRow[];
};
type Database = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };
type DatabaseConstructor = new (path: string, options?: { readOnly?: boolean }) => Database;
type Rollup = { date: string; metric: Metric; platform: string; channel: string; country: string; version: string; campaign: string; value: number; source: string };
type Coverage = { date: string; metric: EvidenceMetric; from_at: string; to_at: string };
type Window = { from: string; to: string };
const MINUTE = 60_000, DAY = 86_400_000;
const WEB_METRICS = EVENT_NAMES;
const isShareMetric = (metric: string) => (SHARE_EVENT_NAMES as readonly string[]).includes(metric);
const EVIDENCE_METRICS = ["artifact_request", "delivered_bytes", "confirmed_delivery"] as const;
const METRICS: Metric[] = [...WEB_METRICS, ...EVIDENCE_METRICS];
const MAX_ROLLUP_ROWS = 50_000;
let cached: { path: string; writable: boolean; db: Database } | null = null;

export class DistributionStoreError extends Error {
  constructor(public code: string, message: string, public retryAfter?: number) {
    super(message);
    this.name = "DistributionStoreError";
  }
}
function fail(code: string, message: string): never { throw new DistributionStoreError(code, message); }
function iso(ms: number) { return new Date(ms).toISOString(); }
function day(ms: number) { return iso(ms).slice(0, 10); }
function floorDay(ms: number) { return Math.floor(ms / DAY) * DAY; }
function floorMinute(ms: number) { return Math.floor(ms / MINUTE) * MINUTE; }
function clock(now: number) {
  if (!Number.isFinite(now)) fail("INVALID_TIME", "Invalid server time.");
  return now;
}
function storePath() {
  const configured = process.env.ANALYTICS_DATA_DIR?.trim();
  if (!configured && process.platform === "win32") fail("NOT_CONFIGURED", "Analytics storage is not configured.");
  const directory = configured || "/var/lib/hidden-tunes-analytics";
  if (!isAbsolute(directory)) fail("INVALID_PATH", "Analytics storage must use an absolute directory.");
  const full = resolve(directory), cwd = resolve(process.cwd());
  if (full === cwd || full.startsWith(cwd + sep)) fail("INVALID_PATH", "Analytics storage must be outside the release directory.");
  return join(full, "distribution.sqlite");
}
function sqliteConstructor(): DatabaseConstructor {
  // Static builtin import survives the Next production bundle; no added dependency.
  return NativeDatabaseSync as DatabaseConstructor;
}
const ROLLUP_COLUMNS = "bucket,metric,platform,channel,country,version,campaign";
const ROLLUP_SCHEMA = "(bucket text not null,metric text not null,platform text not null,channel text not null,country text not null,version text not null,campaign text not null,value integer not null check(value>=0),primary key(bucket,metric,platform,channel,country,version,campaign)) without rowid";
function connection(create: boolean): Database | null {
  const path = storePath();
  if (cached && (cached.path !== path || (create && !cached.writable))) closeStoreForTests();
  if (cached) return cached.db;
  if (!create && !existsSync(path)) return null;
  if (create) mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const DatabaseSync = sqliteConstructor();
  const db = new DatabaseSync(path, { readOnly: !create });
  try {
    db.exec("pragma busy_timeout=2000");
    if (create) {
      if (process.platform !== "win32") chmodSync(path, 0o600);
      db.exec("pragma journal_mode=WAL; pragma synchronous=FULL;");
      db.exec(
        "create table if not exists analytics_meta(key text primary key,value text not null) without rowid;" +
        "create table if not exists analytics_events(id text primary key,payload_hash text not null,name text not null check(name in('page_view','cta_click','command_copy')),occurred_at text not null,received_at text not null,platform text not null,channel text not null,version text,campaign text,referrer text,country text not null check(country='ZZ')) without rowid;" +
        "create trigger if not exists analytics_events_no_update before update on analytics_events begin select raise(abort,'append_only'); end;" +
        "create trigger if not exists analytics_events_no_delete before delete on analytics_events begin select raise(abort,'append_only'); end;" +
        // Additive analytics table: the original events table, constraints and rows stay intact.
        "create table if not exists analytics_share_events(id text primary key,payload_hash text not null,name text not null check(name in('" + SHARE_EVENT_NAMES.join("','") + "')),occurred_at text not null,received_at text not null,platform text not null,channel text not null,version text,campaign text,referrer text,country text not null check(country='ZZ'),share_source text not null check(share_source in('download_center','install_landing','share','unknown'))) without rowid;" +
        "create trigger if not exists analytics_share_events_no_update before update on analytics_share_events begin select raise(abort,'append_only'); end;" +
        "create trigger if not exists analytics_share_events_no_delete before delete on analytics_share_events begin select raise(abort,'append_only'); end;" +
        "create table if not exists analytics_minute_rollups" + ROLLUP_SCHEMA + ";" +
        "create table if not exists analytics_daily_rollups" + ROLLUP_SCHEMA + ";" +
        "create table if not exists distribution_daily_metrics" + ROLLUP_SCHEMA + ";" +
        "create table if not exists distribution_coverage(date text not null,metric text not null,from_at text not null,to_at text not null,primary key(date,metric)) without rowid;" +
        "create table if not exists distribution_import_journal(evidence_id text primary key,content_hash text not null,source text not null,from_at text not null,to_at text not null,imported_at text not null,row_count integer not null) without rowid;" +
        "create trigger if not exists distribution_journal_no_update before update on distribution_import_journal begin select raise(abort,'append_only'); end;" +
        "create trigger if not exists distribution_journal_no_delete before delete on distribution_import_journal begin select raise(abort,'append_only'); end;" +
        "create table if not exists analytics_rate_windows(minute integer not null,bucket_key text not null,event_count integer not null,primary key(minute,bucket_key)) without rowid;"
      );
    }
    cached = { path, writable: create, db };
    return db;
  } catch (error) { db.close(); throw error; }
}
export function closeStoreForTests() { if (cached) { cached.db.close(); cached = null; } }
function meta(db: Database, key: string) { return db.prepare("select value from analytics_meta where key=?").get(key)?.value as string | undefined; }
function putMeta(db: Database, key: string, value: string) {
  db.prepare("insert into analytics_meta(key,value) values(?,?) on conflict(key) do update set value=excluded.value").run(key, value);
}
function atomic<T>(db: Database, fn: () => T): T {
  db.exec("begin immediate");
  try { const result = fn(); db.exec("commit"); return result; }
  catch (error) { db.exec("rollback"); throw error; }
}
function consumeRate(db: Database, key: string, count: number, now: number) {
  if (!/^[0-9a-f]{64}$/i.test(key)) fail("INVALID_RATE_KEY", "Invalid rate bucket.");
  const minute = Math.floor(now / MINUTE);
  // These short-lived HMAC buckets are never analytics identity or dimensions.
  db.prepare("delete from analytics_rate_windows where minute<?").run(minute - 10);
  for (const [bucket, limit] of [[key, 120], ["global", 6000]] as const) {
    const old = Number(db.prepare("select event_count from analytics_rate_windows where minute=? and bucket_key=?").get(minute, bucket)?.event_count || 0);
    if (old + count > limit) throw new DistributionStoreError("RATE_LIMITED", "Analytics intake limit reached.", 60);
    db.prepare("insert into analytics_rate_windows values(?,?,?) on conflict(minute,bucket_key) do update set event_count=excluded.event_count").run(minute, bucket, old + count);
  }
}
function rollupStatement(db: Database, table: "analytics_minute_rollups" | "analytics_daily_rollups") {
  return db.prepare("insert into " + table + "(" + ROLLUP_COLUMNS + ",value) values(?,?,?,?,?,?,?,1) on conflict(" + ROLLUP_COLUMNS + ") do update set value=value+1");
}
export function ingestEvents(events: DistributionEvent[], rateKey: string, now = Date.now()): IngestResult {
  clock(now);
  // Defense in depth: typed callers cannot insert extra identity fields or artifact claims.
  const acceptedEvents = validateBatch({ events }, now) as DistributionEvent[];
  const db = connection(true)!;
  return atomic(db, () => {
    consumeRate(db, rateKey, acceptedEvents.length, now);
    const insert = db.prepare("insert into analytics_events values(?,?,?,?,?,?,?,?,?,?,?) on conflict(id) do nothing");
    const insertShare = db.prepare("insert into analytics_share_events values(?,?,?,?,?,?,?,?,?,?,?,?) on conflict(id) do nothing");
    const existing = db.prepare("select payload_hash from analytics_events where id=? union all select payload_hash from analytics_share_events where id=?");
    const minute = rollupStatement(db, "analytics_minute_rollups");
    const daily = rollupStatement(db, "analytics_daily_rollups");
    let accepted = 0, duplicates = 0;
    for (const event of acceptedEvents) {
      const hash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
      const prior = existing.get(event.id, event.id);
      if (prior) {
        if (prior.payload_hash !== hash) fail("EVENT_ID_CONFLICT", "Event identity was reused with different data.");
        duplicates++;
        continue;
      }
      const sharing = isShareMetric(event.name);
      const values: SqlValue[] = [event.id, hash, event.name, event.occurred_at, iso(now), event.platform, event.channel, event.version, event.campaign, event.referrer, "ZZ"];
      if (sharing) insertShare.run(...values, event.share_source!);
      else insert.run(...values);
      const dimensions: SqlValue[] = [event.name, event.platform, event.channel, "ZZ", event.version || "", event.campaign || event.referrer || "direct"];
      minute.run(iso(floorMinute(Date.parse(event.occurred_at))), ...dimensions);
      daily.run(event.occurred_at.slice(0, 10), ...dimensions);
      // One observed /get request can also be a shared-link arrival. It is never a delivery.
      if (event.name === "install_link_open" && event.share_source === "share") {
        dimensions[0] = "share_link_open";
        minute.run(iso(floorMinute(Date.parse(event.occurred_at))), ...dimensions);
        daily.run(event.occurred_at.slice(0, 10), ...dimensions);
      }
      const startedKey = sharing ? "sharing_started_at" : "website_started_at";
      if (!meta(db, startedKey)) putMeta(db, startedKey, iso(now));
      accepted++;
    }
    return { accepted, duplicates };
  });
}

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) fail("INVALID_IMPORT", "Unexpected import fields.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, token = false): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\u0000-\u001f]/.test(value) || (token && !/^[a-z0-9_-]+$/i.test(value))) fail("INVALID_IMPORT", "Invalid import metadata.");
  return value;
}
function optionalToken(value: unknown, isVersion = false): string | null {
  if (value == null) return null;
  const result = text(value, isVersion ? 32 : 64);
  if ((isVersion && isIP(result)) || !(isVersion ? /^[0-9][a-z0-9.+_-]*$/i : /^[a-z0-9_-]+$/i).test(result)) fail("INVALID_IMPORT", "Invalid import dimension.");
  return result;
}
export function validateEvidenceImport(value: unknown): EvidenceImport {
  const doc = object(value, ["schemaVersion", "evidenceId", "source", "coverage", "metrics", "rows"]);
  if (doc.schemaVersion !== 1) fail("INVALID_IMPORT", "Unsupported import version.");
  const source = object(doc.source, ["id", "label", "freshness", "note"]);
  const sourceId = text(source.id, 64, true);
  if (sourceId === "website" || sourceId === "website_sharing") fail("INVALID_IMPORT", "Reserved evidence source.");
  const coverage = object(doc.coverage, ["from", "to"]);
  const from = Date.parse(text(coverage.from, 32)), to = Date.parse(text(coverage.to, 32));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to > Date.now() + MINUTE || to - from > 3660 * DAY) fail("INVALID_IMPORT", "Invalid evidence coverage.");
  if (!Array.isArray(doc.metrics) || !doc.metrics.length || doc.metrics.length > 3 || new Set(doc.metrics).size !== doc.metrics.length || doc.metrics.some(metric => !EVIDENCE_METRICS.includes(metric as EvidenceMetric))) fail("INVALID_IMPORT", "Invalid evidence metrics.");
  const metrics = (doc.metrics as EvidenceMetric[]).slice().sort();
  if (!Array.isArray(doc.rows) || doc.rows.length > 50_000) fail("INVALID_IMPORT", "Import row limit exceeded.");
  const keys = new Set<string>();
  const rows = doc.rows.map(value => {
    const row = object(value, ["date", "platform", "channel", "country", "version", "campaign", "metric", "value"]);
    const date = text(row.date, 10);
    const dateMs = Date.parse(date + "T00:00:00.000Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dateMs) || day(dateMs) !== date || dateMs < floorDay(from) || dateMs >= to) fail("INVALID_IMPORT", "Row date outside evidence coverage.");
    const channel = text(row.channel, 64, true), platform = text(row.platform, 12);
    if (!Object.hasOwn(CHANNEL_PLATFORMS, channel) || !["android","windows","macos","linux","ios","web","fire","unknown"].includes(platform) || (channel !== "unknown" && platform !== CHANNEL_PLATFORMS[channel])) fail("INVALID_IMPORT", "Invalid channel attribution.");
    const country = text(row.country, 2);
    if (!/^[A-Z]{2}$/.test(country)) fail("INVALID_IMPORT", "Country must be coarse ISO code or ZZ.");
    if (!metrics.includes(row.metric as EvidenceMetric) || !Number.isSafeInteger(row.value) || Number(row.value) < 0) fail("INVALID_IMPORT", "Invalid evidence counter.");
    const normalized = {
      date, platform: platform as EvidenceImport["rows"][number]["platform"], channel, country,
      version: optionalToken(row.version, true), campaign: optionalToken(row.campaign),
      metric: row.metric as EvidenceMetric, value: row.value as number,
    };
    const key = JSON.stringify([date, platform, channel, country, normalized.version, normalized.campaign, normalized.metric]);
    if (keys.has(key)) fail("INVALID_IMPORT", "Duplicate snapshot dimension.");
    keys.add(key);
    return normalized;
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    schemaVersion: 1, evidenceId: text(doc.evidenceId, 120, true),
    source: { id: sourceId, label: text(source.label, 120), freshness: text(source.freshness, 40), note: text(source.note, 500) },
    coverage: { from: iso(from), to: iso(to) }, metrics, rows,
  };
}
export function importEvidence(document: unknown): ImportResult {
  const doc = validateEvidenceImport(document);
  const hash = createHash("sha256").update(JSON.stringify(doc)).digest("hex");
  const db = connection(true)!;
  return atomic(db, () => {
    const prior = db.prepare("select content_hash from distribution_import_journal where evidence_id=?").get(doc.evidenceId);
    if (prior) {
      if (prior.content_hash !== hash) fail("EVIDENCE_ID_CONFLICT", "Evidence identity was reused with different data.");
      return { imported: 0, duplicate: true, source: doc.source.id };
    }
    const primary = meta(db, "primary_evidence_source");
    if (primary && JSON.parse(primary).id !== doc.source.id) fail("SOURCE_CONFLICT", "Another primary evidence source is already configured.");
    const from = Date.parse(doc.coverage.from), to = Date.parse(doc.coverage.to);
    const firstDate = day(from), lastDate = day(to - 1);
    // Every document is a complete replacement snapshot of each touched UTC day.
    // Partial-day replacement must never silently discard earlier evidence coverage.
    const oldCoverage = db.prepare("select date,metric,from_at,to_at from distribution_coverage where date>=? and date<=?").all(firstDate, lastDate);
    for (const row of oldCoverage) {
      if (!doc.metrics.includes(row.metric as EvidenceMetric)) fail("INCOMPLETE_SNAPSHOT", "Replacement snapshot must retain previously measured metrics for each UTC day.");
      const d = Date.parse(String(row.date) + "T00:00:00.000Z");
      if (Math.max(from, d) > Date.parse(String(row.from_at)) || Math.min(to, d + DAY) < Date.parse(String(row.to_at))) fail("COVERAGE_SHRINK", "Replacement snapshot must retain prior coverage for each UTC day.");
    }
    db.prepare("delete from distribution_daily_metrics where bucket>=? and bucket<=?").run(firstDate, lastDate);
    db.prepare("delete from distribution_coverage where date>=? and date<=?").run(firstDate, lastDate);
    const coverageInsert = db.prepare("insert into distribution_coverage values(?,?,?,?)");
    for (let d = floorDay(from); d < to; d += DAY) {
      for (const metric of doc.metrics) coverageInsert.run(day(d), metric, iso(Math.max(from, d)), iso(Math.min(to, d + DAY)));
    }
    const rowInsert = db.prepare("insert into distribution_daily_metrics(" + ROLLUP_COLUMNS + ",value) values(?,?,?,?,?,?,?,?)");
    for (const row of doc.rows) rowInsert.run(row.date, row.metric, row.platform, row.channel, row.country, row.version || "", row.campaign || "unknown", row.value);
    putMeta(db, "primary_evidence_source", JSON.stringify(doc.source));
    db.prepare("insert into distribution_import_journal values(?,?,?,?,?,?,?)").run(doc.evidenceId, hash, doc.source.id, doc.coverage.from, doc.coverage.to, iso(Date.now()), doc.rows.length);
    return { imported: doc.rows.length, duplicate: false, source: doc.source.id };
  });
}

function rowsBounded(rows: SqlRow[]) {
  if (rows.length > MAX_ROLLUP_ROWS) fail("SUMMARY_LIMIT", "Prepared analytics dimensions exceed the bounded summary.");
  return rows;
}
type BucketQuery = { sql: string; params: SqlValue[] };
function webBuckets(range: Window): BucketQuery {
  const from = Date.parse(range.from), to = Date.parse(range.to);
  const wholeStart = from === floorDay(from) ? from : floorDay(from) + DAY;
  const wholeEnd = floorDay(to);
  return {
    sql: "select bucket as date,metric,platform,channel,country,version,campaign,value from analytics_daily_rollups where bucket>=? and bucket<? " +
      "union all select substr(bucket,1,10) as date,metric,platform,channel,country,version,campaign,value from analytics_minute_rollups where bucket>=? and bucket<? and (bucket<? or bucket>=?)",
    params: [day(wholeStart), day(wholeEnd), range.from, range.to, iso(wholeStart), iso(wholeEnd)],
  };
}
function evidenceBuckets(range: Window): BucketQuery {
  return {
    sql: "select r.bucket as date,r.metric,r.platform,r.channel,r.country,r.version,r.campaign,r.value from distribution_daily_metrics r join distribution_coverage c on c.date=r.bucket and c.metric=r.metric where c.date>=? and c.from_at<? and c.to_at<=? and r.bucket||'T00:00:00.000Z'>=?",
    params: [range.from.slice(0, 10), range.to, range.to, range.from],
  };
}
function metricRows(db: Database, query: BucketQuery, source: string): Rollup[] {
  const rows = db.prepare("with buckets as (" + query.sql + ") select date,metric,sum(value) as value from buckets group by date,metric limit " + (MAX_ROLLUP_ROWS + 1)).all(...query.params);
  return rowsBounded(rows).map(row => ({
    date: String(row.date), metric: row.metric as Metric, value: Number(row.value), source: source === "website" && isShareMetric(String(row.metric)) ? "website_sharing" : source,
    platform: "", channel: "", country: "", version: "", campaign: "",
  }));
}
function webRows(db: Database, range: Window): Rollup[] {
  return range.from < range.to ? metricRows(db, webBuckets(range), "website") : [];
}
function evidenceRows(db: Database, range: Window, source: string): Rollup[] {
  return range.from < range.to ? metricRows(db, evidenceBuckets(range), source) : [];
}
function queryBreakdown(db: Database | null, range: Window, dimension: "platform" | "channel" | "country" | "campaign" | "version", primary?: string): Breakdown[] {
  if (!db || range.from >= range.to) return [];
  const queries = [{ ...webBuckets(range), source: "website" }, ...(primary ? [{ ...evidenceBuckets(range), source: primary }] : [])];
  return queries.flatMap(query => {
    const sql = "with buckets as (" + query.sql + "), grouped as (" +
      "select coalesce(nullif(" + dimension + ",''),'unknown') as key,metric,sum(value) as value from buckets group by " + dimension + ",metric" +
      "), ranked as (select *,row_number() over(partition by metric order by value desc,key) as position from grouped)" +
      " select case when position<=100 then key else 'Other (remaining)' end as key,metric,sum(value) as value from ranked group by case when position<=100 then key else 'Other (remaining)' end,metric order by value desc,key";
    return db.prepare(sql).all(...query.params).map(row => {
      const value = Number(row.value);
      if (!Number.isSafeInteger(value)) fail("COUNTER_OVERFLOW", "Counter exceeds safe numeric range.");
      return { key: String(row.key), source: query.source === "website" && isShareMetric(String(row.metric)) ? "website_sharing" : query.source, metric: String(row.metric), value };
    });
  });
}
function coverageRows(db: Database): Coverage[] {
  return db.prepare("select date,metric,from_at,to_at from distribution_coverage order by date,metric").all() as unknown as Coverage[];
}
function coverageOverlaps(rows: Coverage[], metric: EvidenceMetric, range: Window) {
  return rows.some(row => row.metric === metric && Date.parse(row.date + "T00:00:00.000Z") >= Date.parse(range.from) && row.from_at < range.to && row.to_at <= range.to);
}
function completeCoverage(rows: Coverage[], metric: EvidenceMetric, range: Window) {
  const from = Date.parse(range.from), to = Date.parse(range.to);
  if (from >= to || from !== floorDay(from) || to !== floorDay(to)) return false;
  const relevant = rows.filter(row => row.metric === metric && row.to_at > range.from && row.from_at < range.to);
  let cursor = from;
  for (const row of relevant) {
    if (Date.parse(row.from_at) > cursor) return false;
    cursor = Math.max(cursor, Date.parse(row.to_at));
  }
  return cursor >= to;
}
function webOverlaps(start: string | undefined, range: Window) { return Boolean(start && start < range.to && range.from < range.to); }
function total(rows: Rollup[], metric: Metric) {
  const result = rows.reduce((sum, row) => sum + (row.metric === metric ? row.value : 0), 0);
  if (!Number.isSafeInteger(result)) fail("COUNTER_OVERFLOW", "Counter exceeds safe numeric range.");
  return result;
}
function coveredInterval(rows: Coverage[], metric: EvidenceMetric, range: Window) {
  const from = Date.parse(range.from), to = Date.parse(range.to);
  if (from >= to) return false;
  let cursor = from;
  for (const row of rows.filter(row => row.metric === metric && row.to_at > range.from && row.from_at < range.to && row.to_at <= range.to)) {
    if (Date.parse(row.from_at) > cursor) return false;
    cursor = Math.max(cursor, Date.parse(row.to_at));
  }
  return cursor >= to;
}
export function getSummary(period: Period = "7d", now = Date.now()): DistributionSummary {
  clock(now);
  if (!["today", "7d", "30d", "all"].includes(period)) fail("INVALID_PERIOD", "Invalid summary period.");
  const db = connection(false);
  const websiteStart = db ? meta(db, "website_started_at") : undefined;
  const sharingStart = db ? meta(db, "sharing_started_at") : undefined;
  const primaryJson = db ? meta(db, "primary_evidence_source") : undefined;
  const primary = primaryJson ? JSON.parse(primaryJson) as EvidenceImport["source"] : undefined;
  const coverage = db && primary ? coverageRows(db) : [];
  const cutoff = floorMinute(now);
  const firstEvidence = coverage[0]?.from_at;
  // Queued observations may precede first intake; preserve coverage separately.
  const firstObservedDay = db && period === "all" ? db.prepare("select min(bucket) as earliest from analytics_daily_rollups").get()?.earliest : null;
  const firstObserved = firstObservedDay ? String(firstObservedDay) + "T00:00:00.000Z" : undefined;
  const first = [websiteStart, sharingStart, firstEvidence, firstObserved].filter((s): s is string => Boolean(s)).map(Date.parse);
  const from = period === "all" ? floorDay(first.length ? Math.min(...first) : cutoff) : floorDay(cutoff) - (period === "7d" ? 6 : period === "30d" ? 29 : 0) * DAY;
  const range = { from: iso(from), to: iso(cutoff) };
  const elapsed = Math.max(0, cutoff - from);
  const previous = period === "all" || !elapsed ? null : { from: iso(from - elapsed), to: iso(from) };
  const web = db ? webRows(db, range) : [];
  const evidence = db && primary ? evidenceRows(db, range, primary.id) : [];
  const currentRows = [...web, ...evidence];
  const previousRows = db && previous ? [...webRows(db, previous), ...(primary ? evidenceRows(db, previous, primary.id) : [])] : [];
  const totals = Object.fromEntries(METRICS.map(metric => [metric, null])) as Record<Metric, number | null>;
  const changes: Partial<Record<Metric, number | null>> = {};
  const metricCoverage = {} as DistributionSummary["metricCoverage"];
  for (const metric of METRICS) {
    const isWeb = (WEB_METRICS as readonly string[]).includes(metric);
    const collectionStart = isShareMetric(metric) ? sharingStart : websiteStart;
    const available = isWeb ? webOverlaps(collectionStart, range) || total(currentRows, metric) > 0 : coverageOverlaps(coverage, metric as EvidenceMetric, range);
    if (available) totals[metric] = total(currentRows, metric);
    const complete = available && (isWeb ? Boolean(collectionStart && collectionStart <= range.from) : coveredInterval(coverage, metric as EvidenceMetric, range));
    metricCoverage[metric] = { complete, note: !available ? "No measurement source for this period." : complete ? "Complete observed coverage for the displayed period." : "Observed within available coverage; incomplete period. Internal gaps and dates before collection are unknown." };
    const comparable = previous && available && (isWeb
      ? Boolean(collectionStart && collectionStart <= previous.from)
      : completeCoverage(coverage, metric as EvidenceMetric, range) && completeCoverage(coverage, metric as EvidenceMetric, previous));
    const prior = comparable ? total(previousRows, metric) : 0;
    changes[metric] = comparable && prior > 0 && totals[metric] !== null ? ((totals[metric]! - prior) / prior) * 100 : null;
  }
  const trend: DistributionSummary["trend"] = [];
  // Bounded all-time chart: at most ten years; totals still cover the entire range.
  const trendFrom = Math.max(from, floorDay(cutoff) - 3659 * DAY);
  for (let d = trendFrom; d < cutoff; d += DAY) {
    const date = day(d), window = { from: iso(d), to: iso(Math.min(d + DAY, cutoff)) };
    const dayRows = currentRows.filter(row => row.date === date);
    trend.push({
      date,
      page_view: webOverlaps(websiteStart, window) || total(dayRows, "page_view") > 0 ? total(dayRows, "page_view") : null,
      cta_click: webOverlaps(websiteStart, window) || total(dayRows, "cta_click") > 0 ? total(dayRows, "cta_click") : null,
      artifact_request: coverageOverlaps(coverage, "artifact_request", window) ? total(dayRows, "artifact_request") : null,
    });
  }
  const sources: Source[] = [{
    id: "website", label: "First-party website events",
    freshness: websiteStart ? "NEAR REAL-TIME" : "NOT CONNECTED",
    from: websiteStart || null, to: websiteStart && websiteStart < range.to ? range.to : null,
    note: websiteStart
      ? "Observed page views, CTA clicks and command copies only. Counts exclude the current incomplete UTC minute. Coverage begins at first intake; accepted queued observations may precede it, but other earlier counts remain unknown. Comparisons require complete prior coverage. Countries are unknown. Campaign falls back to coarse referrer. No visitor identity is collected. Anonymous observations may include automated or forged traffic; these are not verified people."
      : "Awaiting the first website event. Dashboard access does not activate collection or establish zero traffic.",
  }];
  sources.push({
    id: "website_sharing", label: "Website share actions and observed link opens",
    freshness: sharingStart ? "NEAR REAL-TIME" : "NOT CONNECTED",
    from: sharingStart || null, to: sharingStart && sharingStart < range.to ? range.to : null,
    note: sharingStart
      ? "Separate collection coverage begins with the first share or install-link observation. Share actions record controls or hand-offs, not messages sent. Shared-link opens combine tagged /get requests and tagged Download Center arrivals. Requests can include previews, bots and repeated opens; they are not unique recipients, completed downloads or first launches. No private message, recipient, visitor ID or full URL is collected. Delivery and client attribution remain unavailable."
      : "No share or install-link observation has arrived. Earlier dates remain unknown; existing page-view collection does not establish share coverage.",
  });
  if (primary) {
    sources.push({
      ...primary,
      from: coverage.length ? coverage.reduce((a, row) => a < row.from_at ? a : row.from_at, coverage[0].from_at) : null,
      to: coverage.length ? coverage.reduce((a, row) => a > row.to_at ? a : row.to_at, coverage[0].to_at) : null,
      note: primary.note + " Daily evidence is separate from website activity. Only snapshots ending by the displayed cutoff are included. Coverage may contain internal gaps; first and last timestamps do not imply continuous coverage. Missing coverage is unknown; partial-day comparisons are N/A. HTTP requests do not establish installations or completed deliveries.",
    });
  } else {
    sources.push({ id: "artifact_evidence", label: "Direct artifact evidence", freshness: "MANUAL / NOT CONNECTED", from: null, to: null, note: "No authoritative artifact-request source has been imported. Downloads and delivery evidence remain N/A." });
  }
  sources[0].note += " Breakdowns retain the top 100 keys per metric/source and group remaining keys.";
  return {
    generatedAt: iso(now), period, range, previous, totals, changes, metricCoverage, trend,
    breakdowns: {
      platform: queryBreakdown(db, range, "platform", primary?.id), channel: queryBreakdown(db, range, "channel", primary?.id),
      country: queryBreakdown(db, range, "country", primary?.id), campaign: queryBreakdown(db, range, "campaign", primary?.id), version: queryBreakdown(db, range, "version", primary?.id),
    },
    sources,
  };
}
