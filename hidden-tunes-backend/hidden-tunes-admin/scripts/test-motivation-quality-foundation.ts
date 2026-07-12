import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  duplicateClassificationBlocksPromotion,
  normalizeCanonicalSourceUrl,
  normalizeExternalSourceId,
  normalizeMotivationTitle,
} from "../lib/motivationDuplicates";
import {
  createMotivationExpansionCheckpoint,
  loadMotivationExpansionCheckpoint,
  markMotivationCheckpointItemCompleted,
  markMotivationCheckpointItemFailed,
  validateMotivationExpansionCheckpoint,
  writeMotivationExpansionCheckpoint,
} from "../lib/motivationExpansionCheckpoint";
import { computeMotivationHealthScore } from "../lib/motivationHealthScore";
import { applyMotivationHealthProbe } from "../lib/motivationHealth";
import { toMotivationPublicItem } from "../lib/motivationCatalog";
import {
  validateMotivationSourceForItem,
  type MotivationRegistrySource,
} from "../lib/motivationSourceRegistry";

function testExactDuplicateBySourceId() {
  const left = normalizeExternalSourceId("archive_video", "demo-item");
  const right = normalizeExternalSourceId("archive_video", "demo-item");
  assert.equal(left, right);
  assert.equal(duplicateClassificationBlocksPromotion("exact"), true);
}

function testExactDuplicateByCanonicalUrl() {
  const a = normalizeCanonicalSourceUrl("https://archive.org/details/demo/");
  const b = normalizeCanonicalSourceUrl("https://archive.org/details/demo");
  assert.equal(a, b);
}

function testStrongDuplicateSignals() {
  const score = computeMotivationHealthScore({
    media_probe_pass: true,
    rights_pass: true,
    metadata_complete: true,
    primary_file_pass: true,
    duplicate_classification: "strong",
    category_valid: true,
    maturity_valid: true,
    registry_valid: true,
  });
  assert.equal(score.status, "unhealthy");
  assert.equal(duplicateClassificationBlocksPromotion("strong"), true);
}

function testPossibleDuplicateDoesNotAutoBlock() {
  assert.equal(duplicateClassificationBlocksPromotion("possible"), false);
  const score = computeMotivationHealthScore({
    media_probe_pass: true,
    rights_pass: true,
    metadata_complete: true,
    primary_file_pass: true,
    duplicate_classification: "possible",
    category_valid: true,
    maturity_valid: true,
    registry_valid: true,
  });
  assert.equal(score.status, "warning");
}

function testUnknownSourceBlocksPromotion() {
  const result = validateMotivationSourceForItem(null, {
    source_type: "archive_video",
    source_url: "https://archive.org/details/demo",
  });
  assert.equal(result.ok, false);
}

function testDisabledSourceBlocksPromotion() {
  const source: MotivationRegistrySource = {
    source_key: "archive:test",
    source_name: "Test",
    source_type: "archive_video",
    source_url: "https://archive.org/details/prelinger",
    rights_type: "public_domain",
    license_url: "https://creativecommons.org/publicdomain/mark/1.0/",
    redistribution_allowed: true,
    embedding_allowed: true,
    commercial_use_allowed: true,
    reviewed: true,
    enabled: false,
  };
  const result = validateMotivationSourceForItem(source, {
    source_type: "archive_video",
    source_url: "https://archive.org/details/demo",
  });
  assert.equal(result.ok, false);
}

function testMissingRightsEvidenceBlocksPromotionScore() {
  const score = computeMotivationHealthScore({
    media_probe_pass: true,
    rights_pass: false,
    metadata_complete: true,
    primary_file_pass: true,
    duplicate_classification: "none",
    category_valid: true,
    maturity_valid: true,
    registry_valid: true,
  });
  assert.equal(score.status, "unhealthy");
}

function testPendingPlayableRemainsPending() {
  const update = applyMotivationHealthProbe(
    { status: "pending", reliability_score: 40, consecutive_failures: 0 },
    { playable: true, playback_status: "playable", reason: "ok" }
  );
  assert.equal(update.status, "pending");
  assert.equal(update.is_active, false);
}

function testHealthScoreDoesNotPromote() {
  const score = computeMotivationHealthScore({
    media_probe_pass: true,
    rights_pass: true,
    metadata_complete: true,
    primary_file_pass: true,
    duplicate_classification: "none",
    category_valid: true,
    maturity_valid: true,
    registry_valid: true,
  });
  assert.ok(score.score >= 80);
  const pending = applyMotivationHealthProbe(
    { status: "pending", reliability_score: score.score, consecutive_failures: 0 },
    { playable: true, playback_status: "playable", reason: "ok" }
  );
  assert.equal(pending.status, "pending");
}

function testMalformedCheckpointDetected() {
  const validation = validateMotivationExpansionCheckpoint(
    createMotivationExpansionCheckpoint({ batch_number: 0, source_key: "" })
  );
  assert.equal(validation.ok, false);
}

function testCheckpointRecoveryUsesBackup() {
  const originalCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "motivation-checkpoint-"));
  process.chdir(tempRoot);
  try {
    const checkpoint = createMotivationExpansionCheckpoint({
      batch_number: 99,
      source_key: "archive:test",
    });
    checkpoint.completed_item_keys = ["archive_video:done"];
    writeMotivationExpansionCheckpoint(checkpoint);

    const loaded = loadMotivationExpansionCheckpoint(99, "archive:test");
    assert.ok(loaded?.checkpoint.completed_item_keys.includes("archive_video:done"));

    markMotivationCheckpointItemFailed(loaded!.checkpoint, "archive_video:retry");
    writeMotivationExpansionCheckpoint(loaded!.checkpoint);
    const recovered = loadMotivationExpansionCheckpoint(99, "archive:test");
    assert.ok(recovered?.checkpoint.failed_item_keys.includes("archive_video:retry"));
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testCompletedCheckpointItemsAreSkippedByHelper() {
  const checkpoint = createMotivationExpansionCheckpoint({
    batch_number: 1,
    source_key: "archive:test",
  });
  markMotivationCheckpointItemCompleted(checkpoint, "archive_video:done");
  assert.equal(checkpoint.completed_item_keys.includes("archive_video:done"), true);
}

function testFailedItemsRemainRetryable() {
  const checkpoint = createMotivationExpansionCheckpoint({
    batch_number: 1,
    source_key: "archive:test",
  });
  markMotivationCheckpointItemFailed(checkpoint, "archive_video:retry");
  assert.equal(checkpoint.completed_item_keys.includes("archive_video:retry"), false);
  assert.equal(checkpoint.failed_item_keys.includes("archive_video:retry"), true);
}

function testApprovedUnhealthyMediaDemotes() {
  const update = applyMotivationHealthProbe(
    { status: "approved", reliability_score: 20, consecutive_failures: 2 },
    { playable: false, playback_status: "failed", reason: "failed" }
  );
  assert.equal(update.is_active, false);
}

function testMetadataOnlyBrowseContract() {
  const item = toMotivationPublicItem({
    id: "id",
    title: "Title",
    source_url: "https://archive.org/download/demo/video.mp4",
    embed_url: "https://archive.org/embed/demo",
  });
  assert.equal("source_url" in item, false);
  assert.equal("embed_url" in item, false);
  assert.equal("stream_url" in item, false);
}

function main() {
  testExactDuplicateBySourceId();
  testExactDuplicateByCanonicalUrl();
  testStrongDuplicateSignals();
  testPossibleDuplicateDoesNotAutoBlock();
  testUnknownSourceBlocksPromotion();
  testDisabledSourceBlocksPromotion();
  testMissingRightsEvidenceBlocksPromotionScore();
  testPendingPlayableRemainsPending();
  testHealthScoreDoesNotPromote();
  testMalformedCheckpointDetected();
  testCheckpointRecoveryUsesBackup();
  testCompletedCheckpointItemsAreSkippedByHelper();
  testFailedItemsRemainRetryable();
  testApprovedUnhealthyMediaDemotes();
  testMetadataOnlyBrowseContract();

  console.log(JSON.stringify({ ok: true, tests: 15 }, null, 2));
}

main();
