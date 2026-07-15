import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { setExpansionActiveWave } from "../lib/tvExpansion25k/activeWave";
import {
  createInitialWave4Checkpoint,
  loadTvWave4Checkpoint,
  saveTvWave4Checkpoint,
} from "../lib/tvExpansion25k/wave4/checkpoint";
import { TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const WAVE4_JSON: Record<string, string> = {
  "iptv-org-github-countries-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/iptvOrgGithubCountriesWave4.json",
  "country-official-manifests-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/countryOfficialManifestsWave4.json",
  "parliament-government-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/parliamentGovernmentWave4.json",
  "international-news-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/internationalNewsWave4.json",
  "religious-education-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/religiousEducationWave4.json",
  "regional-community-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/regionalCommunityWave4.json",
  "free-community-playlists-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/freeCommunityPlaylistsWave4.json",
  "education-culture-wave4":
    "lib/tvExpansion25k/sources/data/worldwave4/educationCultureWave4.json",
};

function inventorySize(sourceId: string) {
  const relative = WAVE4_JSON[sourceId];
  if (!relative) return 0;
  const filePath = path.join(adminRoot, relative);
  if (!fs.existsSync(filePath)) return 0;
  return (JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown[]).length;
}

function main() {
  console.log("Building Wave 4 source data...");
  execSync("npx tsx scripts/build-worldwide-wave4-data.ts", {
    cwd: adminRoot,
    stdio: "inherit",
  });

  const reportPath = path.join(adminRoot, "data/tv-expansion-wave4/wave4-build-report.json");
  if (!fs.existsSync(reportPath)) {
    throw new Error("Wave 4 build report missing after build.");
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
    resumeReady?: boolean;
    totalNewCandidates?: number;
    independentCandidates?: number;
  };

  if (!report.resumeReady && (report.totalNewCandidates || 0) < 500) {
    throw new Error(
      `Wave 4 build not resume-ready (${report.totalNewCandidates || 0} candidates). Expand source inventory before activation.`
    );
  }

  setExpansionActiveWave(4, adminRoot);

  const checkpoint = loadTvWave4Checkpoint(adminRoot);
  checkpoint.consecutiveEmptyBatches = 0;
  const actions: Array<Record<string, unknown>> = [];

  for (const sourceId of TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS) {
    const size = inventorySize(sourceId);
    checkpoint.sources.adapterCursors[sourceId] = {
      ...(checkpoint.sources.adapterCursors[sourceId] || createInitialSourceCursor(sourceId)),
      cursor: "0",
      page: 0,
      processed: 0,
      exhausted: size === 0,
      status: size === 0 ? "exhausted" : "active",
      lastError: null,
    };
    actions.push({ sourceId, size, action: size > 0 ? "activated" : "empty" });
  }

  saveTvWave4Checkpoint(checkpoint, adminRoot);

  console.log(
    JSON.stringify(
      {
        event: "wave4_activated",
        at: new Date().toISOString(),
        totalNewCandidates: report.totalNewCandidates,
        independentCandidates: report.independentCandidates,
        actions,
        note: "Wave 4 checkpoint isolated at data/tv-expansion-wave4/state.json",
      },
      null,
      2
    )
  );
}

main();
