/** Operator-only job. Run with the existing private environment; never browser credentials. */
import { fetchAppleAppStoreReports } from "../lib/distribution/appleAppStoreClient";
import { importAppleAppStoreReport, validateAppleAppStoreReport, closeAppleAppStoreForTests } from "../lib/distribution/appleAppStoreStore";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 4 && args[0] === "--from" && args[2] === "--to")) throw new Error("Use --from YYYY-MM-DD --to YYYY-MM-DD (exclusive), or no arguments for the previous 10 completed UTC days.");
  const to = args[3] || new Date().toISOString().slice(0, 10);
  const from = args[1] || new Date(Date.parse(to + "T00:00:00Z") - 10 * 86_400_000).toISOString().slice(0, 10);
  const reports = (await fetchAppleAppStoreReports({ from, to })).map(validateAppleAppStoreReport);
  let applied = 0, duplicates = 0;
  for (const report of reports) {
    const result = importAppleAppStoreReport(report);
    if (result.duplicate) duplicates++; else applied++;
  }
  console.log(JSON.stringify({ source: "Apple App Store Connect Sales reports", appleId: "6773324462", from, to, appliedSnapshots: applied, duplicateSnapshots: duplicates }));
}
void main().catch(() => {
  console.error("Apple App Store sync failed. Check private App Store Connect configuration, vendor number, date range and report availability. Existing evidence remains available.");
  process.exitCode = 1;
}).finally(() => closeAppleAppStoreForTests());
