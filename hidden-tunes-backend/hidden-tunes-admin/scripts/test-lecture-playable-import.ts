import assert from "node:assert/strict";

import {
  LECTURE_PLAYABLE_TARGET,
  lecturePlayableImportInternals,
  normalizeLecturePlayableImportOptions,
} from "@/lib/lecturePlayableImport";

const {
  buildArchiveSearchUrl,
  inferMime,
  isEducational,
  rightsPasses,
  selectPlayableMedia,
} = lecturePlayableImportInternals;

assert.equal(LECTURE_PLAYABLE_TARGET, 200_000);

const normalized = normalizeLecturePlayableImportOptions({
  applyWrites: undefined,
  targetItems: 999_999,
  sourceLimit: 999_999,
  insertBatchSize: 999_999,
  probeConcurrency: 999_999,
  metadataConcurrency: 999_999,
  maxPages: 999_999,
  rounds: 999_999,
  requestTimeoutMs: 999_999,
  retryLimit: 999_999,
  pauseMs: 999_999,
});

assert.equal(normalized.applyWrites, false);
assert.equal(normalized.targetItems, 200_000);
assert.equal(normalized.sourceLimit, 2_000);
assert.equal(normalized.insertBatchSize, 500);
assert.equal(normalized.probeConcurrency, 20);
assert.equal(normalized.metadataConcurrency, 20);
assert.equal(normalized.maxPages, 500);
assert.equal(normalized.rounds, 100);
assert.equal(normalized.requestTimeoutMs, 60_000);
assert.equal(normalized.retryLimit, 5);
assert.equal(normalized.pauseMs, 30_000);

const minimums = normalizeLecturePlayableImportOptions({
  targetItems: 0,
  sourceLimit: 0,
  insertBatchSize: 0,
  probeConcurrency: 0,
  metadataConcurrency: 0,
  maxPages: 0,
  rounds: 0,
  requestTimeoutMs: 1,
  retryLimit: -1,
  pauseMs: -1,
});

assert.equal(minimums.targetItems, 1);
assert.equal(minimums.sourceLimit, 1);
assert.equal(minimums.insertBatchSize, 1);
assert.equal(minimums.probeConcurrency, 1);
assert.equal(minimums.metadataConcurrency, 1);
assert.equal(minimums.maxPages, 1);
assert.equal(minimums.rounds, 1);
assert.equal(minimums.requestTimeoutMs, 2_000);
assert.equal(minimums.retryLimit, 0);
assert.equal(minimums.pauseMs, 0);

const publicDomainCandidate = {
  sourceKey: "internet_archive_public_domain",
  queryFamily: "history lectures",
  subjectFamily: "history lectures",
  identifier: "history-101",
  title: "History 101 Lecture",
  creator: "Open University",
  description: "A university lecture about world history.",
  sourcePageUrl: "https://archive.org/details/history-101",
  rightsText: "Public Domain",
  licenseUrl: null,
  language: "English",
  artworkUrl: null,
  raw: {},
};

assert.equal(rightsPasses(publicDomainCandidate), true);
assert.equal(isEducational(publicDomainCandidate), true);
assert.equal(
  rightsPasses({
    ...publicDomainCandidate,
    rightsText: "",
    licenseUrl: null,
  }),
  false
);
assert.equal(
  isEducational({
    ...publicDomainCandidate,
    title: "Music video trailer",
    description: "Promo clip",
  }),
  false
);

assert.equal(inferMime("lesson.mp3", "audio"), "audio/mpeg");
assert.equal(inferMime("lecture.m4a", "audio"), "audio/x-m4a");
assert.equal(inferMime("class.mp4", "video"), "video/mp4");
assert.equal(inferMime("session.webm", "video"), "video/webm");

const media = selectPlayableMedia({
  metadata: { identifier: "history-101" },
  files: [
    { name: "history-101_meta.xml", format: "Metadata" },
    { name: "cover.jpg", format: "JPEG" },
    { name: "lecture.pdf", format: "Text PDF" },
    { name: "lecture.mp3", format: "128Kbps MP3", size: "12345", length: "123" },
    { name: "lecture.mp4", format: "MPEG4", size: "98765", length: "456" },
  ],
});

assert.ok(media);
assert.equal(media?.sourceFileId, "lecture.mp3");
assert.equal(media?.mediaType, "audio");
assert.equal(media?.directUrl, "https://archive.org/download/history-101/lecture.mp3");

const searchUrl = new URL(buildArchiveSearchUrl("science lectures", 3, 40));
assert.equal(searchUrl.origin, "https://archive.org");
assert.equal(searchUrl.pathname, "/advancedsearch.php");
assert.equal(searchUrl.searchParams.get("page"), "3");
assert.equal(searchUrl.searchParams.get("rows"), "40");
assert.equal(searchUrl.searchParams.get("output"), "json");

console.log("Lecture playable import tests passed.");
