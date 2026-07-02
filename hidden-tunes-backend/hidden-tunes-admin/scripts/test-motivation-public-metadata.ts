import assert from "node:assert/strict";

import {
  encodeMotivationCursor,
  decodeMotivationCursor,
  toMotivationPublicItem,
} from "../lib/motivationCatalog";
import {
  isPublicMotivationRow,
  MOTIVATION_RELIABILITY_THRESHOLD,
  toMotivationPublicMetadata,
} from "../lib/motivationHealth";
import { validatePublicTvUrl } from "../lib/tvStationHealth";

function main() {
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
      playback_status: "playable",
      reliability_score: MOTIVATION_RELIABILITY_THRESHOLD,
    }),
    true
  );

  const cursor = encodeMotivationCursor({
    sort_order: 10,
    created_at: "2026-07-03T00:00:00.000Z",
    id: "abc",
  });
  const decoded = decodeMotivationCursor(cursor);
  assert.equal(decoded?.id, "abc");

  assert.equal(validatePublicTvUrl("http://127.0.0.1/video.mp4").ok, false);

  console.log(
    JSON.stringify(
      {
        ok: true,
        publicFields: Object.keys(item),
      },
      null,
      2
    )
  );
}

main();
