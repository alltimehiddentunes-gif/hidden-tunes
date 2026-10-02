import assert from "node:assert/strict";

import {
  ROOM_INITIAL_RELEVANCE_MIN,
  filterRelevantRoomTracks,
  normalizeRoomConcepts,
  rankSongsForRoomRelevance,
} from "../services/roomRelevance";
import { DISCOVERY_SCORE } from "../services/radioCatalogDiscovery";

function song(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: String(extra.title || id),
    artist: String(extra.artist || "Artist"),
    genre: extra.genre,
    mood: extra.mood,
    album: extra.album,
    tags: extra.tags,
    streamUrl: `https://example.com/${id}.mp3`,
    ...extra,
  };
}

{
  assert.equal(ROOM_INITIAL_RELEVANCE_MIN, DISCOVERY_SCORE.phrase);

  const concepts = normalizeRoomConcepts({
    title: "Country Station",
    id: "country-station",
    terms: ["country", "americana", "bluegrass", "nashville", "folk", "home", "road", "guitar"],
  });
  assert.ok(concepts.includes("country"), `expected country in ${concepts.join(",")}`);
  assert.equal(concepts.includes("home"), false, "weak home must not define Country Station");
  assert.equal(concepts.includes("road"), false);
  assert.equal(concepts.includes("guitar"), false);
  assert.equal(concepts.includes("station"), false);
}

{
  const africanDump = [
    song("a1", {
      title: "All Over You - Da Phonk Club Edit",
      album: "2025 TOP 30 AFRICAN",
      genre: "Afrobeats",
      mood: "Party",
    }),
    song("a2", {
      title: "Hot Body",
      album: "2025 TOP 30 AFRICAN",
      genre: "Afrobeats",
      mood: "Dance",
    }),
    song("a3", {
      title: "Shake It To The Max",
      album: "2025 TOP 30 AFRICAN",
      genre: "Afrobeats",
      tags: ["afro", "party"],
    }),
    ...Array.from({ length: 9 }, (_, i) =>
      song(`afro-${i}`, {
        title: `African Hit ${i}`,
        album: "2025 TOP 30 AFRICAN",
        genre: "Afrobeats",
      })
    ),
  ];

  const countryTracks = [
    song("c1", {
      title: "Dusty Roads Home",
      artist: "Willow Creek",
      genre: "Country",
      mood: "Americana",
      tags: ["country", "nashville"],
    }),
    song("c2", {
      title: "Bluegrass Morning",
      artist: "Prairie Band",
      genre: "Bluegrass",
      tags: ["bluegrass", "folk"],
    }),
    song("c3", {
      title: "Honky Tonk Lights",
      artist: "Nashville Nights",
      genre: "Country",
      mood: "Country",
    }),
  ];

  const catalogPrefix = [...africanDump, ...countryTracks];

  // OLD BUG: slice(0,12) would return only African dump.
  const legacyFallback = catalogPrefix.slice(0, 12);
  assert.equal(legacyFallback.every((entry) => String(entry.album).includes("AFRICAN")), true);

  const ranked = rankSongsForRoomRelevance(catalogPrefix, {
    title: "Country Station",
    id: "country-station",
    terms: ["country", "americana", "bluegrass", "nashville", "folk"],
    limit: 24,
  });

  assert.ok(ranked.length >= 3, `expected >=3 country matches, got ${ranked.length}`);
  assert.ok(
    ranked.every((hit) => {
      const blob = `${hit.song.genre} ${hit.song.mood} ${hit.song.title} ${JSON.stringify(hit.song.tags)}`.toLowerCase();
      return (
        blob.includes("country") ||
        blob.includes("bluegrass") ||
        blob.includes("americana") ||
        blob.includes("nashville") ||
        blob.includes("folk")
      );
    }),
    "no African dump in Country Station initial set"
  );
  assert.equal(
    ranked.some((hit) => String(hit.song.album || "").includes("AFRICAN")),
    false
  );

  // Quality > count: only 3 strong matches → 3 results, not 3+9 random.
  assert.equal(ranked.length, 3);

  console.log("PASS country mood relevance", {
    threshold: ROOM_INITIAL_RELEVANCE_MIN,
    strongMatches: ranked.length,
    titles: ranked.map((hit) => ({
      title: hit.song.title,
      score: hit.score,
      reason: hit.reason,
      matched: hit.matchedConcepts,
    })),
  });
}

{
  // Stale African session must never paint Country Station.
  const african = [
    song("a1", {
      title: "Hot Body",
      album: "2025 TOP 30 AFRICAN",
      genre: "Afrobeats",
    }),
    song("a2", {
      title: "Shake It To The Max",
      album: "2025 TOP 30 AFRICAN",
      genre: "Afrobeats",
    }),
  ];
  const filtered = filterRelevantRoomTracks(african, {
    title: "Country",
    id: "country-station",
    type: "genre",
  });
  assert.equal(filtered.length, 0, "stale African session must be discarded for Country");

  // Empty relevant pool must stay empty — never invent African fillers.
  const empty = rankSongsForRoomRelevance(african, {
    title: "Country Station",
    id: "country-station",
    terms: ["country", "americana"],
  });
  assert.equal(empty.length, 0, "no Country matches → empty, not unrelated pad");
}
