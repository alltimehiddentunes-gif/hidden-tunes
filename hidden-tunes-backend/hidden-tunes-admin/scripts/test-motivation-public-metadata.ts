import assert from "node:assert/strict";

import {
  encodeMotivationCursor,
  decodeMotivationCursor,
  isValidMotivationUuid,
  toMotivationPublicItem,
} from "../lib/motivationCatalog";
import {
  applyMotivationHealthProbe,
  isPublicMotivationRow,
  MOTIVATION_RELIABILITY_THRESHOLD,
  toMotivationPublicMetadata,
} from "../lib/motivationHealth";
import { validatePublicTvUrl } from "../lib/tvStationHealth";

function main() {
  assert.equal(isValidMotivationUuid(""), false);
  assert.equal(isValidMotivationUuid("not-a-uuid"), false);
  assert.equal(isValidMotivationUuid("00000000-0000-4000-8000-000000000000"), true);
  assert.equal(
    isValidMotivationUuid("550e8400-e29b-41d4-a716-446655440000"),
    true
  );
  assert.equal(
    isValidMotivationUuid("550e8400-e29b-41d4-a716"),
    false
  );

  const row = {
    id: "motivation-uuid",
    title: "Stay Focused",
    description: "Verified motivation stream",
    thumbnail_url: "https://cdn.example.com/art.jpg",
    channel_name: "Hidden Tunes Motivation",
    category: "Motivation",
    subcategory: "Focus",
    tags: ["Motivation", "Focus"],
    language: "English",
    region: "US",
    duration_seconds: 1800,
    reliability_score: 92,
    is_featured: true,
    source_url: "https://archive.org/download/demo/video.mp4",
    embed_url: "https://archive.org/embed/demo",
    source_type: "archive_video",
    source_id: "demo",
  };

  const item = toMotivationPublicItem(row);
  assert.equal(item.id, "motivation-uuid");
  assert.equal(item.title, "Stay Focused");
  assert.equal(item.artwork, "https://cdn.example.com/art.jpg");
  assert.equal(item.subcategory, "Focus");
  assert.equal("stream_url" in item, false);
  assert.equal("source_url" in item, false);
  assert.equal("embed_url" in item, false);

  const metadata = toMotivationPublicMetadata(row);
  assert.equal("stream_url" in metadata, false);

  assert.equal(
    isPublicMotivationRow({
      status: "approved",
      is_active: true,
      is_verified: true,
      playback_status: "playable",
      reliability_score: MOTIVATION_RELIABILITY_THRESHOLD,
    }),
    true
  );
  assert.equal(
    isPublicMotivationRow({
      status: "approved",
      is_active: true,
      is_verified: false,
      playback_status: "playable",
      reliability_score: MOTIVATION_RELIABILITY_THRESHOLD,
    }),
    false
  );

  const cursor = encodeMotivationCursor({
    sort_order: 10,
    created_at: "2026-07-03T00:00:00.000Z",
    id: "abc",
  });
  const decoded = decodeMotivationCursor(cursor);
  assert.equal(decoded?.id, "abc");

  assert.equal(validatePublicTvUrl("http://127.0.0.1/video.mp4").ok, false);

  const pendingProbe = applyMotivationHealthProbe(
    { status: "pending", reliability_score: 40, consecutive_failures: 0 },
    { playable: true, playback_status: "playable", reason: "ok" }
  );
  assert.equal(pendingProbe.status, "pending");
  assert.equal(pendingProbe.is_active, false);
  assert.equal(pendingProbe.playback_status, "unchecked");

  const approvedProbe = applyMotivationHealthProbe(
    { status: "approved", reliability_score: 80, consecutive_failures: 0 },
    { playable: true, playback_status: "playable", reason: "ok" }
  );
  assert.equal(approvedProbe.status, "approved");
  assert.equal(approvedProbe.is_active, true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        publicFields: Object.keys(item),
        uuidChecks: "pass",
      },
      null,
      2
    )
  );
}

main();
