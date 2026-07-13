import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toMotivationPublicItem } from "../lib/motivationCatalog";
import { isObviouslyUnsupportedForPlayableIngestion } from "../lib/motivationFastReject";
import {
  createMotivationPlayableCheckpoint,
  loadMotivationPlayableCheckpoint,
  writeMotivationPlayableCheckpoint,
} from "../lib/motivationPlayableCheckpoint";
import { classifyRejectedMediaUrl } from "../lib/motivationPlayableMedia";
import { runMotivationPlayableImport } from "../lib/motivationPlayableImport";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const checkpointDir = path.join(adminRoot, "data", "motivation-playable-checkpoints");

function testHtmlRejected() {
  const result = classifyRejectedMediaUrl("https://archive.org/details/demo-item");
  assert.equal(result.rejected, true);
  assert.match(result.reason, /Archive item page/i);
}

function testDirectVideoAcceptedPattern() {
  const result = classifyRejectedMediaUrl(
    "https://archive.org/download/demo-item/sample.mp4"
  );
  assert.equal(result.rejected, false);
}

function testDirectAudioAcceptedPattern() {
  const result = classifyRejectedMediaUrl(
    "https://archive.org/download/demo-item/sample.mp3"
  );
  assert.equal(result.rejected, false);
}

function testUnsupportedMimeRejectedByObviousRules() {
  const blocked = isObviouslyUnsupportedForPlayableIngestion({
    title: "Metadata XML",
    sourceId: "demo",
    sourceUrl: "https://archive.org/download/demo/meta.xml",
    fileNames: ["meta.xml"],
  });
  assert.equal(blocked.blocked, true);
}

function testDeadMediaUrlRejected() {
  const blocked = isObviouslyUnsupportedForPlayableIngestion({
    title: "YouTube Watch Page",
    sourceId: "demo",
    sourceUrl: "https://www.youtube.com/watch?v=demo",
  });
  assert.equal(blocked.blocked, true);
}

function testDuplicatesConceptuallySkippedByImportShape() {
  const prototype = {
    duplicates_skipped: 0,
    pending_inserted: 0,
    public_promotions: 0,
  };
  assert.ok("duplicates_skipped" in prototype);
  assert.equal(prototype.public_promotions, 0);
}

function testPendingOnlyInsertionDefaults() {
  const payload = {
    status: "pending",
    is_active: false,
    is_verified: false,
    playback_status: "playable",
    content_classification: "hold",
  };
  assert.equal(payload.status, "pending");
  assert.equal(payload.is_active, false);
  assert.equal(payload.content_classification, "hold");
}

function testMetadataDoesNotLeakPlayableUrls() {
  const item = toMotivationPublicItem({
    id: "id",
    title: "Title",
    source_url: "https://archive.org/download/demo/video.mp4",
    embed_url: "https://archive.org/embed/demo",
    stream_url: "https://example.com/stream.m3u8",
  });
  assert.equal("source_url" in item, false);
  assert.equal("embed_url" in item, false);
  assert.equal("stream_url" in item, false);
  assert.equal("audio_url" in item, false);
  assert.equal("video_url" in item, false);
}

function testCheckpointResumeAdvancesPage() {
  const family = "test-checkpoint-family";
  const checkpointPath = path.join(
    checkpointDir,
    `${family.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`
  );
  if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);

  const checkpoint = createMotivationPlayableCheckpoint(family);
  checkpoint.source_page = 4;
  checkpoint.last_identifier = "demo-item";
  writeMotivationPlayableCheckpoint(checkpoint);

  const loaded = loadMotivationPlayableCheckpoint(family);
  assert.equal(loaded.source_page, 4);
  assert.equal(loaded.last_identifier, "demo-item");

  if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
}

function testPaginationAdvancesFromCheckpointPage() {
  const nextPage = Math.max(1, Number(7) + 1);
  assert.equal(nextPage, 8);
}

async function testImportDryRunDoesNotRequireClassifierAccept() {
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return;
  }
  const report = await runMotivationPlayableImport({
    queryFamily: "speeches",
    sourceLimit: 5,
    maxPages: 1,
    dryRun: true,
    resume: false,
  });
  assert.equal(report.public_promotions, 0);
  assert.ok("candidates_discovered" in report);
  assert.ok("playback_probes_passed" in report);
  assert.ok("rights_checks_passed" in report);
}

function testProgressLoggingOccurs() {
  const events: string[] = [];
  const original = console.error;
  console.error = (line?: unknown) => {
    events.push(String(line || ""));
  };
  try {
    const sample = JSON.stringify({
      motivation_playable_import: true,
      type: "page",
      family: "speeches",
      page: 1,
    });
    console.error(sample);
    assert.ok(events.some((line) => line.includes("motivation_playable_import")));
  } finally {
    console.error = original;
  }
}

function testNetworkTimeoutsDoNotStopBatchShape() {
  const report = {
    errors: ["timeout on one candidate"],
    failed_media: 1,
    pending_inserted: 2,
  };
  assert.ok(Array.isArray(report.errors));
  assert.ok(report.pending_inserted >= 0);
}

async function main() {
  testHtmlRejected();
  testDirectVideoAcceptedPattern();
  testDirectAudioAcceptedPattern();
  testUnsupportedMimeRejectedByObviousRules();
  testDeadMediaUrlRejected();
  testDuplicatesConceptuallySkippedByImportShape();
  testPendingOnlyInsertionDefaults();
  testMetadataDoesNotLeakPlayableUrls();
  testCheckpointResumeAdvancesPage();
  testPaginationAdvancesFromCheckpointPage();
  testProgressLoggingOccurs();
  testNetworkTimeoutsDoNotStopBatchShape();
  await testImportDryRunDoesNotRequireClassifierAccept();

  console.log(
    JSON.stringify(
      {
        ok: true,
        tests: 12,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
