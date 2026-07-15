import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function readBatchLog(filePath: string) {
  if (!fs.existsSync(filePath)) return [] as Array<Record<string, unknown>>;
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function main() {
  const batches = readBatchLog(path.join(adminRoot, "data/tv-expansion-25k/batch-log.jsonl"));

  let discovered = 0;
  let importFound = 0;
  let importUnique = 0;
  let importImported = 0;
  let importRejected = 0;
  let preDedupeRemoved = 0;
  let platformEligibleDelta = 0;
  let firstEligible = 0;
  let lastEligible = 0;

  for (const batch of batches) {
    discovered += Number(batch.discovered || 0);
    importFound += Number(batch.importFound || 0);
    importUnique += Number(batch.importUnique || 0);
    importImported += Number(batch.importImported || 0);
    importRejected += Number(batch.importRejected || 0);
    preDedupeRemoved += Number(batch.preDedupeRemoved || 0);
    const before = Number(batch.platformEligibleBefore || 0);
    const after = Number(batch.platformEligibleAfter || 0);
    if (firstEligible === 0 && after > 0) firstEligible = before;
    lastEligible = after;
    platformEligibleDelta += Math.max(0, after - before);
  }

  const candidateToImportRate = discovered > 0 ? importImported / discovered : 0;
  const importToEligibleRate = importImported > 0 ? platformEligibleDelta / importImported : 0;
  const discoveredToEligibleRate = discovered > 0 ? platformEligibleDelta / discovered : 0;
  const duplicateRate = discovered > 0 ? preDedupeRemoved / discovered : 0;
  const verificationFailureRate =
    importFound > 0 ? (importFound - importImported) / importFound : 0;

  const remainingGap = Math.max(0, 25000 - lastEligible);
  const minRawNeeded = discoveredToEligibleRate > 0 ? Math.ceil(remainingGap / discoveredToEligibleRate) : null;
  const recommendedRawNeeded =
    discoveredToEligibleRate > 0 ? Math.ceil((remainingGap / discoveredToEligibleRate) * 1.5) : null;
  const highConfidenceTarget =
    discoveredToEligibleRate > 0 ? Math.ceil((remainingGap / discoveredToEligibleRate) * 2.25) : null;

  const report = {
    at: new Date().toISOString(),
    batchesAnalyzed: batches.length,
    totals: {
      discovered,
      preDedupeRemoved,
      importFound,
      importUnique,
      importImported,
      importRejected,
      platformEligibleDelta,
      firstEligible,
      lastEligible,
    },
    rates: {
      candidateToImportRate,
      importToEligibleRate,
      discoveredToEligibleRate,
      duplicateRate,
      verificationFailureRate,
    },
    gap: {
      target: 25000,
      currentPlatformEligible: lastEligible,
      remainingGap,
      minimumRawCandidatesNeeded: minRawNeeded,
      recommendedRawCandidatesNeeded: recommendedRawNeeded,
      highConfidenceCandidateTarget: highConfidenceTarget,
    },
  };

  const outPath = path.join(adminRoot, "data/tv-expansion-wave4/yield-analysis.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
