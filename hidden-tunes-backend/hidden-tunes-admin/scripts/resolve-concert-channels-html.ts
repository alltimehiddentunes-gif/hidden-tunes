/**
 * Resolve YouTube channel IDs via public page HTML (no API key).
 * Includes curated + Batch 2 wave sources. Does not invent IDs.
 */
import fs from "fs";
import path from "path";
import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import { listBatch2WaveSourceSeeds } from "../lib/concerts/expansion/batch2SourceWave";
import { getKnownConcertYouTubeChannelId } from "../lib/concerts/providers/channelIdentityMap";
import { isValidYouTubeChannelId } from "../lib/concerts/providers/youtubeOfficial";
import { resolveYouTubeChannelIdFromPage } from "../lib/concerts/providers/youtubeRss";
import type { ConcertSourceSeed } from "../lib/concerts/types";

const PENDING_NINE = new Set([
  "metropolitan-opera",
  "wiener-philharmoniker",
  "kennedy-center",
  "library-of-congress",
  "royal-college-of-music",
  "montreux-jazz",
  "montreal-jazz",
  "dutch-national-opera",
  "oxford-music",
  "metropolitan-opera-b2",
  "wiener-philharmoniker-b2",
  "kennedy-center-b2",
  "library-of-congress-b2",
  "royal-college-of-music-b2",
  "montreux-jazz-b2",
  "montreal-jazz-b2",
  "dutch-national-opera-b2",
  "oxford-music-b2",
  "montreal-jazz-alt",
]);

async function main() {
  const byKey = new Map<string, ConcertSourceSeed>();
  for (const s of [
    ...getCuratedConcertSources(),
    ...listBatch2WaveSourceSeeds(),
  ]) {
    byKey.set(s.stableKey, s);
  }
  const sources = [...byKey.values()].filter((s) => s.provider === "youtube");
  const map: Record<string, string> = {};
  const rows: Array<Record<string, unknown>> = [];
  const pendingNine: Array<Record<string, unknown>> = [];

  for (const s of sources) {
    const known =
      (s.providerChannelId && isValidYouTubeChannelId(s.providerChannelId)
        ? s.providerChannelId
        : null) || getKnownConcertYouTubeChannelId(s.stableKey);
    if (known) {
      map[s.stableKey] = known;
      rows.push({ stableKey: s.stableKey, status: "already", channelId: known });
      continue;
    }
    const handle = (s.mediaChannelUrl.match(/@([^/?#]+)/) || [])[1];
    const url = handle
      ? `https://www.youtube.com/@${handle}`
      : s.mediaChannelUrl;
    try {
      const id = await resolveYouTubeChannelIdFromPage(url);
      const row = {
        stableKey: s.stableKey,
        status: id ? "resolved" : "not_found",
        channelId: id,
        url,
        pending_nine: PENDING_NINE.has(s.stableKey),
      };
      rows.push(row);
      if (PENDING_NINE.has(s.stableKey)) pendingNine.push(row);
      if (id) map[s.stableKey] = id;
    } catch (error) {
      const row = {
        stableKey: s.stableKey,
        status: "error",
        channelId: null,
        error: error instanceof Error ? error.message : String(error),
        pending_nine: PENDING_NINE.has(s.stableKey),
      };
      rows.push(row);
      if (PENDING_NINE.has(s.stableKey)) pendingNine.push(row);
    }
  }

  const report = {
    resolved_or_known: Object.keys(map).length,
    total_youtube_sources: sources.length,
    pending_nine: pendingNine,
    map,
    rows: rows.filter((r) => r.status !== "already").slice(0, 80),
  };
  console.log(JSON.stringify(report, null, 2));
  const out = path.join(process.cwd(), "data", "concerts-channel-resolve-map.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
