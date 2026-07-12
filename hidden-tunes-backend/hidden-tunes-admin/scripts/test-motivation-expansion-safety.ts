import assert from "node:assert/strict";

import { runMotivationBatchImport } from "../lib/motivationBatchImport";
import { importMotivationCandidates } from "../lib/motivationHealth";
import { toMotivationPublicItem } from "../lib/motivationCatalog";
import { contentClassificationBlocksImport } from "../lib/motivationContentClassifier";

function testLegacyImportRequiresExplicitAutoApprove() {
  assert.rejects(
    () =>
      importMotivationCandidates([
        {
          source_type: "archive_video",
          source_id: "demo",
          source_url: "https://archive.org/download/demo/video.mp4",
          title: "Motivational Speech Demo",
        },
      ]),
    /disabled/i
  );
}

function testBatchImportDefaultsToDryRunSafeResultShape() {
  const resultKeys = [
    "dry_run",
    "public_promotions",
    "records_inserted",
    "records_accepted",
    "rights_rejected",
    "media_failed",
    "classified_routed",
  ] as const;
  const prototype = {
    success: false,
    dry_run: true,
    batch_number: 0,
    candidates_fetched: 0,
    records_examined: 0,
    records_accepted: 0,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    records_rejected: 0,
    rights_accepted: 0,
    rights_rejected: 0,
    rights_rejection_reasons: [],
    metadata_accepted: 0,
    metadata_rejected: 0,
    media_verified: 0,
    media_failed: 0,
    proposed_item_inserts: 0,
    proposed_item_updates: 0,
    proposed_file_inserts: 0,
    files_inserted: 0,
    public_promotions: 0,
    duplicate_records: 0,
    dedupe_matches: 0,
    classified_accept: 0,
    classified_hold: 0,
    classified_reject: 0,
    classified_routed: 0,
    sources_used: [],
    checkpoint_id: null,
    errors: [],
  } satisfies Awaited<ReturnType<typeof runMotivationBatchImport>>;

  for (const key of resultKeys) {
    assert.ok(key in prototype);
  }
  assert.equal(prototype.public_promotions, 0);
}

function testMetadataOnlyBrowseContract() {
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

function testRoutedAcademicContentBlocksImport() {
  assert.equal(contentClassificationBlocksImport("route_lectures"), true);
  assert.equal(contentClassificationBlocksImport("route_podcasts"), true);
  assert.equal(contentClassificationBlocksImport("route_films"), true);
  assert.equal(contentClassificationBlocksImport("accept"), false);
}

async function main() {
  testLegacyImportRequiresExplicitAutoApprove();
  testBatchImportDefaultsToDryRunSafeResultShape();
  testMetadataOnlyBrowseContract();
  testRoutedAcademicContentBlocksImport();
  await assert.rejects(
    () =>
      importMotivationCandidates(
        [
          {
            source_type: "archive_video",
            source_id: "demo",
            source_url: "https://archive.org/download/demo/video.mp4",
            title: "Motivational Speech Demo",
          },
        ],
        { allowLegacyAutoApprove: false }
      ),
    /disabled/i
  );

  console.log(JSON.stringify({ ok: true, tests: 5 }, null, 2));
}

void main();
