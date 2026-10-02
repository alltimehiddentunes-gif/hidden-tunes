/** Operator-only job. Run with the existing private environment; never browser credentials. */
import { fetchMicrosoftStoreReports } from "../lib/distribution/microsoftStoreClient";
import { importMicrosoftStoreReport, validateMicrosoftStoreReport, closeMicrosoftStoreForTests } from "../lib/distribution/microsoftStoreStore";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 4 && args[0] === "--from" && args[2] === "--to")) throw new Error("Use --from YYYY-MM-DD --to YYYY-MM-DD (exclusive), or no arguments for the previous 10 completed UTC days.");
  const to = args[3] || new Date().toISOString().slice(0, 10);
  const from = args[1] || new Date(Date.parse(to + "T00:00:00Z") - 10 * 86_400_000).toISOString().slice(0, 10);
  // Nothing is committed until every requested page/day/metric has been retrieved and validated.
  const reports = (await fetchMicrosoftStoreReports({ from, to })).map(validateMicrosoftStoreReport);
  let applied = 0, duplicates = 0;
  for (const report of reports) {
    const result = importMicrosoftStoreReport(report);
    if (result.duplicate) duplicates++; else applied++;
  }
  console.log(JSON.stringify({ source: "Microsoft Store analytics API", from, to, appliedSnapshots: applied, duplicateSnapshots: duplicates }));
}
void main().catch(() => {
  // API bodies and credentials must never reach PM2/cron logs.
  console.error("Microsoft Store sync failed. Check the private server configuration, authorized Partner Center application, date range and service availability. Existing evidence remains available.");
  process.exitCode = 1;
}).finally(() => closeMicrosoftStoreForTests());
