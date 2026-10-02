import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fetchAppleAppStoreReports, AppleAppStoreClientError } from "../lib/distribution/appleAppStoreClient";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ENV = {
  APPLE_ASC_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
  APPLE_ASC_KEY_ID: "ABC123DEFG",
  APPLE_ASC_VENDOR_NUMBER: "1234567",
  APPLE_ASC_PRIVATE_KEY: pem,
};

function tsv(rows: string[][]) {
  return gzipSync(Buffer.from(["Provider\tProvider Country\tSKU\tDeveloper\tTitle\tVersion\tProduct Type Identifier\tUnits\tDeveloper Proceeds\tBegin Date\tEnd Date\tCustomer Currency\tCountry Code\tCurrency of Proceeds\tApple Identifier\tCustomer Price\tPromo Code\tParent Identifier\tSubscription\tPeriod\tCategory\tCMB\tDevice\tSupported Platforms\tProceeds Reason\tPreserved Pricing\tClient\tOrder Type",
    ...rows.map(cols => cols.join("\t")),
  ].join("\n")));
}

function row(opts: { type: string; units: string; country: string; version?: string; appleId?: string; begin?: string }) {
  return ["", "", "HT", "Hidden", "Hidden Tunes", opts.version || "1.0.216", opts.type, opts.units, "0", opts.begin || "09/01/2026", "09/01/2026", "USD", opts.country, "USD", opts.appleId || "6773324462", "0", "", "", "", "", "", "", "iPhone", "iOS", "", "", "", ""];
}

async function rejected(run: () => Promise<unknown>, code: string) {
  try { await run(); assert.fail("expected failure " + code); }
  catch (error) {
    assert.ok(error instanceof AppleAppStoreClientError, String(error));
    assert.equal(error.code, code);
  }
}

async function main() {
  await rejected(() => fetchAppleAppStoreReports({ from: "2026-09-01", to: "2026-09-02", env: {} }), "NOT_CONFIGURED");
  await rejected(() => fetchAppleAppStoreReports({ from: "2026-09-01", to: "2026-10-10", env: ENV }), "INVALID_RANGE");

  const body = tsv([
    row({ type: "1", units: "3", country: "US" }),
    row({ type: "7", units: "2", country: "US" }),
    row({ type: "1", units: "9", country: "GB", appleId: "9999999999" }),
  ]);
  const reports = await fetchAppleAppStoreReports({
    from: "2026-09-01", to: "2026-09-02", env: ENV,
    fetchImpl: async () => new Response(body, { status: 200, headers: { "content-type": "application/a-gzip" } }),
  });
  assert.equal(reports.length, 2);
  const units = reports.find(report => report.metric === "store_units")!;
  const updates = reports.find(report => report.metric === "store_updates")!;
  assert.equal(units.rows.reduce((sum, row) => sum + row.value, 0), 3);
  assert.equal(updates.rows.reduce((sum, row) => sum + row.value, 0), 2);
  assert.ok(!JSON.stringify(reports).includes(pem.slice(0, 40)));
  assert.ok(units.rows.every(row => !(row.country === "GB" && row.value === 9)));

  await rejected(() => fetchAppleAppStoreReports({
    from: "2026-09-01", to: "2026-09-02", env: ENV,
    fetchImpl: async () => new Response("nope", { status: 401 }),
  }), "UNAUTHORIZED");

  console.log("PASS Apple App Store API client: Sales SUMMARY parse, Apple ID filter, N/A isolation from other apps, auth failure mapping, no private key leakage.");
}
void main();
