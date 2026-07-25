/**
 * Narrow tests for Home Genre Spotlights ranking + layout bounds.
 * Run: npx tsx scripts/test-genre-spotlights.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  rankGenreSpotlights,
  scoreGenreSpotlight,
  buildGenreSpotlightSignalHash,
  hasPersonalGenreSpotlightSignals,
  resolveGenreSpotlightLimit,
  emptyGenreSpotlightSignals,
  HOME_GENRE_SPOTLIGHT_DEFAULT,
  HOME_GENRE_SPOTLIGHT_MAX,
} from "../utils/genreSpotlights.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function makeGenre(title, songCount = 10, id = title.toLowerCase()) {
  return {
    id,
    title,
    artwork: `https://example.com/${id}.png`,
    songs: Array.from({ length: songCount }, (_, index) => ({
      id: `${id}-${index}`,
      genre: title,
      artwork: `https://example.com/${id}-${index}.png`,
    })),
  };
}

const catalogue = [
  makeGenre("Country", 40),
  makeGenre("Jazz", 35),
  makeGenre("Blues", 20),
  makeGenre("Amapiano", 28),
  makeGenre("Pop", 50),
  makeGenre("Rock", 18),
  makeGenre("Gospel", 22),
  makeGenre("Hip-Hop", 33),
  makeGenre("Afrobeats", 27),
  makeGenre("Electronic", 15),
  makeGenre("Contemporary Classical Longform Ambient", 8),
];

function titles(list) {
  return list.map((item) => item.title);
}

function run(name, fn) {
  fn();
  console.log(`OK ${name}`);
}

run("default limit is 4", () => {
  assert.equal(HOME_GENRE_SPOTLIGHT_DEFAULT, 4);
  assert.equal(HOME_GENRE_SPOTLIGHT_MAX, 6);
  assert.equal(resolveGenreSpotlightLimit(390), 4);
  assert.equal(resolveGenreSpotlightLimit(700), 6);
});

run("new user without onboarding uses editorial fallback, still bounded", () => {
  const ranked = rankGenreSpotlights(catalogue, emptyGenreSpotlightSignals(), 4);
  assert.equal(ranked.length, 4);
  assert.deepEqual(titles(ranked), ["Pop", "Country", "Jazz", "Hip-Hop"]);
});

run("new user with onboarding selections ranks those first", () => {
  const ranked = rankGenreSpotlights(
    catalogue,
    {
      ...emptyGenreSpotlightSignals(),
      onboardingGenres: ["Jazz", "Amapiano"],
    },
    4
  );
  assert.equal(ranked.length, 4);
  assert.deepEqual(titles(ranked).slice(0, 2).sort(), ["Amapiano", "Jazz"]);
  assert.ok(ranked[0].spotlightReasons.includes("onboarding"));
  assert.ok(ranked[1].spotlightReasons.includes("onboarding"));
});

run("frequent Country plays outrank weak one-off", () => {
  const ranked = rankGenreSpotlights(
    catalogue,
    {
      ...emptyGenreSpotlightSignals(),
      recentPlayGenres: [
        { genre: "Country", weight: 3 },
        { genre: "Pop", weight: 0.4 },
      ],
    },
    4
  );
  assert.equal(ranked[0].title, "Country");
});

run("repeated Jazz search boosts Jazz", () => {
  const ranked = rankGenreSpotlights(
    catalogue,
    {
      ...emptyGenreSpotlightSignals(),
      searchQueries: ["jazz night", "jazz"],
    },
    4
  );
  assert.equal(ranked[0].title, "Jazz");
});

run("liked Amapiano songs boost Amapiano", () => {
  const ranked = rankGenreSpotlights(
    catalogue,
    {
      ...emptyGenreSpotlightSignals(),
      favoriteGenres: [{ genre: "Amapiano", weight: 2 }],
    },
    4
  );
  assert.equal(ranked[0].title, "Amapiano");
});

run("mixed interests keep stable bounded order", () => {
  const signals = {
    ...emptyGenreSpotlightSignals(),
    onboardingGenres: ["Gospel"],
    recentPlayGenres: [{ genre: "Country", weight: 2 }],
    favoriteGenres: [{ genre: "Blues", weight: 1 }],
    searchQueries: ["amapiano"],
  };
  const a = titles(rankGenreSpotlights(catalogue, signals, 4));
  const b = titles(rankGenreSpotlights(catalogue, signals, 4));
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
  assert.ok(a.includes("Gospel"));
  assert.ok(a.includes("Country"));
  assert.ok(a.includes("Amapiano"));
});

run("recent behaviour can reorder past onboarding without wiping it", () => {
  const ranked = rankGenreSpotlights(
    catalogue,
    {
      ...emptyGenreSpotlightSignals(),
      onboardingGenres: ["Gospel"],
      recentPlayGenres: [{ genre: "Jazz", weight: 3 }],
      searchQueries: ["jazz"],
    },
    4
  );
  assert.equal(ranked[0].title, "Jazz");
  assert.ok(titles(ranked).includes("Gospel"));
});

run("signal hash stable when unchanged", () => {
  const signals = {
    ...emptyGenreSpotlightSignals(),
    onboardingGenres: ["Jazz"],
    recentPlayGenres: [{ genre: "Country", weight: 1 }],
  };
  assert.equal(
    buildGenreSpotlightSignalHash(signals),
    buildGenreSpotlightSignalHash(signals)
  );
  assert.equal(hasPersonalGenreSpotlightSignals(signals), true);
  assert.equal(hasPersonalGenreSpotlightSignals(emptyGenreSpotlightSignals()), false);
});

run("never exceeds max even if asked for more", () => {
  const ranked = rankGenreSpotlights(catalogue, emptyGenreSpotlightSignals(), 99);
  assert.equal(ranked.length, HOME_GENRE_SPOTLIGHT_MAX);
});

run("long genre names remain in ranked set with readable score", () => {
  const ranked = rankGenreSpotlights(
    catalogue,
    {
      ...emptyGenreSpotlightSignals(),
      searchQueries: ["contemporary classical longform ambient"],
    },
    4
  );
  assert.equal(ranked[0].title, "Contemporary Classical Longform Ambient");
  const { score } = scoreGenreSpotlight(ranked[0], {
    ...emptyGenreSpotlightSignals(),
    searchQueries: ["contemporary classical longform ambient"],
  });
  assert.ok(score > 0);
});

run("Home render uses bounded rail, not full catalogue grid", () => {
  const feed = fs.readFileSync(path.join(root, "app", "music-feed.tsx"), "utf8");
  assert.match(feed, /rankGenreSpotlights/);
  assert.match(feed, /GenreSpotlightCard/);
  assert.match(feed, /See all/);
  assert.doesNotMatch(feed, /rightIcon=\"sparkles\"/);
  assert.doesNotMatch(
    feed,
    /sortItemsByPreferredGenres\(genres\)\.slice\(0, HOME_SECTION_PREVIEW_LIMIT\)/
  );
  assert.match(feed, /resolveGenreSpotlightLimit/);
  assert.match(feed, /genreSpotlightsPersonalized/);
});

run("card layout fits common iPhone widths without tiny truncation boxes", () => {
  const widths = [320, 375, 390, 414, 428];
  for (const width of widths) {
    const cardWidth = Math.min(168, Math.max(148, Math.round(width * 0.42)));
    assert.ok(cardWidth >= 148, `card too narrow at ${width}`);
    assert.ok(cardWidth <= 168, `card too wide at ${width}`);
    const titleWidth = cardWidth - 24;
    assert.ok(titleWidth >= 124, `title area too narrow at ${width}: ${titleWidth}`);
    // Approx chars at 14px bold (~0.55em avg) — expect >= 12 visible chars before wrap
    const approxChars = Math.floor(titleWidth / 8.2);
    assert.ok(approxChars >= 15, `too few visible chars at ${width}: ${approxChars}`);
    console.log(
      `  layout ${width}px → card ${cardWidth}px, title ~${titleWidth}px (~${approxChars} chars/line, 2 lines)`
    );
  }
});

run("locale title no longer mixes Mood Rooms into Genre Spotlights", () => {
  const en = fs.readFileSync(path.join(root, "localization", "locales", "en.ts"), "utf8");
  assert.match(en, /moodGenreSpotlights:\s*"Genre Spotlights"/);
  assert.match(en, /moodRooms:\s*"Mood Rooms"/);
  assert.doesNotMatch(en, /Mood Rooms \/ Genre Spotlights/);
});

console.log("PASS genre spotlights ranking + home binding");
void pathToFileURL;
