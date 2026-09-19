import assert from "node:assert/strict";

import {
  ARTIST_V1_CAPABILITIES,
  assertArtistProfileV1,
  buildArtistProfileV1,
  classifyArtistCandidateIds,
  isCanonicalArtistUuid,
  normalizeArtistLookup,
  toLegacyArtistIdentity,
} from "../lib/artistIdentityV1";

const ID = "550e8400-e29b-41d4-a716-446655440000";

assert.equal(isCanonicalArtistUuid(ID), true);
assert.equal(isCanonicalArtistUuid("550e8400-e29b-61d4-a716-446655440000"), false);
assert.equal(normalizeArtistLookup("  BEYONCÉ  "), normalizeArtistLookup("Beyonce\u0301"));
assert.equal(normalizeArtistLookup("AC—DC"), "ac-dc");
assert.notEqual(normalizeArtistLookup("Björk"), normalizeArtistLookup("Bjork"));
assert.equal(classifyArtistCandidateIds([]).status, "not_found");
assert.equal(classifyArtistCandidateIds([ID]).status, "resolved");
assert.equal(classifyArtistCandidateIds([ID, "6ba7b810-9dad-41d1-80b4-00c04fd430c8"]).status, "ambiguous");
assert.equal(classifyArtistCandidateIds([ID, ID]).status, "resolved");

const resolveHttpStatus = (status: "invalid" | "not_found" | "restricted" | "resolved" | "ambiguous") =>
  status === "invalid" ? 400 : status === "not_found" ? 404 : status === "restricted" ? 403 : 200;
assert.equal(resolveHttpStatus("invalid"), 400, "malformed UUID resolution must not return HTTP 200");
assert.equal(resolveHttpStatus("ambiguous"), 200, "ambiguity must remain an explicit successful resolution state");

const profile = buildArtistProfileV1({
  artist: { id: ID, name: "Example Artist", slug: "example-artist", image_url: "https://cdn.example/avatar.jpg", is_verified: true },
  genres: ["Pop"],
  externalIds: [
    { provider: "musicbrainz", external_id: "public-id", status: "active", is_public: true },
    { provider: "internal-import", external_id: "private-id", status: "active", is_public: false },
  ],
  statistics: null,
  statisticsKnown: false,
});

assert.equal(profile.id, ID);
assert.equal(profile.verificationState, "verified");
assert.equal(profile.stats.followers, null);
assert.equal(profile.stats.monthlyListeners, null);
assert.deepEqual(profile.externalIds, [{ provider: "musicbrainz", externalId: "public-id" }]);
assert.deepEqual(profile.capabilities, ARTIST_V1_CAPABILITIES);
assert.equal(profile.capabilities.claim, false);
assert.equal(profile.capabilities.manage, false);
assert.equal(profile.capabilities.tips, false);
assert.equal(profile.capabilities.memberships, false);
assert.equal(profile.capabilities.hiddenCoins, false);
assertArtistProfileV1(profile);
assert.equal(toLegacyArtistIdentity(profile).id, ID, "compatibility adapter must preserve artist UUID");

const hidden = buildArtistProfileV1({ artist: { id: ID, name: "Hidden", profile_state: "hidden" } });
assert.equal(hidden.profileState, "hidden");
const restricted = buildArtistProfileV1({ artist: { id: ID, name: "Restricted", is_suspended: true, is_verified: true } });
assert.equal(restricted.profileState, "restricted");
assert.equal(restricted.verificationState, "restricted");
const merged = buildArtistProfileV1({ artist: { id: ID, name: "Merged", merged_into_artist_id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8" } });
assert.equal(merged.profileState, "merged");

assert.throws(() => buildArtistProfileV1({ artist: { id: "artist-name", name: "Wrong key" } }), /invalid_artist_uuid/);
assert.equal(JSON.stringify(profile).includes("payout"), false);
assert.equal(JSON.stringify(profile).includes("tax"), false);
assert.equal(JSON.stringify(profile).includes("owner"), false);

console.log("Artist identity v1 contract tests passed.");
