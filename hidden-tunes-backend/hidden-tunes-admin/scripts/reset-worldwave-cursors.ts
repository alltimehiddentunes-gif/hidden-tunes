import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTvExpansion25kCheckpoint, saveTvExpansion25kCheckpoint } from "../lib/tvExpansion25k/checkpoint";
import { TV_EXPANSION_ACTIVE_SOURCE_IDS } from "../lib/tvExpansion25k/sources/registry";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const WAVE2_JSON: Record<string, string> = {
  "paratv-official": "lib/tvExpansion25k/sources/data/worldwave/paraTvOfficial.json",
  "paratv-stream-manifests": "lib/tvExpansion25k/sources/data/worldwave/paraTvStreamManifests.json",
  "iptv-org-unseen-worldwave": "lib/tvExpansion25k/sources/data/worldwave/iptvOrgUnseenWorldwave.json",
  "free-tv-world-countries": "lib/tvExpansion25k/sources/data/worldwave/freeTvWorldCountries.json",
  "official-org-manifests": "lib/tvExpansion25k/sources/data/worldwave/officialOrgManifests.json",
  "parliament-worldwave": "lib/tvExpansion25k/sources/data/worldwave/parliamentWorldwave.json",
  "public-europe-wave2": "lib/tvExpansion25k/sources/data/worldwave/publicEuropeWave2.json",
  "public-americas-wave2": "lib/tvExpansion25k/sources/data/worldwave/publicAmericasWave2.json",
  "public-asia-pacific-wave2": "lib/tvExpansion25k/sources/data/worldwave/publicAsiaPacificWave2.json",
  "public-africa-middle-east-wave2": "lib/tvExpansion25k/sources/data/worldwave/publicAfricaMiddleEastWave2.json",
  "bloomberg-official": "lib/tvExpansion25k/sources/data/worldwave/bloombergOfficial.json",
  "france-medias-official": "lib/tvExpansion25k/sources/data/worldwave/franceMediasOfficial.json",
  "cgtn-official": "lib/tvExpansion25k/sources/data/worldwave/cgtnOfficial.json",
  "redbull-official": "lib/tvExpansion25k/sources/data/worldwave/redbullOfficial.json",
  "dw-official": "lib/tvExpansion25k/sources/data/worldwave/dwOfficial.json",
  "youtube-official-worldwave": "lib/tvExpansion25k/sources/data/worldwave/youtubeOfficialWorldwave.json",
  "independent-m3u-worldwave": "lib/tvExpansion25k/sources/data/worldwave/independentM3uWorldwave.json",
};

function inventorySize(sourceId: string) {
  const relative = WAVE2_JSON[sourceId];
  if (!relative) return 0;
  const filePath = path.join(adminRoot, relative);
  if (!fs.existsSync(filePath)) return 0;
  return (JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown[]).length;
}

function main() {
  const checkpoint = loadTvExpansion25kCheckpoint(adminRoot);
  const report: Array<Record<string, unknown>> = [];

  for (const sourceId of TV_EXPANSION_ACTIVE_SOURCE_IDS) {
    const size = inventorySize(sourceId);
    const cursor = checkpoint.sources.adapterCursors[sourceId];
    if (!cursor) {
      checkpoint.sources.adapterCursors[sourceId] = createInitialSourceCursor(sourceId);
      report.push({ sourceId, action: "created", size });
      continue;
    }

    const offset = Math.max(0, Number(cursor.cursor || 0));
    const shouldResume =
      size > offset ||
      (size > 0 && cursor.processed === 0 && cursor.exhausted) ||
      (size > 0 && offset > size);

    if (shouldResume) {
      const nextOffset = offset > size ? 0 : offset;
      checkpoint.sources.adapterCursors[sourceId] = {
        ...cursor,
        cursor: String(nextOffset),
        exhausted: false,
        status: "active",
        lastError: null,
      };
      report.push({
        sourceId,
        action: "reactivated",
        size,
        cursor: offset,
        processed: cursor.processed,
      });
      continue;
    }

    if (size === 0) {
      checkpoint.sources.adapterCursors[sourceId] = {
        ...cursor,
        exhausted: true,
        status: "exhausted",
      };
      report.push({ sourceId, action: "empty_inventory", size: 0 });
      continue;
    }

    report.push({ sourceId, action: "unchanged", size, cursor: offset, exhausted: cursor.exhausted });
  }

  saveTvExpansion25kCheckpoint(checkpoint, adminRoot);
  console.log(JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
}

main();
