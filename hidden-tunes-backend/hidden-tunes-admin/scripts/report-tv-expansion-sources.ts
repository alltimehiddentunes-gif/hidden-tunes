import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTvExpansion25kCheckpoint } from "../lib/tvExpansion25k/checkpoint";
import { TV_EXPANSION_25K_TARGET } from "../lib/tvExpansion25k/constants";
import { getTvPlatformEligibleCount } from "../lib/tvExpansion25k/platformCount";
import { TV_EXPANSION_SOURCE_ADAPTERS } from "../lib/tvExpansion25k/sources/registry";
import { retryFetchJson } from "../lib/tvExpansion25k/sources/shared/retryFetch";
import { loadRejectedFingerprints } from "../lib/tvExpansion25k/sources/shared/fingerprintCache";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
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

async function estimateInventories() {
  const [streams, channels] = await Promise.all([
    retryFetchJson<Array<{ channel: string; url: string }>>(
      "https://iptv-org.github.io/api/streams.json"
    ),
    retryFetchJson<Array<{ id: string; categories?: string[]; is_nsfw?: boolean }>>(
      "https://iptv-org.github.io/api/channels.json"
    ),
  ]);

  const channelById = new Map(channels.map((row) => [row.id, row]));
  const categoryCounts: Record<string, number> = {};

  for (const stream of streams) {
    const channel = channelById.get(stream.channel);
    if (!channel || channel.is_nsfw) continue;
    for (const category of channel.categories || []) {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
  }

  return {
    iptvOrgStreamsTotal: streams.length,
    iptvOrgChannelsTotal: channels.filter((row) => !row.is_nsfw).length,
    categoryCounts,
  };
}

async function main() {
  const checkpoint = loadTvExpansion25kCheckpoint(adminRoot);
  const platformEligible = await getTvPlatformEligibleCount();
  const fingerprints = loadRejectedFingerprints(adminRoot);
  const inventories = await estimateInventories();

  const iptvCursor = checkpoint.sources.adapterCursors["iptv-org"];
  const iptvRemaining = Math.max(
    0,
    inventories.iptvOrgStreamsTotal - Number(iptvCursor?.cursor || checkpoint.sources.legacy?.iptvOrgOffset || 0)
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        target: TV_EXPANSION_25K_TARGET,
        platformEligible,
        gapToTarget: Math.max(0, TV_EXPANSION_25K_TARGET - platformEligible),
        checkpoint: {
          version: checkpoint.version,
          batchNumber: checkpoint.batchNumber,
          totalImported: checkpoint.totalImported,
          adapterCursors: checkpoint.sources.adapterCursors,
        },
        rejectedFingerprintCount: fingerprints.size,
        inventories: {
          iptvOrgStreamsTotal: inventories.iptvOrgStreamsTotal,
          iptvOrgStreamsRemainingEstimate: iptvRemaining,
          iptvOrgCategoryCounts: inventories.categoryCounts,
          registeredSources: TV_EXPANSION_SOURCE_ADAPTERS.map((adapter) => ({
            id: adapter.id,
            label: adapter.label,
            cursor: checkpoint.sources.adapterCursors[adapter.id] || null,
          })),
        },
        cyclingRisk:
          iptvCursor?.exhausted === true
            ? "iptv-org marked exhausted; no repeat cycling expected"
            : "iptv-org uses forward-only cursor; exhausted only at end of stream index",
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
