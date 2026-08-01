/**
 * Security contract: dormant YouTube Data API discovery must not bundle a key.
 * Run: node scripts/test-youtube-dormant-key-removal.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const config = read("constants/youtube.ts");
const backend = read("services/youtubeBackend.ts");
const tvFeed = read("app/youtube-feed.tsx");
const youtubePlayer = read("app/youtube-player.tsx");

assert.doesNotMatch(config, /AIza[0-9A-Za-z_-]{20,}/, "tracked config contains a Google key");
assert.match(config, /YOUTUBE_DATA_API_ENABLED\s*=\s*false/);
assert.match(config, /API_KEY:\s*undefined/);
assert.match(backend, /if \(!YOUTUBE_DATA_API_ENABLED\) return "";/);
assert.match(backend, /YouTube Data API discovery is disabled/);

// Working TV and known-ID playback must stay on their independent paths.
assert.match(tvFeed, /services\/tvCatalogApi/);
assert.match(tvFeed, /fetchTvHomeLanes/);
assert.doesNotMatch(tvFeed, /constants\/youtube/);
assert.match(youtubePlayer, /sanitizeYouTubeVideoId/);
assert.match(youtubePlayer, /react-native-webview/);
assert.doesNotMatch(youtubePlayer, /YOUTUBE_CONFIG|YOUTUBE_DATA_API_ENABLED/);

console.log("PASS dormant YouTube key removal", {
  dataApiEnabled: false,
  tvCatalogIndependent: true,
  knownIdWebViewIndependent: true,
});
