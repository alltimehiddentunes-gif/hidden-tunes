import assert from "node:assert/strict";

import {
  MOTIVATION_MAX_PAGE_SIZE,
  toMotivationPublicItem,
} from "../lib/motivationCatalog";
import {
  MOTIVATION_PROGRAM_ORDER,
  toMotivationProgramPublic,
  toMotivationSessionPublic,
} from "../lib/motivationPrograms";

function main() {
  assert.equal(MOTIVATION_MAX_PAGE_SIZE, 40);
  assert.match(MOTIVATION_PROGRAM_ORDER, /season_number/);
  assert.match(MOTIVATION_PROGRAM_ORDER, /episode_number/);

  const browseRow = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Morning Focus",
    description: "Start strong",
    thumbnail_url: "https://cdn.example.com/art.jpg",
    channel_name: "Hidden Tunes",
    speaker_name: "Coach A",
    category_slug: "focus",
    tags: ["focus"],
    language: "English",
    region: "US",
    duration_seconds: 600,
    reliability_score: 90,
    is_featured: true,
    sort_order: 1,
    published_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    audio_url: "https://secret.example.com/audio.mp3",
    stream_url: "https://secret.example.com/stream.mp3",
  };

  const publicItem = toMotivationPublicItem(browseRow);
  assert.equal(publicItem.title, "Morning Focus");
  assert.equal("audio_url" in publicItem, false);
  assert.equal("stream_url" in publicItem, false);

  const session = toMotivationSessionPublic({
    ...browseRow,
    program_id: "550e8400-e29b-41d4-a716-446655440001",
    season_number: 1,
    episode_number: 3,
    media_type: "audio",
    verification_status: "ready",
  });
  assert.equal(session.episode_number, 3);
  assert.equal(session.media_type, "audio");

  const program = toMotivationProgramPublic({
    id: "550e8400-e29b-41d4-a716-446655440001",
    slug: "30-days-discipline",
    title: "30 Days of Discipline",
    subtitle: "Daily sessions",
    description: "Build consistency",
    category_slug: "discipline",
    program_type: "daily_program",
    session_count: 30,
    total_duration_seconds: 18000,
    is_featured: true,
    is_public: true,
    is_active: true,
    status: "published",
    rights_status: "approved",
  });
  assert.equal(program.session_count, 30);
  assert.equal(program.program_type, "daily_program");

  console.log("Motivation program platform tests passed.");
}

main();
