import assert from "node:assert/strict";

import {
  LECTURE_EXPANSION_MAX_PAGE_SIZE,
  LECTURE_EXPANSION_TARGET,
  normalizeLectureWorkerOptions,
} from "@/lib/lectureExpansion";
import { LECTURE_MAX_PAGE_SIZE } from "@/lib/lectureCatalog";

assert.equal(LECTURE_EXPANSION_TARGET, 200_000);
assert.equal(LECTURE_EXPANSION_MAX_PAGE_SIZE, 40);
assert.equal(LECTURE_MAX_PAGE_SIZE, 40);

const normalized = normalizeLectureWorkerOptions({
  batchSize: 1000,
  maxPrograms: 500_000,
  maxPages: 999,
  maxRuntimeMinutes: 999,
  concurrency: 999,
  requestTimeoutMs: 999_999,
  leaseSeconds: 999_999,
});

assert.equal(normalized.batchSize, 100);
assert.equal(normalized.maxPrograms, 500);
assert.equal(normalized.maxPages, 10);
assert.equal(normalized.maxRuntimeMinutes, 45);
assert.equal(normalized.sourceConcurrency, 3);
assert.equal(normalized.programConcurrency, 6);
assert.equal(normalized.mediaConcurrency, 6);
assert.equal(normalized.requestTimeoutMs, 30_000);
assert.equal(normalized.leaseSeconds, 900);

const minimums = normalizeLectureWorkerOptions({
  batchSize: 0,
  maxPrograms: 0,
  maxPages: 0,
  maxRuntimeMinutes: 0,
  concurrency: 0,
  requestTimeoutMs: 1,
  leaseSeconds: 1,
});

assert.equal(minimums.batchSize, 1);
assert.equal(minimums.maxPrograms, 1);
assert.equal(minimums.maxPages, 1);
assert.equal(minimums.maxRuntimeMinutes, 1);
assert.equal(minimums.sourceConcurrency, 1);
assert.equal(minimums.programConcurrency, 1);
assert.equal(minimums.mediaConcurrency, 1);
assert.equal(minimums.requestTimeoutMs, 2_000);
assert.equal(minimums.leaseSeconds, 30);

console.log("Lecture expansion foundation tests passed.");
