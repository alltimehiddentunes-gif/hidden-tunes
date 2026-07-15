import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TV_EXPANSION_WAVE3_ACTIVE_SOURCE_IDS } from "../lib/tvExpansion25k/sources/registry";

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
  try {
    return (JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown[]).length;
  } catch {
    return 0;
  }
}

function main() {
  const statePath = path.join(adminRoot, "data/tv-expansion-25k/state.json");
  if (!fs.existsSync(statePath)) {
    throw new Error("Missing Wave 1–3 checkpoint at data/tv-expansion-25k/state.json");
  }

  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
    batchNumber?: number;
    lastBatch?: {
      platformEligibleAfter?: number;
      discovered?: number;
      at?: string;
    };
    sources?: {
      adapterCursors?: Record<
        string,
        {
          cursor?: string;
          processed?: number;
          accepted?: number;
          rejected?: number;
          exhausted?: boolean;
          status?: string;
          lastError?: string | null;
        }
      >;
    };
  };

  const rows = TV_EXPANSION_WAVE3_ACTIVE_SOURCE_IDS.map((sourceId) => {
    const cursor = state.sources?.adapterCursors?.[sourceId];
    const candidateTotal = inventorySize(sourceId);
    const cursorNum = Number(cursor?.cursor || cursor?.processed || 0);
    const exhausted = cursor?.exhausted === true || cursor?.status === "exhausted";
    let exhaustedReason = "active";
    if (exhausted && cursorNum >= candidateTotal) exhaustedReason = "cursor_reached_inventory_end";
    else if (exhausted && candidateTotal === 0) exhaustedReason = "empty_inventory";
    else if (exhausted) exhaustedReason = "marked_exhausted";
    else if (cursor?.lastError) exhaustedReason = `error:${cursor.lastError}`;

    return {
      source: sourceId,
      cursor: cursor?.cursor || "0",
      candidateTotal,
      discovered: cursor?.processed || 0,
      accepted: cursor?.accepted || 0,
      duplicate: null,
      rejected: cursor?.rejected || 0,
      failed: cursor?.lastError ? 1 : 0,
      exhaustedReason,
      lastSuccessfulDiscovery: state.lastBatch?.at || null,
      exhausted,
      status: cursor?.status || "unknown",
    };
  });

  const allExhausted = rows.every((row) => row.exhausted);
  const recentZeroDiscovery = (state.lastBatch?.discovered || 0) === 0;

  const report = {
    at: new Date().toISOString(),
    platformEligibleAfter: state.lastBatch?.platformEligibleAfter || null,
    batchNumber: state.batchNumber || null,
    allWave3SourcesExhausted: allExhausted,
    recentBatchesZeroDiscovery: recentZeroDiscovery,
    incorrectlyExhausted: rows.filter(
      (row) =>
        row.exhausted &&
        Number(row.cursor) < row.candidateTotal &&
        row.candidateTotal > 0
    ),
    sources: rows,
    conclusion: allExhausted
      ? recentZeroDiscovery
        ? "Wave 3 genuinely exhausted — safe to proceed with Wave 4."
        : "Wave 3 cursors exhausted but last batch had discoveries — review before Wave 4."
      : "Wave 3 not fully exhausted — do not activate Wave 4 yet.",
  };

  const outPath = path.join(adminRoot, "data/tv-expansion-25k/wave3-exhaustion-report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
