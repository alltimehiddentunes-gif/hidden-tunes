import assert from "node:assert/strict";

import { classifyVerificationFailure } from "../lib/tvExpansion25k/fast/verificationDiagnostics";
import {
  filterCandidatesPreVerification,
  preVerificationRejectReason,
} from "../lib/tvExpansion25k/fast/preVerificationFilter";

function testFailureClassification() {
  assert.equal(classifyVerificationFailure("http_404").reason, "http_404");
  assert.equal(classifyVerificationFailure("http_429").class, "retryable");
  assert.equal(classifyVerificationFailure("too_many_redirects").reason, "too_many_redirects");
  assert.equal(classifyVerificationFailure("unsupported_payload").reason, "html_instead_of_media");
  assert.equal(classifyVerificationFailure("fetch failed").reason, "connection_reset");
  assert.equal(classifyVerificationFailure("fetch failed").class, "retryable");
}

function testPreVerificationRejectsPlaceholder() {
  const reason = preVerificationRejectReason({
    source_type: "tv",
    source_id: "x",
    source_url: "https://example.com/live.m3u8",
    title: "Example",
  });
  assert.equal(reason, "placeholder_domain");
}

function testPreVerificationAllowsHls() {
  const reason = preVerificationRejectReason({
    source_type: "tv",
    source_id: "x",
    source_url: "https://news.broadcaster.org/hls/main.m3u8",
    title: "News",
  });
  assert.equal(reason, null);
}

function testPreVerificationFilterBatch() {
  const result = filterCandidatesPreVerification([
    {
      source_type: "tv",
      source_id: "1",
      source_url: "https://example.com/a.m3u8",
      title: "Bad",
    },
    {
      source_type: "tv",
      source_id: "2",
      source_url: "https://news.broadcaster.org/hls/main.m3u8",
      title: "Good",
    },
  ]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected, 1);
}

function testPreVerificationRejectsPagePlatform() {
  assert.equal(
    preVerificationRejectReason({
      source_type: "hls_stream",
      source_id: "yt",
      source_url: "https://www.youtube.com/watch?v=abc123",
      title: "YouTube page",
    }),
    "page_platform_url"
  );
  assert.equal(
    preVerificationRejectReason({
      source_type: "youtube_video",
      source_id: "abc123",
      source_url: "https://www.youtube.com/watch?v=abc123",
      title: "YouTube official",
    }),
    null
  );
}

testFailureClassification();
testPreVerificationRejectsPlaceholder();
testPreVerificationAllowsHls();
testPreVerificationFilterBatch();
testPreVerificationRejectsPagePlatform();

console.log(JSON.stringify({ ok: true, tests: 5 }, null, 2));
