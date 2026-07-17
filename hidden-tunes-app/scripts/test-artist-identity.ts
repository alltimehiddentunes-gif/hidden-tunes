import assert from "node:assert/strict";

import {
  canOpenArtistProfileById,
  isArtistUuid,
  resolveArtistFromList,
} from "../utils/artistIdentity";

function main() {
  assert.equal(isArtistUuid("2da7464d-7fa6-4962-ba1c-a0e57d817619"), true);
  assert.equal(isArtistUuid("Acoustic Time"), false);

  const artists = [
    { id: "a1", slug: "alpha", name: "Alpha" },
    { id: "a2", slug: "beta", name: "Shared Name" },
    { id: "a3", slug: "gamma", name: "Shared Name" },
  ];

  assert.equal(resolveArtistFromList(artists, "a1")?.id, "a1");
  assert.equal(resolveArtistFromList(artists, "beta")?.id, "a2");
  assert.equal(resolveArtistFromList(artists, "Shared Name"), null);
  assert.equal(resolveArtistFromList(artists, "00000000-0000-4000-8000-000000000000"), null);
  assert.equal(canOpenArtistProfileById("3"), false);
  assert.equal(canOpenArtistProfileById("a1"), true);

  console.log("Artist identity tests passed.");
}

main();
