import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { setExpansionActiveWave } from "../lib/tvExpansion25k/activeWave";
import { loadTvExpansion25kCheckpoint, saveTvExpansion25kCheckpoint } from "../lib/tvExpansion25k/checkpoint";
import { TV_EXPANSION_WAVE3_ACTIVE_SOURCE_IDS } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const WAVE3_JSON: Record<string, string> = {
  "xumo-official-wave3": "lib/tvExpansion25k/sources/data/worldwave3/xumoOfficialWave3.json",
  "json-teles-community-wave3": "lib/tvExpansion25k/sources/data/worldwave3/jsonTelesCommunityWave3.json",
  "country-official-manifests-wave3": "lib/tvExpansion25k/sources/data/worldwave3/countryOfficialManifestsWave3.json",
  "parliament-government-wave3": "lib/tvExpansion25k/sources/data/worldwave3/parliamentGovernmentWave3.json",
  "university-education-wave3": "lib/tvExpansion25k/sources/data/worldwave3/universityEducationWave3.json",
  "youtube-official-wave3": "lib/tvExpansion25k/sources/data/worldwave3/youtubeOfficialWave3.json",
  "iptv-org-api-residual-wave3": "lib/tvExpansion25k/sources/data/worldwave3/iptvOrgApiResidualWave3.json",
  "public-americas-wave3": "lib/tvExpansion25k/sources/data/worldwave3/publicAmericasWave3.json",
  "public-europe-wave3": "lib/tvExpansion25k/sources/data/worldwave3/publicEuropeWave3.json",
  "public-asia-pacific-wave3": "lib/tvExpansion25k/sources/data/worldwave3/publicAsiaPacificWave3.json",
  "public-africa-middle-east-wave3":
    "lib/tvExpansion25k/sources/data/worldwave3/publicAfricaMiddleEastWave3.json",
};

function inventorySize(sourceId: string) {
  const relative = WAVE3_JSON[sourceId];
  if (!relative) return 0;
  const filePath = path.join(adminRoot, relative);
  if (!fs.existsSync(filePath)) return 0;
  return (JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown[]).length;
}

function main() {
  console.log("Building wave3 source data...");
  execSync("npx tsx scripts/build-worldwide-wave3-data.ts", {
    cwd: adminRoot,
    stdio: "inherit",
  });

  const reportPath = path.join(adminRoot, "data/tv-expansion-25k/wave3-build-report.json");
  if (!fs.existsSync(reportPath)) {
    throw new Error("Wave3 build report missing after build.");
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
    resumeReady?: boolean;
    totalNewCandidates?: number;
    independentCandidates?: number;
    seenUrlCount?: number;
  };
  const postWave2Ready =
    (report.totalNewCandidates || 0) >= 500 &&
    (report.independentCandidates || 0) >= 200 &&
    (report.seenUrlCount || 0) >= 15000;
  if (!report.resumeReady && !postWave2Ready) {
    throw new Error(
      `Wave3 build not resume-ready (${report.totalNewCandidates || 0} candidates).`
    );
  }

  setExpansionActiveWave(3, adminRoot);

  const checkpoint = loadTvExpansion25kCheckpoint(adminRoot);
  checkpoint.consecutiveZeroImportBatches = 0;
  const actions: Array<Record<string, unknown>> = [];

  for (const sourceId of TV_EXPANSION_WAVE3_ACTIVE_SOURCE_IDS) {
    const size = inventorySize(sourceId);
    checkpoint.sources.adapterCursors[sourceId] = {
      ...(checkpoint.sources.adapterCursors[sourceId] || createInitialSourceCursor(sourceId)),
      cursor: "0",
      exhausted: size === 0,
      status: size === 0 ? "exhausted" : "active",
      lastError: null,
    };
    actions.push({ sourceId, size, action: size > 0 ? "activated" : "empty" });
  }

  saveTvExpansion25kCheckpoint(checkpoint, adminRoot);

  console.log(
    JSON.stringify(
      {
        event: "wave3_activated",
        at: new Date().toISOString(),
        postWave2Ready,
        totalNewCandidates: report.totalNewCandidates,
        independentCandidates: report.independentCandidates,
        actions,
      },
      null,
      2
    )
  );
}

main();
