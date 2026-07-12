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
});

assert.equal(normalized.batchSize, 250);
assert.equal(normalized.maxPrograms, 10_000);
assert.equal(normalized.maxPages, 100);
assert.equal(normalized.maxRuntimeMinutes, 45);
assert.equal(normalized.concurrency, 5);

const minimums = normalizeLectureWorkerOptions({
  batchSize: 0,
  maxPrograms: 0,
  maxPages: 0,
  maxRuntimeMinutes: 0,
  concurrency: 0,
});

assert.equal(minimums.batchSize, 1);
assert.equal(minimums.maxPrograms, 1);
assert.equal(minimums.maxPages, 1);
assert.equal(minimums.maxRuntimeMinutes, 1);
assert.equal(minimums.concurrency, 1);

console.log("Lecture expansion foundation tests passed.");
