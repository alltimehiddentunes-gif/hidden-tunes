import assert from "node:assert/strict";
import { applyCollectionCoverage } from "../lib/distribution/collectionCoverage";
import type { DistributionSummary } from "../lib/distribution/types";

const gap = { from: "2026-09-10T00:00:00Z", to: "2026-09-13T00:00:00Z", note: "Known endpoint outage; conservative calendar window." };
const metrics = ["page_view", "cta_click", "command_copy", "share_copy", "share_native", "share_preview_open", "install_link_open", "artifact_request", "delivered_bytes", "confirmed_delivery"];
function fixture(): DistributionSummary {
  return {
    generatedAt: "2026-09-14T00:00:00.000Z", period: "7d",
    range: { from: "2026-09-07T00:00:00.000Z", to: "2026-09-14T00:00:00.000Z" },
    previous: { from: "2026-08-31T00:00:00.000Z", to: "2026-09-07T00:00:00.000Z" },
    totals: Object.fromEntries(metrics.map(key => [key, 0])),
    changes: Object.fromEntries(metrics.map(key => [key, 25])),
    metricCoverage: Object.fromEntries(metrics.map(key => [key, { complete: true, note: "Measured." }])),
    trend: ["2026-09-09", "2026-09-10", "2026-09-12", "2026-09-13"].map(date => ({ date, ...Object.fromEntries(metrics.map(key => [key, 0])) })),
    breakdowns: { platform: [], channel: [], country: [], campaign: [], version: [] },
    sources: ["website", "website_sharing", "cloudflare_http_logpush"].map(id => ({ id, label: id, freshness: "NEAR REAL-TIME", from: "2026-09-01T00:00:00Z", to: "2026-09-14T00:00:00Z", note: "Original source." })),
  } as unknown as DistributionSummary;
}
const totals = (value: DistributionSummary) => value.totals as Record<string, number | null>;
const coverage = (value: DistributionSummary) => value.metricCoverage as Record<string, { complete: boolean; note: string }>;
const changes = (value: DistributionSummary) => value.changes as Record<string, number | null>;
const trend = (value: DistributionSummary) => value.trend as unknown as Array<Record<string, string | number | null>>;
let checks = 0;

{
  const original = fixture(), before = structuredClone(original);
  const result = applyCollectionCoverage(original, [gap]);
  assert.deepEqual(original, before, "caller input must remain untouched");
  assert.notEqual(result, original);
  assert.notEqual(result.breakdowns, original.breakdowns, "return is a deep clone");
  for (const metric of metrics.slice(0, 7)) {
    assert.equal(totals(result)[metric], null);
    assert.equal(changes(result)[metric], null);
    assert.equal(coverage(result)[metric].complete, false);
    assert.match(coverage(result)[metric].note, /Known endpoint outage/);
    assert.equal(trend(result)[0][metric], 0);
    assert.equal(trend(result)[1][metric], null);
    assert.equal(trend(result)[2][metric], null);
    assert.equal(trend(result)[3][metric], 0, "exclusive gap end must remain outside the outage");
  }
  for (const metric of metrics.slice(7)) {
    assert.equal(totals(result)[metric], 0);
    assert.equal(changes(result)[metric], 25);
    assert.equal(coverage(result)[metric].complete, true);
    assert.equal(trend(result)[1][metric], 0);
  }
  assert.match(result.sources[0].note, /Collection gap/);
  assert.match(result.sources[1].note, /Collection gap/);
  assert.deepEqual(result.sources[2], original.sources[2]);
  assert.deepEqual(result.breakdowns, original.breakdowns);
  assert.deepEqual(applyCollectionCoverage(result, [gap]), result, "idempotent annotation");
  checks++;
}
{
  const original = fixture();
  for (const metric of metrics.slice(0, 7)) { totals(original)[metric] = 12; trend(original)[1][metric] = 3; }
  totals(original).cta_click = null;
  const result = applyCollectionCoverage(original, [gap]);
  assert.equal(totals(result).page_view, 12);
  assert.equal(trend(result)[1].share_copy, 3);
  assert.equal(totals(result).cta_click, null);
  assert.equal(coverage(result).page_view.complete, false);
  checks++;
}
{
  const original = fixture();
  original.range = { from: "2026-09-01T00:00:00Z", to: gap.from };
  original.previous = null;
  assert.deepEqual(applyCollectionCoverage(original, [gap]), original, "older period is unaffected, including exact boundary");
  assert.deepEqual(applyCollectionCoverage(original, []), original);
  checks++;
}
{
  const original = fixture();
  original.range = { from: gap.to, to: "2026-09-14T00:00:00Z" };
  original.previous = { from: "2026-09-12T00:00:00Z", to: gap.to };
  const result = applyCollectionCoverage(original, [gap]);
  assert.equal(totals(result).page_view, 0, "current gap-free zero remains known");
  assert.equal(coverage(result).page_view.complete, true, "only comparison is unavailable");
  assert.equal(changes(result).page_view, null);
  assert.equal(changes(result).artifact_request, 25);
  assert.match(coverage(result).page_view.note, /Previous comparable period/);
  assert.deepEqual(result.trend, original.trend);
  checks++;
}
{
  const original = fixture();
  original.range = { from: "2026-09-10T00:00:00Z", to: "2026-09-10T03:00:00Z" };
  original.previous = null;
  const later = { from: "2026-09-10T04:00:00Z", to: "2026-09-10T06:00:00Z", note: "Later same day." };
  assert.deepEqual(applyCollectionCoverage(original, [later]), original, "gap after cutoff does not taint earlier hours");
  const intersecting = { ...later, from: "2026-09-10T02:59:59Z" };
  const result = applyCollectionCoverage(original, [intersecting]);
  assert.equal(totals(result).page_view, null);
  assert.equal(trend(result)[1].page_view, null);
  checks++;
}
{
  for (const invalid of [
    { ...gap, to: gap.from }, { ...gap, from: gap.to, to: gap.from },
    { ...gap, from: "bad" }, { ...gap, from: "2026-02-30T00:00:00Z" },
    { ...gap, from: "2026-09-10T24:00:00Z" }, { ...gap, note: " " },
  ]) assert.throws(() => applyCollectionCoverage(fixture(), [invalid]), /Collection coverage/);
  const empty = fixture(); empty.range.to = empty.range.from; empty.previous = null;
  assert.deepEqual(applyCollectionCoverage(empty, [gap]), empty, "an empty midnight window has no observed gap");
  checks++;
}
console.log("PASS collection coverage: " + checks + " grouped checks; outage unknowns, preserved observations, unchanged evidence, exclusive bounds, prior comparability, immutable input and fail-closed metadata.");
