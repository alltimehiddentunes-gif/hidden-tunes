import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeStoreForTests, DistributionStoreError, getSummary, importEvidence, ingestEvents, validateEvidenceImport } from "../lib/distribution/store";
import type { DistributionEvent, EvidenceImport } from "../lib/distribution/types";

const originalDirectory = process.env.ANALYTICS_DATA_DIR;
const fixtureRoot = mkdtempSync(join(tmpdir(), "ht-distribution-store-"));
const directory = join(fixtureRoot, "private-analytics");
process.env.ANALYTICS_DATA_DIR = directory;
const at = Date.UTC(2026, 6, 1, 12, 0, 15);
const key = (s: string) => createHash("sha256").update(s).digest("hex");
const event = (overrides: Partial<DistributionEvent> = {}): DistributionEvent => ({
  id: randomUUID(), name: "page_view", occurred_at: new Date(at).toISOString(),
  platform: "web", channel: "unknown", version: null, campaign: null, referrer: "direct", ...overrides,
});
const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (error: unknown) => error instanceof DistributionStoreError && error.code === code);
function evidence(overrides: Partial<EvidenceImport> = {}): EvidenceImport {
  return {
    schemaVersion: 1, evidenceId: "server_log_snapshot_01",
    source: { id: "origin_logs", label: "Origin access-log evidence", freshness: "DAILY IMPORT", note: "Observed HTTP artifact requests and served bytes; no completion or installation claim." },
    coverage: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" },
    metrics: ["artifact_request", "delivered_bytes"],
    rows: [
      { date: "2026-07-01", platform: "windows", channel: "windows_direct", country: "GH", version: "1.0.1", campaign: "poster_01", metric: "artifact_request", value: 5 },
      { date: "2026-07-01", platform: "windows", channel: "windows_direct", country: "GH", version: "1.0.1", campaign: "poster_01", metric: "delivered_bytes", value: 100 },
    ], ...overrides,
  };
}
try {
  validateEvidenceImport(evidence());
  const blank = getSummary("7d", at);
  assert.equal(existsSync(directory), false, "dashboard reads must not initialize collection or storage");
  for (const value of Object.values(blank.totals)) assert.equal(value, null);
  assert.equal(blank.sources.find(s => s.id === "website")?.freshness, "NOT CONNECTED");
  assert.equal(blank.sources.find(s => s.id === "website")?.from, null);
  assert.ok(blank.trend.every(row => row.page_view === null && row.artifact_request === null));

  const first = event();
  assert.deepEqual(ingestEvents([first, first], key("first"), at), { accepted: 1, duplicates: 1 });
  assert.equal(getSummary("today", at).totals.page_view, null, "incomplete current minute is excluded");
  let summary = getSummary("today", at + 60_000);
  assert.equal(summary.totals.page_view, 1);
  assert.equal(summary.metricCoverage.page_view.complete, false);
  assert.equal(summary.totals.cta_click, 0);
  assert.equal(summary.totals.artifact_request, null);
  assert.equal(summary.changes.page_view, null, "partial prior coverage is never a percent change");
  assert.equal(summary.sources[0].from, new Date(at).toISOString());
  assert.equal(summary.range.to, "2026-07-01T12:01:00.000Z");
  assert.deepEqual(summary.breakdowns.country, [{ key: "ZZ", source: "website", metric: "page_view", value: 1 }]);

  closeStoreForTests();
  assert.deepEqual(ingestEvents([first], key("restart"), at + 60_000), { accepted: 0, duplicates: 1 });
  const changed = { ...first, referrer: "google" };
  throwsCode(() => ingestEvents([event(), changed], key("conflict"), at + 60_000), "EVENT_ID_CONFLICT");
  assert.equal(getSummary("today", at + 120_000).totals.page_view, 1, "conflicting batch is atomic");
  assert.throws(() => ingestEvents([{ ...event(), installation_id: randomUUID() } as DistributionEvent], key("identity"), at));
  assert.throws(() => ingestEvents([{ ...event(), name: "artifact_request" } as unknown as DistributionEvent], key("artifact"), at));
  assert.throws(() => ingestEvents([{ ...event(), stream_url: "https://invalid/private" } as DistributionEvent], key("url"), at));
  assert.throws(() => ingestEvents([event({ occurred_at: "2026-06-01T00:00:00.000Z" })], key("old"), at));

  const rateNow = at + 180_000;
  for (let batch = 0; batch < 3; batch++) ingestEvents(Array(32).fill(first), key("limited"), rateNow);
  ingestEvents(Array(24).fill(first), key("limited"), rateNow);
  throwsCode(() => ingestEvents([first], key("limited"), rateNow), "RATE_LIMITED");
  const globalNow = at + 240_000;
  for (let batch = 0; batch < 187; batch++) ingestEvents(Array(32).fill(first), key("global_" + batch), globalNow);
  ingestEvents(Array(16).fill(first), key("global_final"), globalNow);
  throwsCode(() => ingestEvents([first], key("another_rate_key"), globalNow), "RATE_LIMITED");

  const imported = evidence();
  assert.deepEqual(importEvidence(imported), { imported: 2, duplicate: false, source: "origin_logs" });
  assert.equal(importEvidence(imported).duplicate, true);
  let all = getSummary("all", Date.UTC(2026, 6, 3));
  assert.equal(all.totals.artifact_request, 5);
  assert.equal(all.totals.delivered_bytes, 100);
  assert.equal(all.totals.confirmed_delivery, null, "request and byte evidence never becomes proof of complete delivery");
  assert.equal(all.breakdowns.channel.find(row => row.key === "windows_direct" && row.metric === "artifact_request")?.source, "origin_logs");
  assert.equal(all.breakdowns.country.find(row => row.key === "GH" && row.metric === "artifact_request")?.value, 5);
  assert.ok(all.sources.some(source => source.id === "origin_logs" && source.label === imported.source.label));
  throwsCode(() => importEvidence({ ...imported, rows: imported.rows.map(row => ({ ...row, value: row.value + 1 })) }), "EVIDENCE_ID_CONFLICT");
  throwsCode(() => importEvidence({ ...imported, evidenceId: "different_source", source: { ...imported.source, id: "cdn_logs" } }), "SOURCE_CONFLICT");
  throwsCode(() => importEvidence({ ...imported, evidenceId: "duplicate_dimension", rows: [imported.rows[0], imported.rows[0]] }), "INVALID_IMPORT");
  throwsCode(() => importEvidence({ ...imported, evidenceId: "raw_ip", rows: [{ ...imported.rows[0], ip: "127.0.0.1" }] }), "INVALID_IMPORT");
  throwsCode(() => importEvidence({ ...imported, evidenceId: "wrong_os", rows: [{ ...imported.rows[0], platform: "macos" }] }), "INVALID_IMPORT");
  throwsCode(() => importEvidence({ ...imported, evidenceId: "missing_metric", metrics: ["artifact_request"], rows: [imported.rows[0]] }), "INCOMPLETE_SNAPSHOT");
  throwsCode(() => importEvidence({ ...imported, evidenceId: "ip_version", rows: [{ ...imported.rows[0], version: "192.168.1.1" }] }), "INVALID_IMPORT");
  throwsCode(() => importEvidence({ ...imported, evidenceId: "shrink", coverage: { ...imported.coverage, from: "2026-07-01T12:00:00.000Z" } }), "COVERAGE_SHRINK");

  importEvidence({ ...imported, evidenceId: "replacement_02", rows: imported.rows.map(row => ({ ...row, value: row.metric === "artifact_request" ? 7 : 140 })) });
  all = getSummary("all", Date.UTC(2026, 6, 3));
  assert.equal(all.totals.artifact_request, 7, "snapshot replacement must not accumulate old observations");
  assert.equal(all.totals.delivered_bytes, 140);
  importEvidence(evidence({
    evidenceId: "empty_observed_day",
    coverage: { from: "2026-07-02T00:00:00.000Z", to: "2026-07-03T00:00:00.000Z" },
    metrics: ["artifact_request"], rows: [],
  }));
  importEvidence(evidence({
    evidenceId: "partial_observed_day",
    coverage: { from: "2026-07-05T12:00:00.000Z", to: "2026-07-05T22:00:00.000Z" },
    metrics: ["artifact_request"], rows: [{ ...imported.rows[0], date: "2026-07-05", metric: "artifact_request", value: 3 }],
  }));
  all = getSummary("all", Date.UTC(2026, 6, 6));
  assert.equal(all.totals.artifact_request, 10);
  assert.equal(all.trend.find(row => row.date === "2026-07-02")?.artifact_request, 0, "proven coverage with no requests may be zero");
  assert.equal(all.trend.find(row => row.date === "2026-07-03")?.artifact_request, null, "missing historical coverage is unknown");
  assert.equal(getSummary("today", Date.UTC(2026, 6, 5, 23)).totals.artifact_request, 3);
  assert.equal(getSummary("today", Date.UTC(2026, 6, 5, 21)).totals.artifact_request, null, "daily snapshot cannot be sliced into invented minute counts");
  assert.equal(getSummary("today", Date.UTC(2026, 6, 5, 23)).changes.artifact_request, null);
  assert.equal(all.changes.artifact_request, null, "all-time has no comparable previous period");
  assert.equal(getSummary("30d", Date.UTC(2026, 6, 6)).range.from, "2026-06-07T00:00:00.000Z");

  const priorTime = Date.UTC(2026, 6, 2, 13), currentTime = Date.UTC(2026, 6, 3, 1);
  ingestEvents([event({ occurred_at: new Date(priorTime).toISOString() })], key("prior"), priorTime);
  ingestEvents([event({ occurred_at: new Date(currentTime).toISOString() }), event({ occurred_at: new Date(currentTime).toISOString() })], key("current"), currentTime);
  summary = getSummary("today", Date.UTC(2026, 6, 3, 12));
  assert.equal(summary.totals.page_view, 2);
  assert.equal(summary.previous?.from, "2026-07-02T12:00:00.000Z");
  assert.equal(summary.changes.page_view, 100, "exact completed-minute comparable interval");
  assert.equal(summary.metricCoverage.page_view.complete, true);
  assert.equal(summary.totals.artifact_request, null, "a gap must not create a download zero");
  assert.equal(getSummary("7d", Date.UTC(2026, 6, 3, 12)).totals.page_view, 4, "daily plus minute boundaries do not double count");

  importEvidence(evidence({
    evidenceId: "known_platform_unknown_channel",
    coverage: { from: "2026-07-06T00:00:00.000Z", to: "2026-07-07T00:00:00.000Z" },
    metrics: ["artifact_request"], rows: [{ ...imported.rows[0], date: "2026-07-06", channel: "unknown", platform: "windows", metric: "artifact_request", value: 2 }],
  }));
  const unknownChannel = getSummary("all", Date.UTC(2026, 6, 8));
  assert.equal(unknownChannel.breakdowns.channel.find(row => row.key === "unknown" && row.source === "origin_logs")?.value, 2);
  assert.equal(unknownChannel.metricCoverage.artifact_request.complete, false, "internal coverage gaps must qualify totals");
  const highTime = Date.UTC(2026, 6, 3, 2);
  const campaigns = Array.from({length:105}, (_, index) => event({occurred_at:new Date(highTime).toISOString(),campaign:"campaign_"+index}));
  for(let index=0;index<campaigns.length;index+=32) ingestEvents(campaigns.slice(index,index+32),key("cardinality_"+index),highTime);
  const bounded = getSummary("all", Date.UTC(2026, 6, 8));
  const campaignRows = bounded.breakdowns.campaign.filter(row => row.source==="website"&&row.metric==="page_view");
  assert.equal(campaignRows.length,101,"top 100 dimensions plus an exact remaining group");
  assert.equal(campaignRows.reduce((sum,row)=>sum+row.value,0),109);
  assert.ok(campaignRows.some(row=>row.key==="Other (remaining)"));
  assert.equal(bounded.totals.page_view,109,"dimension limits never reduce totals");
  assert.equal(bounded.totals.share_open,null,"existing website coverage never invents pre-feature share zeros");
  const require = createRequire(join(process.cwd(), "package.json"));
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => { prepare(sql: string): { all(): Array<Record<string, unknown>>; get(): Record<string, unknown> }; exec(sql: string): void; close(): void } };
  const inspect = new DatabaseSync(join(directory, "distribution.sqlite"));
  const columns = inspect.prepare("pragma table_info(analytics_events)").all().map(row => String(row.name));
  for (const forbidden of ["ip", "raw_ip", "user_id", "installation_id", "device_id", "stream_url", "token"]) assert.equal(columns.includes(forbidden), false);
  assert.equal(inspect.prepare("select count(*) as n from analytics_events").get().n, 109);
  assert.throws(() => inspect.exec("update analytics_events set country='ZZ'"), /append_only/);
  assert.throws(() => inspect.exec("delete from analytics_events"), /append_only/);
  assert.throws(() => inspect.exec("delete from distribution_import_journal"), /append_only/);
  assert.ok(Number(inspect.prepare("select min(minute) as oldest from analytics_rate_windows").get().oldest) >= Math.floor(highTime/60_000)-10, "old hashed rate buckets are removed");
  const legacySchema = inspect.prepare("select sql from sqlite_master where name='analytics_events'").get().sql;
  const legacyRows = inspect.prepare("select * from analytics_events order by id").all();
  const legacyDaily = inspect.prepare("select * from analytics_daily_rollups where metric in('page_view','cta_click','command_copy') order by bucket,metric,platform,channel,country,version,campaign").all();
  closeStoreForTests();
  // A genuine pre-feature storage shape: no share table; all legacy evidence retained.
  inspect.exec("drop table analytics_share_events");
  inspect.close();
  const shareAt = Date.UTC(2026,6,8,10,0,15);
  const sharing = event({name:"share_copy_link",occurred_at:new Date(shareAt).toISOString(),platform:"android",channel:"android_direct",version:"1.0.2",campaign:"share_test",referrer:"share",share_source:"download_center"});
  const install = {...sharing,id:randomUUID(),name:"install_link_open" as const,share_source:"share" as const};
  const linuxInstall = {...install,id:randomUUID(),platform:"linux" as const,channel:"unknown",version:null,share_source:"unknown" as const};
  const center = {...install,id:randomUUID(),name:"share_link_open" as const,platform:"web" as const,channel:"unknown",version:null};
  assert.equal(getSummary("all",shareAt).totals.share_link_open,null);
  assert.deepEqual(ingestEvents([sharing,sharing,install,linuxInstall,center],key("sharing"),shareAt),{accepted:4,duplicates:1});
  let shared = getSummary("all",shareAt+60_000);
  assert.equal(shared.totals.share_copy_link,1);
  assert.equal(shared.totals.install_link_open,2);
  assert.equal(shared.totals.share_link_open,2,"tagged /get plus top-level arrival, no package-landing duplicate");
  assert.equal(shared.totals.share_native,0,"zero only within actual new-source coverage");
  assert.equal(shared.totals.page_view,109);
  assert.equal(shared.totals.confirmed_delivery,null,"share/link activity never becomes delivery evidence");
  assert.equal(shared.metricCoverage.share_link_open.complete,false);
  assert.equal(shared.changes.share_copy_link,null);
  assert.equal(getSummary("today",Date.UTC(2026,6,7,12)).totals.share_copy_link,null,"earlier periods remain unknown");
  assert.ok(shared.breakdowns.channel.some(row=>row.key==="android_direct"&&row.metric==="share_link_open"&&row.value===1&&row.source==="website_sharing"));
  throwsCode(()=>ingestEvents([{...sharing,id:first.id}],key("cross-table-conflict"),shareAt),"EVENT_ID_CONFLICT");
  closeStoreForTests();
  assert.deepEqual(ingestEvents([install],key("share-restart"),shareAt+60_000),{accepted:0,duplicates:1});
  shared=getSummary("all",shareAt+120_000);
  assert.equal(shared.totals.share_link_open,2,"derived rollups survive restart without duplicate increment");
  const afterSharing = new DatabaseSync(join(directory,"distribution.sqlite"));
  assert.equal(afterSharing.prepare("select sql from sqlite_master where name='analytics_events'").get().sql,legacySchema);
  assert.deepEqual(afterSharing.prepare("select * from analytics_events order by id").all(),legacyRows);
  assert.deepEqual(afterSharing.prepare("select * from analytics_daily_rollups where metric in('page_view','cta_click','command_copy') order by bucket,metric,platform,channel,country,version,campaign").all(),legacyDaily);
  assert.equal(afterSharing.prepare("select count(*) as n from analytics_share_events").get().n,4);
  assert.throws(()=>afterSharing.exec("update analytics_share_events set country='ZZ'"),/append_only/);
  assert.throws(()=>afterSharing.exec("delete from analytics_share_events"),/append_only/);
  afterSharing.close();
  closeStoreForTests();
  process.env.ANALYTICS_DATA_DIR = join(directory, "midnight-fixture");
  const midnightIntake = Date.UTC(2026, 6, 9, 0, 0, 15);
  ingestEvents([
    event({ occurred_at: "2026-07-08T23:59:50.000Z" }),
    event({ name: "cta_click", occurred_at: "2026-07-09T00:00:05.000Z", platform: "windows", channel: "windows_direct" }),
  ], key("midnight"), midnightIntake);
  const pendingMinute = getSummary("all", midnightIntake);
  assert.equal(pendingMinute.range.from, "2026-07-08T00:00:00.000Z");
  assert.equal(pendingMinute.totals.page_view, 1);
  assert.equal(pendingMinute.totals.cta_click, null);
  const midnightSummary = getSummary("all", midnightIntake + 60_000);
  assert.equal(midnightSummary.totals.page_view, 1);
  assert.equal(midnightSummary.totals.cta_click, 1);
  assert.equal(midnightSummary.sources[0].from, "2026-07-09T00:00:15.000Z");
  assert.equal(midnightSummary.metricCoverage.page_view.complete, false);
  assert.equal(midnightSummary.trend.find(row => row.date === "2026-07-08")?.page_view, 1);
  assert.equal(midnightSummary.trend.find(row => row.date === "2026-07-08")?.cta_click, null);
  closeStoreForTests();
  assert.equal(getSummary("all", midnightIntake + 60_000).totals.page_view, 1);
  assert.deepEqual(readdirSync(fixtureRoot), ["private-analytics"]);
  console.log("distribution-store: PASS (isolated SQLite; source coverage, identity rejection, atomic dedupe, restart persistence, rate limits, imports, rollups and comparisons)");
} finally {
  closeStoreForTests();
  if (originalDirectory === undefined) delete process.env.ANALYTICS_DATA_DIR;
  else process.env.ANALYTICS_DATA_DIR = originalDirectory;
}
