import assert from "node:assert/strict";

import {
  DISCOVERY_SCORE,
  extractRadioSeedArtist,
  normalizeArtistDiscoveryName,
  normalizeDiscoveryConcepts,
  resolveDiscoveryToken,
  selectMoodCatalogCandidates,
  selectRadioCatalogCandidates,
  splitDiscoveryConcepts,
  traceRadioCatalogDiscovery,
} from "../services/radioCatalogDiscovery";

const track = (
  id: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  title: String(extra.title || id),
  artist: String(extra.artist || "Artist"),
  genre: extra.genre,
  mood: extra.mood,
  tags: extra.tags,
  album: extra.album,
  streamUrl: `https://example.com/${id}.mp3`,
  isOnline: true,
  ...extra,
});

const catalog = [
  track("afro-1", {
    title: "Lagos Night",
    artist: "Afro King",
    genre: "Afrobeats",
    mood: "Party",
    tags: ["afro", "dance"],
  }),
  track("chill-1", {
    title: "Soft Evening",
    artist: "LoFi Cat",
    genre: "Lo-Fi",
    mood: "Chill",
    tags: ["chillhop"],
  }),
  track("party-1", {
    title: "Club Lights",
    artist: "DJ Heat",
    genre: "Dance",
    mood: "Party Energy",
  }),
  track("worship-1", {
    title: "Open Heaven",
    artist: "Elevation Worshippers",
    genre: "Gospel",
    mood: "Spiritual",
    tags: ["worship", "praise"],
  }),
  track("praise-1", {
    title: "Praise Forever",
    artist: "Faith Band",
    genre: "Gospel",
    mood: "Inspiration",
    tags: ["praise"],
  }),
  track("intimate-1", {
    title: "Close To You",
    artist: "Soft Voices",
    genre: "R&B",
    mood: "Soft Intimacy",
    tags: ["intimacy"],
  }),
  track("pop-noise", {
    title: "Neon Pop",
    artist: "City Pop",
    genre: "Pop",
    mood: "Upbeat",
  }),
  track("jazz-1", {
    title: "Blue Room",
    artist: "Night Trio",
    genre: "Jazz",
    mood: "Late Night",
  }),
];

function assertHasConcepts(raw: string, expected: string[]) {
  const concepts = normalizeDiscoveryConcepts(raw);
  expected.forEach((token) => {
    assert.ok(
      concepts.includes(token) || concepts.some((c) => c.includes(token)),
      `expected concept ${token} from ${raw} => ${concepts.join("|")}`
    );
  });
}

{
  // PUNCTUATION
  assert.deepEqual(splitDiscoveryConcepts("Afro, Party, Chill"), [
    "afro",
    "party",
    "chill",
  ]);
  [
    "Afro´Party^Chill°",
    "Afro,,,Party+++Chill",
    "Afro • Party · Chill",
    "Afro/Party|Chill",
    "Afro___Party...Chill",
  ].forEach((raw) => {
    const concepts = splitDiscoveryConcepts(raw);
    assert.deepEqual(
      concepts.filter((token) => ["afro", "party", "chill"].includes(token)),
      ["afro", "party", "chill"],
      raw
    );
    assert.ok(selectMoodCatalogCandidates(catalog, raw, 20).songs.length > 0, raw);
  });
  console.log("PUNCTUATION: PASS");
}

{
  // ALIASES
  assert.ok(normalizeDiscoveryConcepts("Afrobeats").includes("afrobeat") || normalizeDiscoveryConcepts("Afrobeats").includes("afrobeats"));
  assert.ok(normalizeDiscoveryConcepts("Afro Beat").some((c) => c.includes("afro")));
  assert.ok(splitDiscoveryConcepts("R&B").includes("rnb"));
  assert.ok(splitDiscoveryConcepts("RnB").includes("rnb") || normalizeDiscoveryConcepts("RnB").includes("rnb"));
  assert.ok(splitDiscoveryConcepts("R and B").includes("rnb") || normalizeDiscoveryConcepts("R and B").includes("rnb"));
  assert.ok(splitDiscoveryConcepts("Hip-Hop").includes("hip hop"));
  assert.ok(splitDiscoveryConcepts("hiphop").includes("hip hop") || normalizeDiscoveryConcepts("hiphop").includes("hip hop"));
  assert.ok(splitDiscoveryConcepts("Lo-Fi").includes("lofi"));
  assert.ok(normalizeDiscoveryConcepts("Lo Fi").includes("lofi"));
  console.log("ALIASES: PASS");
}

{
  // TYPO TOLERANCE
  const typos: Array<[string, string]> = [
    ["worshp", "worship"],
    ["worshipp", "worship"],
    ["praisee", "praise"],
    ["inspiraton", "inspiration"],
    ["intimcy", "intimacy"],
    ["spirtual", "spiritual"],
    ["afrobeet", "afrobeat"],
    ["chll", "chill"],
    ["partyy", "party"],
  ];
  typos.forEach(([raw, expected]) => {
    const resolved = resolveDiscoveryToken(raw);
    assert.equal(resolved.kind, "typo", `${raw} should be typo → ${expected}`);
    assert.ok(
      resolved.concepts.includes(expected) ||
        resolved.concepts.some((c) => c.includes(expected)),
      `${raw} => ${resolved.concepts.join("|")}`
    );
  });

  assertHasConcepts("Worshp´Praise^Inspiraton°Intimcy", [
    "worship",
    "praise",
    "inspiration",
    "intimacy",
  ]);
  assert.ok(
    selectMoodCatalogCandidates(catalog, "Worshp´Praise^Inspiraton°Intimcy", 20)
      .songs.length > 0
  );

  [
    "Worship",
    "worship",
    "WORSHIP",
    "Worshp",
    "Worshipp",
    "Worship´",
    "Worship^^Praise",
  ].forEach((raw) => {
    const matched = selectMoodCatalogCandidates(catalog, raw, 20);
    assert.ok(matched.songs.length > 0, `typo/case matrix failed: ${raw}`);
  });

  [
    "Afrobeat",
    "Afrobeats",
    "Afro Beat",
    "Afrobeet",
    "Afrobeat+Party",
    "Afrobeet´Party^Chll°",
  ].forEach((raw) => {
    const matched = selectMoodCatalogCandidates(catalog, raw, 20);
    assert.ok(matched.songs.length > 0, `afro typo matrix failed: ${raw}`);
  });
  console.log("TYPO TOLERANCE: PASS");
}

{
  // SHORT-WORD SAFETY
  assert.equal(resolveDiscoveryToken("rap").kind === "typo", false);
  assert.equal(resolveDiscoveryToken("pop").kind === "typo", false);
  assert.equal(resolveDiscoveryToken("rock").kind === "typo", false);
  assert.equal(resolveDiscoveryToken("soul").kind === "typo", false);
  assert.equal(resolveDiscoveryToken("jazz").kind === "typo", false);
  // "pop" must not fuzzy into unrelated long concepts
  assert.ok(!resolveDiscoveryToken("pop").concepts.includes("worship"));
  console.log("SHORT-WORD SAFETY: PASS");
}

{
  // NEGATIVE FALSE-MATCH TESTS
  const xyzzy = selectMoodCatalogCandidates(catalog, "xyzzyqq", 20);
  assert.equal(xyzzy.songs.length, 0, "nonsense must not match catalog");

  const sport = resolveDiscoveryToken("sport");
  assert.notEqual(sport.kind, "typo");
  assert.ok(!sport.concepts.includes("worship"));

  const soup = resolveDiscoveryToken("soup");
  assert.ok(!soup.concepts.includes("soul"));

  // Exact worship must outrank typo-only pathway scores when both present.
  const exact = selectMoodCatalogCandidates(catalog, "worship", 20);
  const typo = selectMoodCatalogCandidates(catalog, "worshp", 20);
  assert.ok(exact.songs.length > 0 && typo.songs.length > 0);
  const exactTop = exact.ranked[0];
  const typoTop = typo.ranked[0];
  assert.ok(
    (exactTop?.score || 0) >= (typoTop?.score || 0),
    "exact must not score below typo for same room"
  );
  assert.ok(
    exactTop?.signals.some((s) => s.startsWith("exact:") || s.startsWith("alias:")),
    "exact path should emit exact/alias signal"
  );
  assert.ok(DISCOVERY_SCORE.exact > DISCOVERY_SCORE.typo);

  // Seeded miss with no valid concepts must not dump random catalog.
  const seededEmpty = selectRadioCatalogCandidates(
    catalog,
    { artist: "Definitely Missing Artist XYZ", genre: "zzzznolabel" },
    20
  );
  assert.equal(seededEmpty.length, 0, "seeded miss must not random-dump");
  console.log("NEGATIVE FALSE-MATCH TESTS: PASS");
}

{
  const afro = selectMoodCatalogCandidates(catalog, "Afro, Party, Chill", 20);
  assert.ok(afro.songs.length > 0);
  console.log("MOOD ROOMS: PASS", afro.songs.length);
}

{
  const radio = traceRadioCatalogDiscovery(
    catalog,
    {
      title: "Elevation Worshippers Radio",
      artist: "Elevation Worshipper",
      genre: "Gospel",
      mood: "Spiritual",
    },
    20
  );
  assert.ok(radio.songs.length > 0);
  assert.equal(
    normalizeArtistDiscoveryName("Elevation  Worshippers"),
    normalizeArtistDiscoveryName("Elevation Worshipper")
  );
  console.log("ARTIST RADIO: PASS", radio.songs.length);
}

{
  const hidden = selectRadioCatalogCandidates(
    catalog,
    { title: "Hidden Tunes Radio" },
    10
  );
  assert.ok(hidden.length > 0, "Hidden Radio must diversify local catalog");
  console.log("HIDDEN RADIO: PASS", hidden.length);
}

{
  assert.equal(
    extractRadioSeedArtist({
      title: "Elevation Worshippers Radio",
      query: "Elevation Worshippers songs",
    }),
    "Elevation Worshippers"
  );
  console.log("SMART QUEUE primitives (shared normalize): PASS");
}

console.log("PASS radio catalog discovery");
