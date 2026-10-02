import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeAppleAppStoreForTests, getAppleAppStoreSummary, importAppleAppStoreReport, validateAppleAppStoreReport } from "../lib/distribution/appleAppStoreStore";
import type { AppleAppStoreImport } from "../lib/distribution/appleAppStoreTypes";

const fixtureRoot = mkdtempSync(join(tmpdir(), "ht-apple-app-store-"));
process.env.ANALYTICS_DATA_DIR = fixtureRoot;
for (const name of ["APPLE_ASC_ISSUER_ID", "APPLE_ASC_KEY_ID", "APPLE_ASC_VENDOR_NUMBER", "APPLE_ASC_PRIVATE_KEY", "APPLE_ASC_PRIVATE_KEY_PATH"]) delete process.env[name];

function report(partial: Partial<AppleAppStoreImport> & Pick<AppleAppStoreImport, "metric" | "coverage" | "rows">): AppleAppStoreImport {
  return validateAppleAppStoreReport({
    schemaVersion: 1,
    appleId: "6773324462",
    source: "apple_report",
    providerFreshness: null,
    ...partial,
  });
}

try {
  const blank = getAppleAppStoreSummary("7d", new Date("2026-10-02T12:00:00Z"));
  assert.equal(blank.status, "NOT_CONNECTED");
  assert.equal(blank.configured, false);
  assert.equal(blank.appleId, "6773324462");
  assert.equal(blank.appName, "Hidden Tunes");
  assert.equal(blank.metrics.store_units.value, null);
  assert.equal(blank.metrics.store_updates.value, null);
  assert.ok(blank.unavailable.includes("sessions"));
  assert.ok(blank.unavailable.includes("crashes"));

  assert.throws(() => validateAppleAppStoreReport({ schemaVersion: 1, appleId: "000", metric: "store_units", source: "apple_report", coverage: { from: "2026-09-01", to: "2026-09-02" }, providerFreshness: null, rows: [] }), /Unsupported/);

  const units = report({
    metric: "store_units",
    coverage: { from: "2026-09-01", to: "2026-09-03" },
    rows: [
      { date: "2026-09-01", country: "US", version: "1.0.216", value: 4 },
      { date: "2026-09-02", country: "GB", version: "1.0.216", value: 2 },
    ],
  });
  const first = importAppleAppStoreReport(units);
  assert.equal(first.duplicate, false);
  assert.equal(importAppleAppStoreReport(units).duplicate, true, "identical snapshot is idempotent");

  const updates = report({
    metric: "store_updates",
    coverage: { from: "2026-09-01", to: "2026-09-03" },
    rows: [{ date: "2026-09-01", country: "US", version: "1.0.216", value: 1 }],
  });
  importAppleAppStoreReport(updates);

  const summary = getAppleAppStoreSummary("30d", new Date("2026-09-20T00:00:00Z"));
  assert.equal(summary.status, "MANUAL_IMPORT");
  assert.equal(summary.metrics.store_units.value, 6);
  assert.equal(summary.metrics.store_updates.value, 1);
  assert.ok(summary.countries.some(row => row.country === "US" && row.store_units === 4));
  assert.ok(summary.versions.some(row => row.version === "1.0.216" && row.store_units === 6));

  // Provider isolation: Microsoft credentials must not mark Apple configured.
  process.env.MICROSOFT_STORE_TENANT_ID = "11111111-2222-3333-4444-555555555555";
  process.env.MICROSOFT_STORE_CLIENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  process.env.MICROSOFT_STORE_CLIENT_SECRET = "SYNTHETIC";
  assert.equal(getAppleAppStoreSummary("7d", new Date("2026-10-02T12:00:00Z")).configured, false);

  console.log("Apple App Store persistence: PASS (N/A semantics, Apple ID binding, idempotent import, territory/version dims, provider isolation)");
} finally {
  closeAppleAppStoreForTests();
  rmSync(fixtureRoot, { recursive: true, force: true });
}
