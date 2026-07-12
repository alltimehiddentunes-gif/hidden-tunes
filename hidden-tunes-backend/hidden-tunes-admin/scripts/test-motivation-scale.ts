import assert from "node:assert/strict";

import {
  candidateDedupeKeys,
  createEmptyMotivationDedupeKeySet,
  dedupeMotivationCandidatesBounded,
  isMotivationCandidateDuplicate,
  registerMotivationCandidateKeys,
} from "../lib/motivationBoundedDedupe";
import type { MotivationGrowthCandidate } from "../lib/motivationHealth";

function sampleCandidate(overrides: Partial<MotivationGrowthCandidate> = {}): MotivationGrowthCandidate {
  return {
    source_type: "archive_video",
    source_id: "demo-item",
    source_url: "https://archive.org/download/demo-item/video.mp4",
    title: "Motivational Speech Demo",
    source_key: "archive:demo-item",
    ...overrides,
  };
}

function testExactSourceDuplicateBlocked() {
  const existing = createEmptyMotivationDedupeKeySet();
  registerMotivationCandidateKeys(sampleCandidate(), existing);
  assert.equal(isMotivationCandidateDuplicate(sampleCandidate(), existing), true);
}

function testBoundedDedupeAcceptsUniqueCandidates() {
  const existing = createEmptyMotivationDedupeKeySet();
  const accepted = dedupeMotivationCandidatesBounded(
    [
      sampleCandidate(),
      sampleCandidate({
        source_id: "other",
        source_key: "archive:other",
        source_url: "https://archive.org/download/other/video.mp4",
        title: "Other Talk",
      }),
    ],
    existing
  );
  assert.equal(accepted.length, 2);
}

function testTitleSpeakerKeyDistinct() {
  const a = candidateDedupeKeys(sampleCandidate({ speaker_name: "Speaker A" }));
  const b = candidateDedupeKeys(sampleCandidate({ speaker_name: "Speaker B" }));
  assert.notEqual(a.titleSpeakerKey, b.titleSpeakerKey);
}

function main() {
  testExactSourceDuplicateBlocked();
  testBoundedDedupeAcceptsUniqueCandidates();
  testTitleSpeakerKeyDistinct();
  console.log(JSON.stringify({ ok: true, tests: 3 }, null, 2));
}

main();
