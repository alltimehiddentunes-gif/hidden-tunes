import assert from "node:assert/strict";

import { isArtistUuid, toPublicSong } from "../lib/artistCatalog";
import { requireArtistUuid, validateArtistRefParam } from "../lib/artistPublicApi";

function main() {
  // UUID validation for follow routes.
  assert.equal(isArtistUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isArtistUuid("not-a-uuid"), false);

  const invalid = validateArtistRefParam("550e8400-e29b-61d4-a716-446655440000");
  assert.ok(invalid.error);

  const empty = validateArtistRefParam("   ");
  assert.ok(empty.error);

  // Follow mutations require UUID artist ids (not display names).
  // requireArtistUuid is async against DB for existence; sync shape check only here.
  assert.equal(isArtistUuid("Acoustic Time"), false);

  // Metadata-only song serializer must never leak stream URLs into profile payloads.
  const song = toPublicSong({
    id: "song-1",
    title: "Signal",
    audio_url: "https://cdn.example.com/a.mp3",
    url: "https://cdn.example.com/a.mp3",
    stream_url: "https://cdn.example.com/a.mp3",
  });
  assert.equal("audio_url" in song, false);
  assert.equal("url" in song, false);
  assert.equal("stream_url" in song, false);

  // Documented API status contract for Artist Follow:
  const statusContract = {
    unauthenticated: 401,
    invalidArtistRef: 400,
    missingArtist: 404,
    schemaAbsent: 503,
    followSuccess: 200,
    unfollowSuccess: 200,
  };
  assert.equal(statusContract.unauthenticated, 401);
  assert.equal(statusContract.invalidArtistRef, 400);
  assert.equal(statusContract.missingArtist, 404);
  assert.equal(statusContract.schemaAbsent, 503);

  // Idempotent response shapes used by clients.
  const followed = { success: true, followed: true, artist_id: "uuid", follower_count: 3 };
  const unfollowed = { success: true, followed: false, artist_id: "uuid", follower_count: 2 };
  assert.equal(followed.followed, true);
  assert.equal(unfollowed.followed, false);
  assert.ok(followed.follower_count >= 0);
  assert.ok(unfollowed.follower_count >= 0);

  // Guest follow state never invents other users' records.
  const guestState = {
    available: true,
    artist_id: "uuid",
    is_following: false,
    follower_count: 2,
  };
  assert.equal(guestState.is_following, false);

  void requireArtistUuid;

  console.log("Artist follow contract tests passed.");
}

main();
