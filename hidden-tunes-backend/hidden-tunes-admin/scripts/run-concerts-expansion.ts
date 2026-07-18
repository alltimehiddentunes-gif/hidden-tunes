/**
 * Worldwide Concerts expansion runner (safe default: dry-run).
 *
 * Usage:
 *   npx tsx scripts/run-concerts-expansion.ts --dry-run
 *   npx tsx scripts/run-concerts-expansion.ts --dry-run --fixtures
 */

import path from "path";
import { fileURLToPath } from "url";

import { toConcertMediaCandidate } from "../lib/concerts/candidate";
import { runConcertsExpansion } from "../lib/concerts/expansion/runner";
import { CONCERTS_PLAYABLE_TARGET } from "../lib/concerts/expansion/progress";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");

function fixtureCandidates() {
  return [
    toConcertMediaCandidate({
      provider: "youtube",
      providerContentId: "dQw4w9WgXcQ",
      title: "Full Concert Live at Festival Hall",
      description: "Official full concert livestream replay",
      officialWatchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      playbackMethod: "youtube_embed",
      liveBroadcastContent: "none",
      durationSeconds: 5400,
      countryCode: "FR",
      languageCode: "en",
      tags: ["concert", "live"],
      embeddable: true,
    }),
    toConcertMediaCandidate({
      provider: "vimeo",
      providerContentId: "123456789",
      title: "Orchestra Concert Performance",
      description: "Live orchestra concert",
      officialWatchUrl: "https://vimeo.com/123456789",
      embedUrl: "https://player.vimeo.com/video/123456789",
      playbackMethod: "vimeo_embed",
      liveBroadcastContent: "none",
      durationSeconds: 7200,
      countryCode: "DE",
      languageCode: "de",
      tags: ["orchestra"],
      embeddable: true,
    }),
    toConcertMediaCandidate({
      provider: "hls",
      providerContentId: "https://example.com/live/concert.m3u8",
      title: "Venue Livestream Concert",
      description: "Official venue HLS livestream",
      officialWatchUrl: "https://example.com/live/concert.m3u8",
      streamUrl: "https://example.com/live/concert.m3u8",
      playbackMethod: "hls",
      liveBroadcastContent: "live",
      countryCode: "US",
      languageCode: "en",
      tags: ["livestream", "concert"],
      embeddable: true,
    }),
    toConcertMediaCandidate({
      provider: "youtube",
      providerContentId: "interview001",
      title: "Artist Interview Backstage",
      description: "interview only",
      officialWatchUrl: "https://www.youtube.com/watch?v=interview01",
      playbackMethod: "youtube_embed",
      liveBroadcastContent: "none",
      durationSeconds: 600,
      countryCode: "US",
      languageCode: "en",
      tags: ["interview"],
    }),
  ];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--write");
  const useFixtures = process.argv.includes("--fixtures");

  const report = await runConcertsExpansion({
    dryRun,
    adminRoot,
    skipNetworkValidation: useFixtures,
    fixtures: useFixtures ? fixtureCandidates() : [],
    targetPlayable: CONCERTS_PLAYABLE_TARGET,
  });

  console.log(JSON.stringify(report, null, 2));

  if (!dryRun) {
    console.error(
      "Write mode requested but production catalogue writes require explicit DB migration apply + approval. Aborting writes from this script for safety."
    );
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
