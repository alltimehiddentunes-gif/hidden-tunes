/**
 * Album identity uniqueness / merge tests (pure helpers, no RN).
 * Run: npx tsx scripts/test-hidden-tunes-album-ids.ts
 */
import assert from "node:assert/strict";

import {
  assignUniqueAlbumCatalogId,
  buildAlbumsFromSongs,
  type AlbumIdentitySong,
} from "../utils/hiddenTunesAlbumIdentity";

const FALLBACK = "https://example.com/cover.png";

function song(
  partial: Partial<AlbumIdentitySong> &
    Pick<AlbumIdentitySong, "id" | "title" | "artist">
): AlbumIdentitySong {
  return {
    cover: FALLBACK,
    ...partial,
  };
}

function testArtistVariantsMergeSameAlbum() {
  const albums = buildAlbumsFromSongs(
    [
      song({
        id: "1",
        title: "Track A",
        artist: "Caasi Wills",
        album: "Album",
      }),
      song({
        id: "2",
        title: "Track B",
        artist: "Caasi-Wills",
        album: "Album",
      }),
    ],
    FALLBACK
  );
  assert.equal(albums.length, 1);
  assert.equal(albums[0].songs.length, 2);
  assert.equal(albums[0].id, "caasi-wills-album");
}

function testDifferentAlbumsStaySeparate() {
  const albums = buildAlbumsFromSongs(
    [
      song({ id: "1", title: "A", artist: "Caasi Wills", album: "Dawn" }),
      song({ id: "2", title: "B", artist: "Caasi Wills", album: "Dusk" }),
    ],
    FALLBACK
  );
  assert.equal(albums.length, 2);
  const ids = albums.map((a) => a.id).sort();
  assert.deepEqual(ids, ["caasi-wills-dawn", "caasi-wills-dusk"]);
}

function testSameAlbumTitleDifferentArtists() {
  const albums = buildAlbumsFromSongs(
    [
      song({ id: "1", title: "A", artist: "Artist One", album: "Self Titled" }),
      song({ id: "2", title: "B", artist: "Artist Two", album: "Self Titled" }),
    ],
    FALLBACK
  );
  assert.equal(albums.length, 2);
  assert.equal(new Set(albums.map((a) => a.id)).size, 2);
}

function testNoDuplicateIds() {
  const albums = buildAlbumsFromSongs(
    [
      song({ id: "1", title: "A", artist: "Caasi Wills", album: "Album" }),
      song({ id: "2", title: "B", artist: "Caasi-Wills", album: "Album" }),
      song({ id: "3", title: "C", artist: "Other", album: "Album" }),
      song({ id: "4", title: "D", artist: "a", album: "b-c" }),
      song({ id: "5", title: "E", artist: "a-b", album: "c" }),
    ],
    FALLBACK
  );
  const ids = albums.map((a) => a.id);
  assert.equal(ids.length, new Set(ids).size, `duplicate ids: ${ids.join(",")}`);
}

function testDeterministicAcrossRebuilds() {
  const input = [
    song({ id: "1", title: "A", artist: "Caasi Wills", album: "Album" }),
    song({ id: "2", title: "B", artist: "Caasi-Wills", album: "Album" }),
    song({ id: "3", title: "C", artist: "Other Act", album: "Night" }),
  ];
  const a = buildAlbumsFromSongs(input, FALLBACK).map((x) => x.id);
  const b = buildAlbumsFromSongs(input, FALLBACK).map((x) => x.id);
  assert.deepEqual(a, b);
}

function testAssignUniqueAlbumCatalogIdCollisionSuffix() {
  const claimed = new Set<string>();
  const first = assignUniqueAlbumCatalogId("a", "b-c", claimed);
  const second = assignUniqueAlbumCatalogId("a-b", "c", claimed);
  assert.equal(first, "a-b-c");
  assert.notEqual(first, second);
  assert.ok(claimed.has(first) && claimed.has(second));
}

function main() {
  testArtistVariantsMergeSameAlbum();
  testDifferentAlbumsStaySeparate();
  testSameAlbumTitleDifferentArtists();
  testNoDuplicateIds();
  testDeterministicAcrossRebuilds();
  testAssignUniqueAlbumCatalogIdCollisionSuffix();
  console.log("test-hidden-tunes-album-ids: PASS");
}

main();
