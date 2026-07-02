import assert from "node:assert/strict";

import {
  toTvPublicStation,
} from "../lib/tvCatalog";
import { buildTvPublicCategoryCatalog } from "../lib/tvPublicCategories";
import {
  isPublicTvRow,
  toTvPublicMetadata,
  TV_RELIABILITY_THRESHOLD,
} from "../lib/tvStationHealth";

function main() {
  const row = {
    id: "station-uuid",
    title: "News Live",
    description: "Verified news stream",
    thumbnail_url: "https://cdn.example.com/logo.jpg",
    channel_name: "News Channel",
    category: "News",
    genre: "News",
    mood: "Motivation",
    format: "Live Performances",
    tags: ["Music TV", "verified"],
    language: "English",
    region: "Ghana",
    reliability_score: 88,
    is_featured: true,
    source_url: "https://stream.example.com/live.m3u8",
    embed_url: "https://www.youtube.com/embed/demo",
    source_type: "hls_stream",
    source_id: "demo",
  };

  const station = toTvPublicStation(row);

  assert.equal(station.id, "station-uuid");
  assert.equal(station.title, "News Live");
  assert.equal(station.logo, "https://cdn.example.com/logo.jpg");
  assert.equal(station.country, "Ghana");
  assert.equal(station.language, "English");
  assert.equal(station.reliability_score, 88);
  assert.equal(station.is_featured, true);
  assert.ok(station.categories.includes("News"));
  assert.ok(station.categories.includes("Motivation"));
  assert.ok(station.categories.includes("Music TV"));

  assert.equal("source_url" in station, false);
  assert.equal("stream_url" in station, false);
  assert.equal("embed_url" in station, false);
  assert.equal("source_id" in station, false);

  const metadata = toTvPublicMetadata(row);
  assert.equal("source_url" in metadata, false);
  assert.equal("embed_url" in metadata, false);

  assert.equal(
    isPublicTvRow({
      status: "approved",
      is_active: true,
      playback_status: "playable",
      reliability_score: TV_RELIABILITY_THRESHOLD,
    }),
    true
  );
  assert.equal(
    isPublicTvRow({
      status: "approved",
      is_active: true,
      playback_status: "playable",
      reliability_score: TV_RELIABILITY_THRESHOLD - 1,
    }),
    false
  );

  const categories = buildTvPublicCategoryCatalog();
  assert.ok(categories.some((entry) => entry.name === "Motivation"));
  assert.ok(categories.some((entry) => entry.name === "Music TV"));
  assert.ok(
    categories.some((entry) => entry.name === "Motivational speeches")
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        publicFields: Object.keys(station),
        categoryCount: categories.length,
        hasMotivation: true,
        hasMusicTv: true,
      },
      null,
      2
    )
  );
}

main();
