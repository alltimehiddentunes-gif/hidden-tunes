/**
 * Content-domain performance protections (static + counter contracts).
 * Run: node scripts/test-content-performance-guards.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const diagnostics = fs.readFileSync(
  path.join(root, "utils/contentPerformanceDiagnostics.ts"),
  "utf8"
);
assert.match(diagnostics, /\[HTContentPerformance\]/);
assert.match(diagnostics, /isContentPerfDiagnosticsEnabled/);
assert.match(diagnostics, /THROTTLE_MS/);
assert.match(diagnostics, /RENDER_THROTTLE_MS/);

const devDiagnostics = fs.readFileSync(path.join(root, "utils/devDiagnostics.ts"), "utf8");
assert.match(devDiagnostics, /ENABLE_CONTENT_PERF_DIAGNOSTICS = false/);

const motivationLayout = fs.readFileSync(
  path.join(root, "app/motivation/_layout.tsx"),
  "utf8"
);
assert.match(motivationLayout, /MotivationPlaybackBinding/);
assert.match(motivationLayout, /MotivationProgressPersistence/);

const lecturesLayout = fs.readFileSync(path.join(root, "app/lectures/_layout.tsx"), "utf8");
assert.match(lecturesLayout, /EducationalPlaybackBinding/);
assert.match(lecturesLayout, /EducationalProgressPersistence/);

const audiobookDetail = fs.readFileSync(path.join(root, "app/audiobooks/[id].tsx"), "utf8");
assert.match(audiobookDetail, /AudiobookProgressPersistence/);
assert.doesNotMatch(
  audiobookDetail,
  /useAudiobookProgressTracker\(/,
  "detail screen must not own progress subscription directly"
);

const audiobookIndex = fs.readFileSync(path.join(root, "app/audiobooks/index.tsx"), "utf8");
assert.match(
  audiobookIndex,
  /Reuse warm in-memory page cache/,
  "warm cache must skip forced revalidation"
);
assert.doesNotMatch(audiobookIndex, /bypassCache:\s*Boolean\(cached/);

const podcastShow = fs.readFileSync(path.join(root, "app/podcasts/show/[id].tsx"), "utf8");
assert.match(podcastShow, /FlatList/);
assert.doesNotMatch(podcastShow, /ScrollView/);
assert.match(podcastShow, /windowSize=\{7\}/);

console.log("PASS content performance guards", {
  diagnosticsNamespace: "HTContentPerformance",
  progressIsolated: true,
  audiobookCacheReuse: true,
  podcastShowVirtualized: true,
});
