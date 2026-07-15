import assert from "node:assert/strict";

import { classifyVerificationFailure } from "../lib/tvExpansion25k/fast/verificationDiagnostics";
import { clearSourceYields, getSourceYield, recordSourceYield } from "../lib/tvExpansion25k/fast/sourceYieldMemory";
import { scoreSource } from "../lib/tvExpansion25k/fast/sourceScoring";
import type { TvExpansionSourceAdapter } from "../lib/tvExpansion25k/sources/types";
import { createInitialSourceCursor } from "../lib/tvExpansion25k/sources/types";

function testLegacyAndFastShareProbePath() {
  assert.equal(classifyVerificationFailure("http_404").class, "terminal");
  assert.equal(classifyVerificationFailure("http_429").class, "retryable");
  assert.equal(classifyVerificationFailure("probe_passed").class, "verifier_suspect");
}

function testZeroYieldCommunityDeprioritized() {
  clearSourceYields();
  recordSourceYield({
    sourceId: "free-community-playlists-wave4",
    raw: 250,
    unique: 131,
    prefilterRejected: 0,
    verificationAttempted: 131,
    verificationPassed: 0,
    verificationFailed: 131,
    passRate: 0,
    terminalFailureRate: 0.98,
    at: new Date().toISOString(),
  });

  const adapter = { id: "free-community-playlists-wave4" } as TvExpansionSourceAdapter;
  const official = { id: "country-official-manifests-wave4" } as TvExpansionSourceAdapter;
  recordSourceYield({
    sourceId: "country-official-manifests-wave4",
    raw: 40,
    unique: 38,
    prefilterRejected: 1,
    verificationAttempted: 37,
    verificationPassed: 12,
    verificationFailed: 25,
    passRate: 12 / 37,
    terminalFailureRate: 0.4,
    at: new Date().toISOString(),
  });

  const communityScore = scoreSource({
    adapter,
    cursor: createInitialSourceCursor(adapter.id),
    baseWeight: 8,
  }).score;
  const officialScore = scoreSource({
    adapter: official,
    cursor: createInitialSourceCursor(official.id),
    baseWeight: 8,
  }).score;

  assert.ok(officialScore > communityScore);
  assert.ok(getSourceYield("free-community-playlists-wave4")?.passRate === 0);
}

testLegacyAndFastShareProbePath();
testZeroYieldCommunityDeprioritized();

console.log(JSON.stringify({ ok: true, tests: 2 }, null, 2));
