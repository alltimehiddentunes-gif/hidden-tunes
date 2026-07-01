import assert from "node:assert/strict";

import {
  buildCompositeDedupeKey,
  buildStableSourceKey,
  buildTitleDedupeKey,
  buildUrlDedupeKey,
  normalizeContentTitle,
  normalizeContentUrl,
} from "../lib/contentEngine/dedupe";
import {
  evaluateContentAutoApproval,
  isSuspiciousContentTitle,
  meetsMinimumPlayableItemRequirement,
} from "../lib/contentEngine/approval";
import { buildHealthCheckResult, mapHttpProbeToHealthStatus } from "../lib/contentEngine/health";
import {
  buildContentCursorPage,
  clampContentPageSize,
  decodeContentCursor,
  encodeContentCursor,
} from "../lib/contentEngine/pagination";
import {
  CONTENT_ENGINE_TYPES,
  CONTENT_HEALTH_STATUSES,
  CONTENT_LIFECYCLE_STATUSES,
  CONTENT_PLAYBACK_STATUSES,
  isContentEngineType,
  isContentHealthStatus,
  isContentLifecycleStatus,
  isContentPlaybackStatus,
  isPubliclyVisibleContent,
} from "../lib/contentEngine/types";
import {
  isHttpsMediaUrl,
  validateSafeHttpUrl,
  validateSafeHttpsMediaUrl,
} from "../lib/contentEngine/urlSafety";

assert.deepEqual(CONTENT_ENGINE_TYPES, [
  "podcast",
  "radio",
  "tv",
  "audiobook",
]);

assert.deepEqual(CONTENT_LIFECYCLE_STATUSES, [
  "pending",
  "approved",
  "rejected",
  "blocked",
]);

assert.deepEqual(CONTENT_HEALTH_STATUSES, [
  "unchecked",
  "active",
  "degraded",
  "failed",
  "dead",
]);

assert.deepEqual(CONTENT_PLAYBACK_STATUSES, [
  "unchecked",
  "playable",
  "failed",
  "blocked",
]);

assert.equal(isContentEngineType("podcast"), true);
assert.equal(isContentEngineType("music"), false);
assert.equal(isContentLifecycleStatus("approved"), true);
assert.equal(isContentHealthStatus("degraded"), true);
assert.equal(isContentPlaybackStatus("playable"), true);

assert.equal(
  validateSafeHttpUrl("https://feeds.example.com/podcast.rss"),
  "https://feeds.example.com/podcast.rss"
);
assert.equal(validateSafeHttpUrl("file:///tmp/feed.xml"), null);
assert.equal(validateSafeHttpUrl("http://localhost/feed.xml"), null);
assert.equal(validateSafeHttpUrl("http://127.0.0.1/feed.xml"), null);
assert.equal(validateSafeHttpUrl("http://192.168.1.10/stream"), null);
assert.equal(validateSafeHttpUrl("http://user:pass@example.com/feed"), null);

assert.equal(
  validateSafeHttpsMediaUrl("https://cdn.example.com/ep1.mp3"),
  "https://cdn.example.com/ep1.mp3"
);
assert.equal(
  validateSafeHttpsMediaUrl("http://cdn.example.com/ep1.mp3"),
  null
);
assert.equal(isHttpsMediaUrl("https://cdn.example.com/ep1.mp3"), true);

assert.equal(
  normalizeContentUrl("https://example.com/path/?utm_source=x&keep=1"),
  "https://example.com/path?keep=1"
);
assert.equal(normalizeContentTitle("  Hidden   Tunes  "), "Hidden Tunes");

const sourceKeyA = buildStableSourceKey("podcast", {
  feed_url: "https://example.com/rss/",
  title: "Show",
});
const sourceKeyB = buildStableSourceKey("podcast", {
  title: "Show",
  feed_url: "https://example.com/rss",
});
assert.equal(sourceKeyA, sourceKeyB);

assert.equal(
  buildUrlDedupeKey("https://example.com/rss/?utm_source=abc"),
  "url:https://example.com/rss"
);
assert.equal(buildTitleDedupeKey("Hidden Tunes"), "title:hidden tunes");
assert.match(
  buildCompositeDedupeKey("radio", { station_uuid: "abc-123" }),
  /^radio:[a-f0-9]{64}$/
);

assert.equal(isSuspiciousContentTitle("Untitled"), true);
assert.equal(isSuspiciousContentTitle("Hidden Tunes Daily"), false);

const approval = evaluateContentAutoApproval({
  metadata: {
    title: "Hidden Tunes Daily",
    description: "A real podcast about music discovery.",
    author: "Hidden Tunes",
  },
  sourceUrl: "https://feeds.example.com/podcast.rss",
  playableItems: [{ title: "Episode 1", mediaUrl: "https://cdn.example.com/ep1.mp3" }],
});
assert.equal(approval.eligible, true);
assert.equal(approval.playableItemCount, 1);
assert.equal(
  meetsMinimumPlayableItemRequirement([
    { title: "Episode 1", mediaUrl: "https://cdn.example.com/ep1.mp3" },
  ]),
  true
);

const health = buildHealthCheckResult({
  statusCode: 200,
  contentType: "audio/mpeg",
  responseTimeMs: 120,
});
assert.equal(health.healthStatus, "active");
assert.equal(health.statusCode, 200);
assert.equal(mapHttpProbeToHealthStatus({ statusCode: 404 }), "dead");
assert.equal(mapHttpProbeToHealthStatus({ statusCode: 503 }), "failed");

const cursor = encodeContentCursor({
  v: 1,
  scope: "podcast_shows",
  sortValue: "2026-06-27T12:00:00.000Z",
  id: "show-123",
});
const decoded = decodeContentCursor(cursor, "podcast_shows");
assert.ok(decoded);
assert.equal(decoded?.id, "show-123");

const page = buildContentCursorPage({
  scope: "podcast_shows",
  limit: 2,
  items: [
    { id: "1", createdAt: "2026-06-27T10:00:00.000Z" },
    { id: "2", createdAt: "2026-06-27T11:00:00.000Z" },
    { id: "3", createdAt: "2026-06-27T12:00:00.000Z" },
  ],
  getSortValue: (item) => item.createdAt,
  getId: (item) => item.id,
});
assert.equal(page.items.length, 2);
assert.equal(page.hasMore, true);
assert.ok(page.nextCursor);

assert.equal(clampContentPageSize(999), 30);
assert.equal(clampContentPageSize(10), 10);

assert.equal(
  isPubliclyVisibleContent({
    lifecycleStatus: "approved",
    isActive: true,
    healthStatus: "active",
    playbackStatus: "playable",
  }),
  true
);
assert.equal(
  isPubliclyVisibleContent({
    lifecycleStatus: "pending",
    isActive: false,
    healthStatus: "unchecked",
    playbackStatus: "unchecked",
  }),
  false
);

console.log("content engine foundation tests passed");
