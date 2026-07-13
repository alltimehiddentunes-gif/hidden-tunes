import assert from "node:assert/strict";

import {
  ARTIST_DEFAULT_PAGE_SIZE,
  ARTIST_MAX_PAGE_SIZE,
  clampArtistPageSize,
  isArtistUuid,
  toPublicRelease,
  toPublicSong,
} from "../lib/artistCatalog";
import { decodeContentCursor, encodeContentCursor } from "../lib/contentEngine/pagination";

function main() {
  assert.equal(isArtistUuid(""), false);
  assert.equal(isArtistUuid("not-a-uuid"), false);
  assert.equal(isArtistUuid("550e8400-e29b-41d4-a716-446655440000"), true);

  assert.equal(clampArtistPageSize(undefined), ARTIST_DEFAULT_PAGE_SIZE);
  assert.equal(clampArtistPageSize(0), ARTIST_DEFAULT_PAGE_SIZE);
  assert.equal(clampArtistPageSize(100), ARTIST_MAX_PAGE_SIZE);
  assert.equal(clampArtistPageSize(25), 25);

  const song = toPublicSong({
    id: "song-1",
    title: " Midnight Run ",
    slug: "midnight-run",
    artist_id: "artist-1",
    album_id: "album-1",
    genre: "Pop",
    mood: "Energetic",
    cover_url: "https://cdn.example.com/cover.jpg",
    duration_seconds: 210,
    audio_url: "https://cdn.example.com/audio.mp3",
    url: "https://cdn.example.com/audio.mp3",
    is_explicit: true,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(song.title, "Midnight Run");
  assert.equal(song.artwork, "https://cdn.example.com/cover.jpg");
  assert.equal("audio_url" in song, false);
  assert.equal("url" in song, false);
  assert.equal(song.is_explicit, true);

  const release = toPublicRelease({
    id: "album-1",
    title: "Night Drive",
    slug: "night-drive",
    artist_id: "artist-1",
    artwork_url: "https://cdn.example.com/album.jpg",
    release_year: 2024,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(release.title, "Night Drive");
  assert.equal(release.artwork, "https://cdn.example.com/album.jpg");
  assert.equal("audio_url" in release, false);

  const cursor = encodeContentCursor({
    v: 1,
    scope: "artist-top-songs:artist-1",
    sortValue: "2026-01-01T00:00:00.000Z",
    id: "song-1",
  });
  const decoded = decodeContentCursor(cursor, "artist-top-songs:artist-1");
  assert.ok(decoded);
  assert.equal(decoded?.id, "song-1");
  assert.equal(decodeContentCursor(cursor, "other-scope"), null);

  console.log("Artist profile metadata tests passed.");
}

main();
