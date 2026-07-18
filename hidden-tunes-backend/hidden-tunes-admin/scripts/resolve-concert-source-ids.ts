/**
 * Resolve Concerts source identities with ownership checks + report.
 * Records newly resolved UC… IDs into channelIdentityMap (non-dry-run only).
 *
 * Usage:
 *   npx tsx scripts/resolve-concert-source-ids.ts --dry-run
 *   npx tsx scripts/resolve-concert-source-ids.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import {
  applyResolvedIdentitiesToChannelMap,
  resolveConcertSourceIdentities,
} from "../lib/concerts/import/identityResolution";
import { CONCERT_YOUTUBE_CHANNEL_IDS } from "../lib/concerts/providers/channelIdentityMap";
import { hasConcertYouTubeApiKey } from "../lib/concerts/providers/youtubeClient";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");

function writeChannelIdentityMap(merged: Record<string, string>) {
  const mapPath = path.join(
    adminRoot,
    "lib",
    "concerts",
    "providers",
    "channelIdentityMap.ts"
  );
  const entries = Object.entries(merged)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, id]) => `  "${key}": "${id}",`)
    .join("\n");

  const contents = `/**
 * Verified / researched YouTube channel IDs for curated Concerts sources.
 * Prefer API forHandle resolution when YOUTUBE_API_KEY is present.
 * Entries here are only IDs confirmed from official channel URLs or Wikidata P2397
 * or YouTube Data API forHandle resolution with ownership checks.
 */

export const CONCERT_YOUTUBE_CHANNEL_IDS: Record<string, string> = {
${entries}
};

export function getKnownConcertYouTubeChannelId(
  stableKey: string
): string | null {
  return CONCERT_YOUTUBE_CHANNEL_IDS[stableKey] || null;
}
`;
  fs.writeFileSync(mapPath, contents);
  return mapPath;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sources = getCuratedConcertSources();
  const { rows, summary } = await resolveConcertSourceIdentities(sources);

  const newlyResolved = applyResolvedIdentitiesToChannelMap(
    rows.filter((r) => r.status === "resolved")
  );
  const merged = {
    ...CONCERT_YOUTUBE_CHANNEL_IDS,
    ...newlyResolved,
  };

  const report = {
    dry_run: dryRun,
    youtube_api_key_present: hasConcertYouTubeApiKey(),
    generated_at: new Date().toISOString(),
    summary,
    resolved_or_known: rows.filter((r) =>
      ["resolved", "already_resolved"].includes(r.status)
    ).length,
    unresolved: rows.filter((r) =>
      ["not_found", "ambiguous", "wrong_owner", "temporarily_blocked"].includes(
        r.status
      )
    ).length,
    newly_resolved_count: Object.keys(newlyResolved).length,
    newly_resolved: newlyResolved,
    channel_map_size: Object.keys(merged).length,
    rows,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!dryRun) {
    const outPath = path.join(
      adminRoot,
      "data",
      "concerts-identity-resolution-report.json"
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    let mapPath: string | null = null;
    if (Object.keys(newlyResolved).length > 0) {
      mapPath = writeChannelIdentityMap(merged);
    }

    console.log(
      JSON.stringify(
        {
          wrote: outPath,
          channel_map_updated: mapPath,
          note: hasConcertYouTubeApiKey()
            ? "Resolved IDs recorded when ownership checks passed"
            : "No YOUTUBE_API_KEY — unresolved handles preserved without inventing IDs",
        },
        null,
        2
      )
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
