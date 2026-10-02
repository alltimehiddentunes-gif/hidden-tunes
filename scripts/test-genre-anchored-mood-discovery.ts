import assert from "node:assert/strict";

import {
  discoverGenreAnchoredMoodPage,
  resetGenreAnchoredSession,
  songMatchesGenreAnchor,
} from "../services/genreAnchoredMoodDiscovery";
import { selectMoodCatalogCandidates } from "../services/radioCatalogDiscovery";

function song(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: String(extra.title || id),
    artist: String(extra.artist || "Artist"),
    genre: extra.genre,
    mood: extra.mood,
    tags: extra.tags,
    streamUrl: `https://example.com/${id}.mp3`,
    isOnline: true,
    ...extra,
  };
}

{
  assert.equal(songMatchesGenreAnchor(song("1", { genre: "Country" }), "Country"), true);
  assert.equal(songMatchesGenreAnchor(song("2", { genre: "Afrobeats" }), "Country"), false);
  assert.equal(songMatchesGenreAnchor(song("3", { genre: "Smooth Jazz" }), "Jazz"), true);
}

void (async () => {
  const catalog = [
    song("c-ref-1", { title: "Dust Road Thoughts", genre: "Country", mood: "Reflective" }),
    song("c-ref-2", { title: "Quiet Ranch", genre: "Country", mood: "Reflective, Heartfelt" }),
    song("c-heart", { title: "Home Again", genre: "Country", mood: "Heartfelt", tags: ["nostalgic"] }),
    song("c-broad", { title: "Honky Tonk Night", genre: "Country", mood: "Upbeat" }),
    song("j-calm-1", { title: "Blue Hour", genre: "Jazz", mood: "Calm" }),
    song("j-calm-2", { title: "Soft Keys", genre: "Jazz", mood: "Calm, Serene" }),
    song("j-nost", { title: "Old Club", genre: "Jazz", mood: "Nostalgic" }),
    song("afro-party", {
      title: "Hot Body",
      genre: "Afrobeats",
      mood: "Party",
      album: "2025 TOP 30 AFRICAN",
    }),
    song("afro-ref", {
      title: "Lagos Mirror",
      genre: "Afrobeats",
      mood: "Reflective",
    }),
    song("pop-ref", { title: "City Lights Soft", genre: "Pop", mood: "Reflective" }),
  ];

  const fetchAll = async () => ({ songs: catalog, hasMore: false });

  // COUNTRY + REFLECTIVE — must stay Country, never Afrobeats/Pop reflective pad
  resetGenreAnchoredSession({ genre: "Country", mood: "Reflective", id: "t1" });
  const countryReflective = await discoverGenreAnchoredMoodPage({
    genre: "Country",
    mood: "Reflective",
    id: "t1",
    limit: 10,
    reset: true,
    fetchPage: fetchAll,
  });
  assert.ok(countryReflective.songs.length >= 2);
  assert.ok(
    countryReflective.songs.every((entry) =>
      String(entry.genre).toLowerCase().includes("country")
    ),
    "Country+Reflective must preserve Country"
  );
  assert.equal(
    countryReflective.songs.some((entry) =>
      String(entry.genre).toLowerCase().includes("afro")
    ),
    false
  );
  assert.ok(countryReflective.broadeningLevel <= 3, "must not leave Country early");

  // COUNTRY + HEARTFELT
  resetGenreAnchoredSession({ genre: "Country", mood: "Heartfelt", id: "t2" });
  const countryHeart = await discoverGenreAnchoredMoodPage({
    genre: "Country",
    mood: "Heartfelt",
    id: "t2",
    limit: 10,
    reset: true,
    fetchPage: fetchAll,
  });
  assert.ok(countryHeart.songs.length >= 1);
  assert.ok(
    countryHeart.songs.every((entry) =>
      String(entry.genre).toLowerCase().includes("country")
    )
  );

  // JAZZ + CALM
  resetGenreAnchoredSession({ genre: "Jazz", mood: "Calm", id: "t3" });
  const jazzCalm = await discoverGenreAnchoredMoodPage({
    genre: "Jazz",
    mood: "Calm",
    id: "t3",
    limit: 10,
    reset: true,
    fetchPage: fetchAll,
  });
  assert.ok(jazzCalm.songs.length >= 2);
  assert.ok(
    jazzCalm.songs.every((entry) => String(entry.genre).toLowerCase().includes("jazz"))
  );
  assert.equal(
    jazzCalm.songs.some((entry) => String(entry.genre).toLowerCase().includes("country")),
    false
  );

  // JAZZ + NOSTALGIC
  resetGenreAnchoredSession({ genre: "Jazz", mood: "Nostalgic", id: "t4" });
  const jazzNost = await discoverGenreAnchoredMoodPage({
    genre: "Jazz",
    mood: "Nostalgic",
    id: "t4",
    limit: 10,
    reset: true,
    fetchPage: fetchAll,
  });
  assert.ok(jazzNost.songs.length >= 1);
  assert.ok(
    jazzNost.songs.every((entry) => String(entry.genre).toLowerCase().includes("jazz"))
  );

  // AFROBEATS + PARTY
  resetGenreAnchoredSession({ genre: "Afrobeats", mood: "Party", id: "t5" });
  const afroParty = await discoverGenreAnchoredMoodPage({
    genre: "Afrobeats",
    mood: "Party",
    id: "t5",
    limit: 10,
    reset: true,
    fetchPage: fetchAll,
  });
  assert.ok(afroParty.songs.length >= 1);
  assert.ok(
    afroParty.songs.every((entry) =>
      String(entry.genre).toLowerCase().includes("afro")
    )
  );

  // GOSPEL + WORSHIP (add tracks)
  const gospelCatalog = [
    ...catalog,
    song("g1", { title: "Open Heaven", genre: "Gospel", mood: "Worship, Praise" }),
    song("g2", { title: "Sacred Voice", genre: "Gospel", mood: "Worship" }),
  ];
  resetGenreAnchoredSession({ genre: "Gospel", mood: "Worship", id: "t6" });
  const gospel = await discoverGenreAnchoredMoodPage({
    genre: "Gospel",
    mood: "Worship",
    id: "t6",
    limit: 10,
    reset: true,
    fetchPage: async () => ({ songs: gospelCatalog, hasMore: false }),
  });
  assert.ok(gospel.songs.length >= 1);
  assert.ok(
    gospel.songs.every((entry) => String(entry.genre).toLowerCase().includes("gospel"))
  );

  // GLOBAL REFLECTIVE — not locked to one genre
  const global = selectMoodCatalogCandidates(catalog, "Reflective", 20);
  assert.ok(global.songs.length >= 3);
  const globalGenres = new Set(
    global.songs.map((entry) => String(entry.genre || "").toLowerCase())
  );
  assert.ok(
    globalGenres.size >= 2,
    "global Reflective search must span genres, not lock to Country"
  );

  // NO RANDOM FALLBACK — exact Country Reflective empty → Country broader, not Afrobeats
  const thin = [
    song("only-c", { title: "Only Country Spot", genre: "Country", mood: "Upbeat" }),
    song("afro-x", { title: "Hot Body", genre: "Afrobeats", mood: "Reflective" }),
  ];
  resetGenreAnchoredSession({ genre: "Country", mood: "Reflective", id: "t7" });
  const thinPage = await discoverGenreAnchoredMoodPage({
    genre: "Country",
    mood: "Reflective",
    id: "t7",
    limit: 5,
    reset: true,
    fetchPage: async () => ({ songs: thin, hasMore: false }),
  });
  // Level 3 may return Country broader; must not return Afrobeats while Country remains
  assert.ok(
    thinPage.songs.every((entry) => String(entry.genre).toLowerCase().includes("country")) ||
      thinPage.songs.length === 0,
    "must not jump to Afrobeats while Country pool exists"
  );
  if (thinPage.broadeningLevel < 4) {
    assert.equal(
      thinPage.songs.some((entry) => String(entry.genre).toLowerCase().includes("afro")),
      false
    );
  }

  // NO EARLY BROADENING — 3 Country matches with limit 10 must stay Country L0–3
  const sparse = [
    song("c1", { title: "Dust Road Thoughts", genre: "Country", mood: "Reflective" }),
    song("c2", { title: "Quiet Ranch", genre: "Country", mood: "Reflective" }),
    song("c3", { title: "Porch Light", genre: "Country", mood: "Reflective, Heartfelt" }),
    song("afro-pad", {
      title: "Hot Body",
      genre: "Afrobeats",
      mood: "Reflective, Party",
      album: "2025 TOP 30 AFRICAN",
    }),
    song("pop-pad", { title: "City Soft", genre: "Pop", mood: "Reflective" }),
  ];
  resetGenreAnchoredSession({ genre: "Country", mood: "Reflective", id: "t-sparse" });
  const sparsePage = await discoverGenreAnchoredMoodPage({
    genre: "Country",
    mood: "Reflective",
    id: "t-sparse",
    limit: 10,
    reset: true,
    fetchPage: async () => ({ songs: sparse, hasMore: false }),
  });
  assert.equal(sparsePage.songs.length, 3, "return the 3 Country matches, do not pad");
  assert.ok(
    sparsePage.songs.every((entry) =>
      String(entry.genre).toLowerCase().includes("country")
    ),
    "sparse Country+Reflective must not admit Afrobeats/Pop"
  );
  assert.ok(
    sparsePage.broadeningLevel <= 3,
    "must not early-broaden to level 4 to fill page size"
  );
  assert.equal(
    sparsePage.songs.filter(
      (entry) => !songMatchesGenreAnchor(entry, "Country")
    ).length,
    0,
    "genreMatch=false must be ZERO at levels 0–3"
  );

  // PHYSICAL: genre-filtered page with missing mood tags must still return Country (L3)
  // — never "LEVEL 0 / RESULT GENRES none".
  const countryNoMood = [
    song("cn1", { title: "Barn Door", genre: "Country" }),
    song("cn2", { title: "Wire Fence", genre: "Country" }),
    song("cn3", { title: "Dust Lane", genre: "" }), // missing genre — stamp from query
  ];
  resetGenreAnchoredSession({ genre: "Country", mood: "Reflective", id: "t-nomood" });
  const noMoodPage = await discoverGenreAnchoredMoodPage({
    genre: "Country",
    mood: "Reflective",
    id: "t-nomood",
    limit: 10,
    reset: true,
    fetchPage: async ({ genre: g }) => {
      assert.equal(g, "Country", "fetcher must receive genre constraint");
      return { songs: countryNoMood, hasMore: false };
    },
  });
  assert.ok(noMoodPage.songs.length >= 2, "Country page must not paint empty at L0");
  assert.ok(
    noMoodPage.songs.every((entry) =>
      String(entry.genre || "").toLowerCase().includes("country")
    ),
    "stamped/filtered pool must stay Country"
  );
  assert.ok(noMoodPage.broadeningLevel <= 3);

  // CACHE KEY isolation concept: Country|Reflective session ≠ Global Reflective
  resetGenreAnchoredSession({ genre: "Country", mood: "Reflective", id: "country|reflective" });
  resetGenreAnchoredSession({ genre: "", mood: "Reflective", id: "reflective" });

  console.log("PASS genre-anchored mood discovery", {
    countryReflective: countryReflective.songs.map((s) => s.title),
    jazzCalm: jazzCalm.songs.map((s) => s.title),
    afroParty: afroParty.songs.length,
    gospel: gospel.songs.length,
    globalReflectiveGenres: Array.from(globalGenres),
    sparseCountryOnly: sparsePage.songs.map((s) => ({
      title: s.title,
      genre: s.genre,
      genreMatch: songMatchesGenreAnchor(s, "Country"),
      level: sparsePage.broadeningLevel,
    })),
    countryNoMoodEmptyFix: {
      count: noMoodPage.songs.length,
      level: noMoodPage.broadeningLevel,
      genres: noMoodPage.songs.map((s) => s.genre),
    },
    noRandomFallback: true,
    noEarlyBroadening: true,
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
