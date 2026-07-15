import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WAVE4_SOURCE_RECORDS } from "../lib/tvExpansion25k/sources/worldwave4/wave4SourceMetadata";
import { TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS } from "../lib/tvExpansion25k/sources/registry";
import { TV_SOURCE_WAVE4_WEIGHTS } from "../lib/tvExpansion25k/sourceScheduler";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function inventoryCount(relativePath: string) {
  const filePath = path.join(adminRoot, relativePath);
  if (!fs.existsSync(filePath)) return 0;
  return (JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown[]).length;
}

function readJsonLoose(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const start = raw.indexOf("{");
  if (start === -1) return null;
  return JSON.parse(raw.slice(start));
}

function main() {
  const fastCount = inventoryCount(
    "lib/tvExpansion25k/sources/data/worldwave4/officialFastProvidersWave4.json"
  );
  const projectionPath = path.join(
    adminRoot,
    "data/tv-expansion-wave4/fast-unique-projection.json"
  );
  const projection = readJsonLoose(projectionPath);

  const gates = {
    localBuildFixed: true,
    structuredFailureReasons: true,
    preVerificationFilter: true,
    verifierParitySharedProbe: true,
    matureMigrationApplied: false,
    matureIsolationFlagEnabled: false,
    executeAuthorized: false,
    hasApprovedSourceWithUniqueYield: Boolean(
      projection?.uniqueSamplePassed > 0 || fastCount > 0
    ),
    projectedUniqueAdditions: projection?.projectedUniqueAdditions ?? null,
    uniqueSamplePassRate: projection?.passRate ?? null,
  };

  const recommendation =
    gates.hasApprovedSourceWithUniqueYield &&
    (projection?.uniqueSamplePassed || 0) > 0
      ? "ready for bounded production execute (official-fast-providers-wave4, max-batches 1) after VPS deploy+dry-run confirm — await explicit authorization"
      : "not ready — source yield too low";

  const report = {
    at: new Date().toISOString(),
    branchExpectation: "radio-mature-worldwide-expansion",
    activeSources: TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS,
    sourceWeights: TV_SOURCE_WAVE4_WEIGHTS,
    inventory: {
      officialFastProvidersWave4: fastCount,
      independentOfficialSeedFamilies: WAVE4_SOURCE_RECORDS.filter(
        (row) =>
          row.classification === "Independent official upstream" ||
          row.classification === "Independent licensed provider"
      ).map((row) => row.adapterId),
    },
    gates,
    recommendation,
    vpsSteps: [
      "bash deployment/manual/vps-tv-fast-dryrun.sh deploy",
      "bash deployment/manual/vps-tv-fast-dryrun.sh dryrun1",
      "bash deployment/manual/vps-tv-fast-dryrun.sh baseline",
      "Only after authorization: npm run tv:expand:fast -- --source official-fast-providers-wave4 --max-batches 1 --execute",
    ],
    preservation: {
      noExecuteInThisReport: true,
      matureIsolationDisabled: true,
      pm2RestartNotRequiredForDryRun: true,
    },
  };

  const outPath = path.join(adminRoot, "data/tv-expansion-wave4/execute-readiness.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
