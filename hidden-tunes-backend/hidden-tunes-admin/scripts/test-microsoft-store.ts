import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { closeMicrosoftStoreForTests, getMicrosoftStoreSummary, importMicrosoftStoreReport, validateMicrosoftStoreReport } from "../lib/distribution/microsoftStoreStore";
import type { MicrosoftStoreImport } from "../lib/distribution/microsoftStoreTypes";

const directory = mkdtempSync(join(tmpdir(), "ht-microsoft-store-test-"));
const previousDirectory = process.env.ANALYTICS_DATA_DIR;
const settingNames = ["MICROSOFT_STORE_TENANT_ID", "MICROSOFT_STORE_CLIENT_ID", "MICROSOFT_STORE_CLIENT_SECRET"];
const priorSettings = settingNames.map(name => process.env[name]);
const now = new Date("2020-01-14T12:00:00.000Z");
function report(overrides: Partial<MicrosoftStoreImport> = {}): MicrosoftStoreImport {
  return {
    schemaVersion: 1, applicationId: "9N9XGSTD8889", metric: "store_acquisitions", source: "microsoft_report",
    coverage: { from: "2020-01-01", to: "2020-01-08" }, providerFreshness: "2020-01-08T08:15:00+00:00",
    rows: [{ date: "2020-01-01", country: "GB", version: null, value: 5 }, { date: "2020-01-02", country: "US", version: null, value: 7 }],
    ...overrides,
  };
}
function total() { return getMicrosoftStoreSummary("all", now).metrics.store_acquisitions.value; }
let external: InstanceType<typeof DatabaseSync> | null = null;
try {
  process.env.ANALYTICS_DATA_DIR = directory;
  for (const name of settingNames) delete process.env[name];
  const absent = getMicrosoftStoreSummary("today", now);
  assert.equal(absent.status, "NOT_CONNECTED");
  assert.equal(absent.configured, false);
  assert.equal(absent.metrics.store_acquisitions.value, null);
  assert.equal(absent.metrics.store_installs.value, null);
  assert.equal(existsSync(join(directory, "microsoft-store.sqlite")), false, "Read-only unconnected summary does not create storage");
  for (const name of settingNames) process.env[name] = "test-setting-presence-only";
  assert.equal(getMicrosoftStoreSummary("today", now).configured, true);
  assert.equal(getMicrosoftStoreSummary("today", now).status, "NOT_CONNECTED", "Credentials alone do not claim successful connection");

  const base = report();
  assert.deepEqual(importMicrosoftStoreReport(base), { imported: 2, duplicate: false });
  assert.equal(total(), 12);
  const first = getMicrosoftStoreSummary("all", now);
  assert.equal(first.status, "MANUAL_IMPORT");
  assert.equal(first.metrics.store_acquisitions.providerFreshness, base.providerFreshness, "Provider timestamp retained verbatim");
  assert.notEqual(first.metrics.store_acquisitions.importedAt, base.providerFreshness);
  assert.equal(first.metrics.store_installs.value, null, "Acquisitions are not installs");
  assert.equal(first.trend.find(row => row.date === "2020-01-03")!.store_acquisitions, 0, "Covered omission is zero");
  assert.equal(first.trend.find(row => row.date === "2020-01-09")!.store_acquisitions, null, "Uncovered day remains unknown");
  assert.deepEqual(importMicrosoftStoreReport({ ...base, rows: [...base.rows].reverse() }), { imported: 0, duplicate: true }, "Canonical row order deduplicates");
  assert.equal(total(), 12);

  const revision = report({ source: "microsoft_api", coverage: { from: "2020-01-02", to: "2020-01-04" }, providerFreshness: "2020-01-09T09:00:00Z", rows: [{ date: "2020-01-02", country: "US", version: null, value: 2 }, { date: "2020-01-03", country: "GH", version: null, value: 4 }] });
  importMicrosoftStoreReport(revision);
  assert.equal(total(), 11, "Revision replaces overlap, retaining untouched days");
  assert.deepEqual(importMicrosoftStoreReport(base), { imported: 2, duplicate: false });
  assert.equal(total(), 12, "Provider can legitimately revise counts back to an earlier report");
  assert.deepEqual(importMicrosoftStoreReport(base), { imported: 0, duplicate: true });
  assert.deepEqual(importMicrosoftStoreReport(revision), { imported: 2, duplicate: false });
  assert.equal(total(), 11);
  const revised = getMicrosoftStoreSummary("all", now);
  assert.equal(revised.status, "DAILY_IMPORT");
  assert.equal(revised.metrics.store_acquisitions.providerFreshness, revision.providerFreshness);
  assert.equal(revised.metrics.store_acquisitions.source, "microsoft_api + microsoft_report");

  importMicrosoftStoreReport(report({ metric: "store_installs", source: "microsoft_api", rows: [{ date: "2020-01-01", country: "US", version: "1.0.1.0", value: 3 }, { date: "2020-01-03", country: "GH", version: "1.0.2.0", value: 4 }] }));
  const both = getMicrosoftStoreSummary("all", now);
  assert.equal(both.metrics.store_acquisitions.value, 11);
  assert.equal(both.metrics.store_installs.value, 7);
  assert.equal(both.versions.find(row => row.version === "1.0.2.0")!.store_installs, 4);
  importMicrosoftStoreReport(report({ metric: "store_installs", source: "microsoft_api", coverage: { from: "2020-01-03", to: "2020-01-04" }, providerFreshness: null, rows: [] }));
  const zero = getMicrosoftStoreSummary("all", now);
  assert.equal(zero.metrics.store_installs.value, 3);
  assert.equal(zero.metrics.store_acquisitions.value, 11, "Replacing installs never changes acquisitions");
  assert.equal(zero.countries.find(row => row.country === "GH")!.store_installs, 0);
  assert.ok(!zero.versions.some(row => row.version === "1.0.2.0"), "Replaced version dimensions are removed");

  const path = join(directory, "microsoft-store.sqlite");
  external = new DatabaseSync(path);
  const journalCount = () => Number(external!.prepare("select count(*) as n from microsoft_store_import_journal").get()!.n);
  assert.equal(journalCount(), 6, "Journal keeps committed revisions, including restoration of historical values");
  assert.throws(() => external!.exec("update microsoft_store_import_journal set source='bad'"), /append_only/);
  assert.throws(() => external!.exec("delete from microsoft_store_import_journal"), /append_only/);
  external.exec("create trigger inject_microsoft_failure before insert on microsoft_store_dimensions when new.value=777 begin select raise(abort,'injected transaction failure'); end;");
  assert.throws(() => importMicrosoftStoreReport(report({ coverage: { from: "2020-01-02", to: "2020-01-04" }, rows: [{ date: "2020-01-02", country: "ZZ", version: null, value: 777 }] })), /injected transaction failure/);
  assert.equal(total(), 11, "Failed replacement rolls back prior dimension deletion and day changes");
  assert.equal(journalCount(), 6, "Failed replacement rolls back its journal entry");
  external.exec("drop trigger inject_microsoft_failure");
  assert.throws(() => importMicrosoftStoreReport(report({ coverage: { from: "2020-02-01", to: "2020-02-02" }, rows: [{ date: "2020-02-01", country: "ZZ", version: null, value: Number.MAX_SAFE_INTEGER }] })), /safe integer/);
  assert.equal(journalCount(), 6);
  assert.equal(total(), 11);

  const invalid: unknown[] = [
    { ...base, userId: "private-account" }, { ...base, client_secret: "never-store" }, { ...base, applicationId: "other-app" },
    { ...base, metric: "first_launch" }, { ...base, source: "untrusted" }, { ...base, providerFreshness: "https://example.invalid/?token=private" },
    { ...base, providerFreshness: "2020-02-30" }, { ...base, coverage: { from: "2014-12-31", to: "2015-01-01" } },
    { ...base, coverage: { from: "2020-02-30", to: "2020-03-02" } }, { ...base, coverage: { from: "2020-01-01", to: "2021-01-02" } },
    { ...base, coverage: { from: "2099-01-01", to: "2099-01-02" } }, { ...base, coverage: { from: "2020-01-01", to: "2020-01-01" } },
    { ...base, coverage: { ...base.coverage, token: "private" } }, { ...base, rows: [{ ...base.rows[0], date: "2020-01-08" }] },
    { ...base, rows: [base.rows[0], base.rows[0]] }, { ...base, rows: [{ ...base.rows[0], ip: "127.0.0.1" }] },
    { ...base, rows: [{ ...base.rows[0], country: "127.0.0.1" }] }, { ...base, rows: [{ ...base.rows[0], country: "us" }] },
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "12"].map(value => ({ ...base, rows: [{ ...base.rows[0], value }] })),
    { ...base, rows: [{ ...base.rows[0], version: "1.0.0.0" }] },
    { ...base, metric: "store_installs", rows: [{ ...base.rows[0], version: "https://example.invalid/private" }] },
    { ...base, metric: "store_installs", rows: [{ ...base.rows[0], version: "65536.0.0.0" }] },
    { ...base, rows: Array(20_001).fill(base.rows[0]) },
  ];
  for (const doc of invalid) assert.throws(() => validateMicrosoftStoreReport(doc), "Unsafe/malformed report rejected");
  assert.equal(journalCount(), 6, "Rejected validation never mutates snapshots/journal");
  assert.equal(validateMicrosoftStoreReport(report({ providerFreshness: null, rows: [] })).providerFreshness, null);
  assert.equal(validateMicrosoftStoreReport(report({ providerFreshness: "2018-01-09T03:04:05" })).providerFreshness, "2018-01-09T03:04:05", "Zone-less Microsoft metadata is preserved verbatim");

  importMicrosoftStoreReport(report({ source: "microsoft_api", coverage: { from: "2020-01-08", to: "2020-01-15" }, providerFreshness: null, rows: [{ date: "2020-01-08", country: "ZZ", version: null, value: 1 }, { date: "2020-01-14", country: "US", version: null, value: 2 }] }));
  const week = getMicrosoftStoreSummary("7d", now);
  assert.equal(week.range.from, "2020-01-08");
  assert.equal(week.range.to, "2020-01-15");
  assert.equal(week.metrics.store_acquisitions.value, 3);
  assert.equal(week.metrics.store_acquisitions.coverage.complete, false, "Ongoing today is partial even with a daily row");
  assert.equal(week.metrics.store_acquisitions.change, null, "Never compare a partial day/week against full previous days");
  assert.equal(getMicrosoftStoreSummary("today", now).metrics.store_acquisitions.value, 2);
  const month = getMicrosoftStoreSummary("30d", now);
  assert.equal(month.metrics.store_acquisitions.value, 14);
  assert.equal(month.metrics.store_acquisitions.change, null);
  assert.equal(month.metrics.store_acquisitions.coverage.complete, false);
  assert.equal(getMicrosoftStoreSummary("all", now).metrics.store_acquisitions.change, null);
  assert.throws(() => getMicrosoftStoreSummary("bad" as "today", now));
  assert.throws(() => getMicrosoftStoreSummary("today", new Date("bad")));

  external.close(); external = null; closeMicrosoftStoreForTests();
  if (process.platform !== "win32") {
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  }
  process.env.ANALYTICS_DATA_DIR = ".";
  assert.throws(() => getMicrosoftStoreSummary("today", now), /absolute/);
  process.env.ANALYTICS_DATA_DIR = process.cwd();
  assert.throws(() => getMicrosoftStoreSummary("today", now), /outside/);
  if (process.platform === "win32") {
    delete process.env.ANALYTICS_DATA_DIR;
    assert.throws(() => getMicrosoftStoreSummary("today", now), /explicit absolute/);
  }
  console.log("Microsoft Store persistence: PASS (snapshot revisions, canonical dedupe, zero vs unknown, separate metrics, atomic rollback, immutable journal, privacy/number/date/cap validation, partial-period safety, external storage)");
} finally {
  external?.close(); closeMicrosoftStoreForTests();
  if (previousDirectory === undefined) delete process.env.ANALYTICS_DATA_DIR; else process.env.ANALYTICS_DATA_DIR = previousDirectory;
  settingNames.forEach((name, index) => { if (priorSettings[index] === undefined) delete process.env[name]; else process.env[name] = priorSettings[index]; });
  const owned = resolve(directory), temp = resolve(tmpdir());
  assert.ok(owned.startsWith(temp + sep) && owned !== temp && !lstatSync(owned).isSymbolicLink(), "Cleanup remains inside this test's owned temporary directory");
  rmSync(owned, { recursive: true, force: true });
}
