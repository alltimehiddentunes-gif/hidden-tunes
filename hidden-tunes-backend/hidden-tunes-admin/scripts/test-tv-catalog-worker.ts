import assert from "node:assert/strict";

import { mapTvCategories } from "../lib/tvCategoryMapper";
import { curatedHlsSeedsToCandidates } from "../lib/tvCuratedSeedBridge";
import { buildTvCandidatePool, prioritizeTvCandidates } from "../lib/tvCandidatePool";
import { buildTvPublicCategoryCatalog } from "../lib/tvPublicCategories";
import {
  dedupeTvGrowthCandidates,
  detectTvStreamPayload,
  validatePublicTvUrl,
} from "../lib/tvStationHealth";
import { youtubeStarterRowsToCandidates } from "../lib/tvYoutubeStarterBridge";

async function main() {
  const mapped = mapTvCategories({
    title: "Vevo Hip-Hop Live Session",
    seedCategory: "music",
    country: "US",
    isFeatured: true,
  });

  assert.ok(mapped.all.includes("Hip Hop"));
  assert.ok(mapped.all.includes("Music TV"));
  assert.ok(mapped.all.includes("Featured"));

  const categories = buildTvPublicCategoryCatalog();
  for (const required of [
    "Featured",
    "Trending",
    "Afrobeats",
    "Worship Music",
    "Festival Streams",
    "Motivation",
    "Emotional Worlds",
  ]) {
    assert.ok(
      categories.some((entry) => entry.name === required),
      `missing category ${required}`
    );
  }

  const hlsManifest = detectTvStreamPayload(
    "application/vnd.apple.mpegurl",
    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\n/live/0.m3u8"
  );
  assert.equal(hlsManifest.isHlsManifest, true);
  assert.equal(hlsManifest.isVideoLike, true);

  const deduped = dedupeTvGrowthCandidates(
    [
      {
        source_type: "hls_stream",
        source_id: "a",
        source_url: "https://stream.example.com/live.m3u8",
        title: "News One",
        country: "US",
      },
      {
        source_type: "hls_stream",
        source_id: "b",
        source_url: "https://stream.example.com/live.m3u8/",
        title: "News Two",
        country: "US",
      },
    ],
    {
      sourceKeys: new Set(),
      urlKeys: new Set(),
      titleCountryKeys: new Set(),
    }
  );
  assert.equal(deduped.length, 1);

  assert.equal(validatePublicTvUrl("http://127.0.0.1/live.m3u8").ok, false);

  const youtubeCandidates = youtubeStarterRowsToCandidates();
  assert.ok(youtubeCandidates.length >= 30, "expected youtube starter rows");

  const curatedCandidates = curatedHlsSeedsToCandidates();
  assert.ok(curatedCandidates.length >= 50, "expected curated HLS seeds");

  const prioritized = prioritizeTvCandidates(
    [...curatedCandidates, ...youtubeCandidates],
    10
  );
  assert.equal(prioritized.length, 10);
  assert.ok(prioritized[0].source_key?.startsWith("curated:"));

  if (process.env.TV_CATALOG_WORKER_LIVE === "1") {
    const pool = await buildTvCandidatePool({ iptvLimit: 20 });
    assert.ok(pool.report.mergedUnique >= 60);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        categoryCount: categories.length,
        youtubeStarterCandidates: youtubeCandidates.length,
        curatedHlsCandidates: curatedCandidates.length,
      },
      null,
      2
    )
  );
}

void main();
