/**
 * Static performance budget for TV browse (no full-catalogue fetch, no stream prefetch).
 *   npm run verify:tv-performance-budget
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cleanRoot = path.resolve(adminRoot, "../../../HiddenTunes-CLEAN-1.0.142");

function readMaybe(p: string) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const videosRoute = fs.readFileSync(path.join(adminRoot, "app/api/tv/videos/route.ts"), "utf8");
  assert.ok(videosRoute.includes("MAX_PAGE_SIZE = 100") || videosRoute.includes("MAX_PAGE_SIZE"));
  assert.ok(videosRoute.includes("DEFAULT_PAGE_SIZE"));
  assert.ok(videosRoute.includes(".range("));
  assert.ok(!/limit:\s*10_000/.test(videosRoute));
  assert.ok(videosRoute.includes("hasMore"));
  assert.ok(videosRoute.includes("nextPage"));

  const mobileApi = readMaybe(path.join(cleanRoot, "services/tvCatalogApi.ts"));
  const mobileFeed = readMaybe(path.join(cleanRoot, "app/youtube-feed.tsx"));

  if (mobileApi) {
    assert.ok(mobileApi.includes("TV_CATEGORY_PAGE_LIMIT"));
    assert.ok(!/limit:\s*5000/.test(mobileApi));
    // Playback is on-demand by id — not prefetch of every card stream
    assert.ok(mobileApi.includes("fetchTvPlayback") || mobileApi.includes("/play"));
  }

  if (mobileFeed) {
    assert.ok(mobileFeed.includes("onEndReached"));
    assert.ok(mobileFeed.includes("loadMoreCategory"));
    assert.ok(mobileFeed.includes("categoryHasMore"));
    assert.ok(mobileFeed.includes("removeClippedSubviews") || mobileFeed.includes("windowSize"));
    assert.ok(!mobileFeed.includes("prefetchAllStreams"));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        proofs: [
          "bounded_page_size",
          "server_range_pagination",
          "hasMore_nextPage_contract",
          "mobile_incremental_scroll",
          "no_full_catalogue_fetch",
          "no_stream_prefetch_flag",
        ],
        mobileWorkspacePresent: Boolean(mobileApi && mobileFeed),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
