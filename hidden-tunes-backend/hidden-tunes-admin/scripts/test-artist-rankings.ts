import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ARTIST_RELEASE_TYPES,
  normalizeReleaseType,
  toPublicRelease,
  toPublicSong,
} from "../lib/artistCatalog";
import { parseArtistReleaseType } from "../lib/artistPublicApi";
import {
  computeArtistSongPlayScore,
  loadArtistRankingCheckpoint,
  rankingMetaForMode,
  saveArtistRankingCheckpoint,
} from "../lib/artistSongRankings";

function main() {
  assert.equal(computeArtistSongPlayScore({}), 0);
  assert.equal(
    computeArtistSongPlayScore({
      playCount: 0,
      favoriteCount: 0,
      recentUniqueListeners: 0,
    }),
    0,
  );
  assert.equal(
    computeArtistSongPlayScore({
      playCount: 10,
      favoriteCount: 2,
      recentUniqueListeners: 3,
    }),
    10 + 2 * 5 + 3 * 2,
  );

  assert.deepEqual(rankingMetaForMode("latest"), {
    mode: "latest",
    label: "Essential tracks",
    has_positive_scores: false,
  });
  assert.equal(rankingMetaForMode("ranked").label, "Popular tracks");
  assert.equal(rankingMetaForMode("play_count").has_positive_scores, true);

  for (const type of ARTIST_RELEASE_TYPES) {
    assert.equal(normalizeReleaseType(type), type);
  }
  assert.equal(normalizeReleaseType("Album"), "album");
  assert.equal(normalizeReleaseType("live album from title"), "unknown");
  assert.equal(normalizeReleaseType(""), "unknown");
  assert.equal(normalizeReleaseType(null), "unknown");

  const release = toPublicRelease({
    id: "album-1",
    title: "Night Drive",
    artist_id: "artist-1",
  });
  assert.equal(release.release_type, "unknown");

  const typed = toPublicRelease({
    id: "album-2",
    title: "EP One",
    release_type: "ep",
  });
  assert.equal(typed.release_type, "ep");

  const song = toPublicSong({
    id: "song-1",
    title: "Signal",
    audio_url: "https://cdn.example.com/a.mp3",
    url: "https://cdn.example.com/a.mp3",
  });
  assert.equal("audio_url" in song, false);
  assert.equal("url" in song, false);

  assert.equal(parseArtistReleaseType(new URLSearchParams("type=ep")), "ep");
  assert.equal(parseArtistReleaseType(new URLSearchParams("releaseType=live")), "live");
  assert.equal(parseArtistReleaseType(new URLSearchParams("type=all")), null);
  assert.equal(parseArtistReleaseType(new URLSearchParams("")), null);

  const checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-artist-rankings-"));
  const checkpointPath = path.join(checkpointDir, "checkpoint.json");
  const saved = saveArtistRankingCheckpoint(checkpointPath, {
    version: 1,
    updated_at: new Date().toISOString(),
    cursor_artist_id: "artist-cursor",
    processed_artists: 12,
    written_rankings: 34,
    skipped_no_signal: 5,
    schema_missing: false,
    last_error: null,
  });
  assert.equal(saved.cursor_artist_id, "artist-cursor");
  const loaded = loadArtistRankingCheckpoint(checkpointPath);
  assert.equal(loaded.processed_artists, 12);
  assert.equal(loaded.written_rankings, 34);
  assert.equal(loaded.schema_missing, false);

  // One-track / no-signal artist: score stays 0 so writers skip fabrication.
  assert.equal(computeArtistSongPlayScore({ playCount: null }), 0);

  // Duplicate editions remain distinct releases (identity by id, not title).
  const editionA = toPublicRelease({ id: "a", title: "Same Title", release_type: "album" });
  const editionB = toPublicRelease({ id: "b", title: "Same Title", release_type: "album" });
  assert.notEqual(editionA.id, editionB.id);

  // Featured appearance taxonomy is explicit metadata only.
  assert.equal(normalizeReleaseType("appearance"), "appearance");
  assert.notEqual(normalizeReleaseType("feat. Guest (Live)"), "appearance");

  console.log("Artist rankings and release taxonomy tests passed.");
}

main();
