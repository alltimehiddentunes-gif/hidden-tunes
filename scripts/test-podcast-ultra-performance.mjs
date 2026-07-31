/**
 * Podcast ultra-performance / loading lifecycle contract tests.
 * Run: node scripts/test-podcast-ultra-performance.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const show = read("app/podcasts/show/[id].tsx");
const matureHook = read("hooks/useMaturePodcastCatalog.ts");
const maturePage = read("app/podcasts/mature.tsx");
const category = read("app/podcasts/category/[id].tsx");
const api = read("services/podcastCatalogApi.ts");
const cache = read("services/podcast/podcastCache.ts");
const settings = read("utils/maturePodcastSettings.ts");

assert.match(show, /includeMature:\s*shouldIncludeMaturePodcasts\(\)/);
assert.match(show, /AbortController/);
assert.match(show, /No episodes published/);
assert.match(show, /Episodes failed to load/);
assert.match(show, /Connection unavailable|Request timed out/);
assert.match(show, /Keep cached rows visible|hasExisting/);
assert.match(show, /listData = hasEpisodes \? displayEpisodes : \[\]/);
assert.doesNotMatch(show, /data=\{!episodesLoading && hasEpisodes/);

assert.match(matureHook, /fetchMaturePodcastShows/);
assert.match(matureHook, /AbortController/);
assert.match(matureHook, /inflightPageRef/);
assert.match(maturePage, /useMaturePodcastGate|shouldIncludeMaturePodcasts|enableMaturePodcastsWithConsent/);
assert.match(maturePage, /catalog\.loadMore/);

assert.match(category, /AbortController/);
assert.match(category, /includeMature/);
assert.match(category, /maxDecodeWidth/);

assert.match(api, /podcast-shows:\$\{mature/);
assert.match(api, /PODCAST_MATURE_CATEGORY_SLUG/);
assert.match(api, /error:\s*"Aborted"/);
assert.match(api, /includeMature: options\?\.includeMature \? "true" : "false"/);

assert.match(cache, /clearPodcastCachesByPrefix/);
assert.match(settings, /podcast-shows:mature:/);

console.log("PASS podcast ultra-performance contracts", {
  episodeIncludeMature: true,
  abortNoPoison: true,
  noDoubleBlankList: true,
  maturePagination: true,
  ageGatePreserved: true,
});
