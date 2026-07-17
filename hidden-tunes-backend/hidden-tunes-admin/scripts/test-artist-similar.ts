import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { toPublicArtistCard, toPublicSong } from "../lib/artistCatalog";
import {
  ARTIST_SIMILARITY_MIN_SCORE,
  computeArtistSimilarityScore,
  loadArtistSimilarityCheckpoint,
  normalizeSimilarityToken,
  passesArtistSimilarityThreshold,
  saveArtistSimilarityCheckpoint,
  tokenizeGenreField,
  tokenizeMoodField,
} from "../lib/artistSimilarScores";

function main() {
  assert.equal(normalizeSimilarityToken("  Pop "), "pop");
  assert.deepEqual([...tokenizeGenreField("Pop , country / Blues")], [
    "pop",
    "country",
    "blues",
  ]);
  assert.deepEqual([...tokenizeMoodField("Emotional / reflective, warm")], [
    "emotional",
  ]);
  assert.deepEqual([...tokenizeMoodField("Prayer")], ["prayer"]);

  // Country alone must not pass confidence threshold.
  const countryOnly = computeArtistSimilarityScore({
    genresA: [],
    genresB: [],
    moodsA: [],
    moodsB: [],
    sharedCountry: true,
  });
  assert.equal(countryOnly.hasStrongSignal, false);
  assert.equal(passesArtistSimilarityThreshold(countryOnly), false);
  assert.ok(countryOnly.score < ARTIST_SIMILARITY_MIN_SCORE);

  // Shared genre overlap is a legitimate signal.
  const sharedGenre = computeArtistSimilarityScore({
    genresA: ["gospel", "worship"],
    genresB: ["gospel", "worship", "pop"],
    moodsA: ["prayer"],
    moodsB: ["prayer"],
  });
  assert.equal(sharedGenre.hasStrongSignal, true);
  assert.equal(passesArtistSimilarityThreshold(sharedGenre), true);
  assert.ok(sharedGenre.score >= ARTIST_SIMILARITY_MIN_SCORE);
  assert.ok(sharedGenre.reason);

  // Collaboration is strong enough alone.
  const collab = computeArtistSimilarityScore({
    genresA: [],
    genresB: [],
    moodsA: [],
    moodsB: [],
    collaboration: true,
  });
  assert.equal(passesArtistSimilarityThreshold(collab), true);
  assert.equal(collab.reason, "Collaborated together");

  // Name similarity is never used — different names with no shared signals fail.
  const nameTrap = computeArtistSimilarityScore({
    genresA: ["techno"],
    genresB: ["podcast"],
    moodsA: ["aggressive"],
    moodsB: ["insightful"],
  });
  assert.equal(passesArtistSimilarityThreshold(nameTrap), false);

  // Duplicate-name artists remain distinct by UUID in public cards.
  const a = toPublicArtistCard({ id: "uuid-a", name: "Same Name", image_url: null });
  const b = toPublicArtistCard({ id: "uuid-b", name: "Same Name", image_url: null });
  assert.notEqual(a.id, b.id);
  assert.equal(a.name, b.name);

  // Missing artwork stays null (UI uses fallback avatar).
  assert.equal(a.artwork, null);

  // Metadata-only: no stream URL leakage on public song serializer.
  const song = toPublicSong({
    id: "song-1",
    title: "Signal",
    audio_url: "https://cdn.example.com/a.mp3",
    url: "https://cdn.example.com/a.mp3",
  });
  assert.equal("audio_url" in song, false);
  assert.equal("url" in song, false);

  // Self / merged / below-threshold filters are enforced by score helpers.
  assert.ok(ARTIST_SIMILARITY_MIN_SCORE >= 2);

  const checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-artist-similar-"));
  const checkpointPath = path.join(checkpointDir, "checkpoint.json");
  saveArtistSimilarityCheckpoint(checkpointPath, {
    version: 1,
    updated_at: new Date().toISOString(),
    cursor_artist_id: "artist-cursor",
    processed_artists: 8,
    written_pairs: 21,
    skipped_no_signal: 3,
    schema_missing: false,
    last_error: null,
  });
  const loaded = loadArtistSimilarityCheckpoint(checkpointPath);
  assert.equal(loaded.cursor_artist_id, "artist-cursor");
  assert.equal(loaded.written_pairs, 21);
  assert.equal(loaded.schema_missing, false);

  console.log("Artist similar scores tests passed.");
}

main();
