import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

async function main() {
  const batches = Math.max(1, Number(process.argv[2] || 60));
  const limit = Math.max(1, Number(process.argv[3] || 150));
  const { runTvStationSoftHealthRefresh } = await import("../lib/tvStationHealth");
  const { getTvPlatformEligibleCounts } = await import("../lib/tvExpansion25k/platformCount");

  let totalChecked = 0;
  let totalPlayable = 0;
  let totalSoftSkipped = 0;

  for (let i = 1; i <= batches; i += 1) {
    const result = await runTvStationSoftHealthRefresh(limit);
    totalChecked += Number(result.checked || 0);
    totalPlayable += Number(result.playable || 0);
    totalSoftSkipped += Number(result.softSkipped || 0);
    const counts = await getTvPlatformEligibleCounts();
    console.log(
      JSON.stringify({
        event: "tv_health_refresh_batch",
        batch: i,
        checked: result.checked,
        playable: result.playable,
        softSkipped: result.softSkipped,
        totalChecked,
        totalPlayable,
        totalSoftSkipped,
        normalPlatformEligible: counts.normalPlatformEligible,
        searchDiscoveryEligible: counts.searchDiscoveryEligible,
        combinedPlayableEligible: counts.combinedPlayableEligible,
        gapTo40k: Math.max(0, 40000 - counts.combinedPlayableEligible),
      })
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
