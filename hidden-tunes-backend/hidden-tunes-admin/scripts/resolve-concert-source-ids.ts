/**
 * Resolve official YouTube channel IDs for curated Concerts sources.
 *
 * Usage:
 *   npx tsx scripts/resolve-concert-source-ids.ts --dry-run
 *   npx tsx scripts/resolve-concert-source-ids.ts
 *
 * Uses known map + YOUTUBE_API_KEY forHandle when available.
 * Does not write to production DB unless --write-db is passed (still not for prod casually).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import { getKnownConcertYouTubeChannelId } from "../lib/concerts/providers/channelIdentityMap";
import {
  hasConcertYouTubeApiKey,
  resolveYouTubeChannelIdForHandle,
} from "../lib/concerts/providers/youtubeClient";
import { isValidYouTubeChannelId } from "../lib/concerts/providers/youtubeOfficial";
import { normalizeYouTubeChannelUrl } from "../lib/concerts/providers/youtubeOfficial";
import { isConcertSourceImportEligible } from "../lib/concerts/import/sourceEligibility";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");

function extractHandle(mediaChannelUrl: string): string | null {
  const normalized = normalizeYouTubeChannelUrl(mediaChannelUrl) || mediaChannelUrl;
  try {
    const url = new URL(normalized);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return parts[0].slice(1);
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sources = getCuratedConcertSources();
  const rows = [];

  for (const source of sources) {
    const known = getKnownConcertYouTubeChannelId(source.stableKey);
    let resolved =
      (source.providerChannelId && isValidYouTubeChannelId(source.providerChannelId)
        ? source.providerChannelId
        : null) || known;

    let method = resolved
      ? source.providerChannelId
        ? "seed"
        : "known_map"
      : null;

    if (!resolved && source.provider === "youtube" && hasConcertYouTubeApiKey()) {
      const handle = extractHandle(source.mediaChannelUrl);
      if (handle) {
        resolved = await resolveYouTubeChannelIdForHandle(handle);
        method = resolved ? "youtube_api_forHandle" : "youtube_api_miss";
      }
    }

    rows.push({
      stableKey: source.stableKey,
      eligible: isConcertSourceImportEligible(source),
      importEnabled: source.importEnabled,
      provider: source.provider,
      resolvedChannelId: resolved,
      method,
      needsApi: source.provider === "youtube" && !resolved,
    });
  }

  const summary = {
    dry_run: dryRun,
    youtube_api_key_present: hasConcertYouTubeApiKey(),
    total: rows.length,
    resolved: rows.filter((r) => r.resolvedChannelId).length,
    unresolved_youtube: rows.filter((r) => r.needsApi).length,
    import_enabled: rows.filter((r) => r.importEnabled).length,
    rows,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!dryRun) {
    const outPath = path.join(adminRoot, "data", "concerts-channel-id-resolution.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ wrote: outPath }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
