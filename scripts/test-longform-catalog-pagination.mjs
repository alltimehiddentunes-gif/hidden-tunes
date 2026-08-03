import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = (path) => readFileSync(resolve(root, path), "utf8");
const requirePatterns = (path, patterns) => {
  const text = source(path);
  for (const pattern of patterns) {
    assert.match(text, pattern, `${path} is missing ${pattern}`);
  }
  assert.doesNotMatch(text, /fetchHiddenTunesCatalog/, `${path} must not use legacy catalog fetch`);
};

requirePatterns("services/motivationCatalogApi.ts", [
  /MOTIVATION_HOME_LANE_LIMIT = 30/,
  /featuredRows.*slice\(0, MOTIVATION_HOME_LANE_LIMIT\)/,
]);
requirePatterns("app/motivation/index.tsx", [/useFocusEffect/, /focusedRef/, /abortRef\.current\?\.abort/]);
requirePatterns("app/lectures/index.tsx", [
  /LECTURES_DEFAULT_PAGE_LIMIT/,
  /onEndReached={onEndReached}/,
  /useFocusEffect/,
  /browseAbortRef\.current\?\.abort/,
]);
requirePatterns("app/lectures/[id].tsx", [/sessionLimit: 40/, /loadMoreSessions/, /useFocusEffect/]);
requirePatterns("services/podcastService.ts", [
  /PODCAST_ROOT_SECTION_PREVIEW_LIMIT = 20/,
  /PODCAST_CATEGORY_PREVIEW_LIMIT = 30/,
  /PODCAST_MATURE_SECTION_PREVIEW_LIMIT = 20/,
  /PODCAST_LOCAL_SEARCH_SCAN_BUDGET = 240/,
  /getPodcastShowsByCategory\([\s\S]*limit = PODCAST_CATEGORY_PREVIEW_LIMIT/,
]);
assert.doesNotMatch(
  source("services/podcastService.ts"),
  /id: "all-mature-podcasts"[\s\S]*shows: matureShows/,
  "mature helper must not materialize an all-mature catalog"
);
requirePatterns("app/podcasts/show/[id].tsx", [
  /PODCAST_CATALOG_PAGE_LIMIT/,
  /loadMoreEpisodes/,
  /useFocusEffect/,
]);
requirePatterns("app/podcasts/category/[id].tsx", [
  /PODCAST_CATALOG_PAGE_LIMIT/,
  /loadMore/,
  /useFocusEffect/,
]);
requirePatterns("hooks/useMaturePodcastCatalog.ts", [
  /if \(!enabled\)/,
  /limit: PODCAST_CATALOG_PAGE_LIMIT/,
  /cancel: \(\) => void/,
]);
requirePatterns("app/podcasts/mature.tsx", [
  /enabled \? catalog\.shows : \[\]/,
  /useFocusEffect/,
  /catalog\.cancel\(\)/,
]);
requirePatterns("services/audiobooksApi.ts", [
  /AUDIOBOOK_CHAPTER_PAGE_SIZE = 40/,
  /chapters: normalizedChapters\.slice\(start, start \+ AUDIOBOOK_CHAPTER_PAGE_SIZE\)/,
  /\.slice\(0, 40\)/,
]);
requirePatterns("app/audiobooks/[id].tsx", [
  /MAX_RETAINED_CHAPTERS = 200/,
  /onEndReached={loadMoreChapters}/,
  /chapters: \[\.\.\.current\.chapters, \.\.\.appended\]\.slice\(0, MAX_RETAINED_CHAPTERS\)/,
]);
requirePatterns("utils/audiobookPlayback.ts", [
  /AUDIOBOOK_INITIAL_QUEUE_LIMIT = 40/,
  /\.slice\(0, AUDIOBOOK_INITIAL_QUEUE_LIMIT\)/,
]);
requirePatterns("app/audiobooks/index.tsx", [/useFocusEffect/, /browseAbortRef\.current\?\.abort/]);

console.log("Longform catalog pagination source contracts passed.");
