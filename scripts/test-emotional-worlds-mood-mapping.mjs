/**
 * Emotional Worlds mood-room catalog mapping audit (no RN imports).
 * Run: node scripts/test-emotional-worlds-mood-mapping.mjs
 *
 * Exact rooms from utils/emotionalDiscoveryShortcuts.ts + utils/moodRooms.ts:
 * Heartbreak, Healing, Late Night, Focus, Party Energy, Romantic,
 * Nostalgic, Calm, Deep Feelings, Hidden Gems
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const MOOD_TAGS = [
  "Midnight Soul",
  "Healing Music",
  "Rainy Night Blues",
  "Deep Reflection",
  "Lonely Roads",
  "Soft Intimacy",
  "Heartbreak Soul",
  "Spiritual Calm",
  "Dark Atmosphere",
  "Warm Vintage",
  "Sunset Drive",
  "Slow Burn",
  "Emotional Piano",
  "Cinematic Darkness",
  "Anxiety Relief",
  "Focus Flow",
  "Late Night Jazz",
  "Sacred Voices",
];

const SHORTCUTS = [
  { id: "heartbreak", title: "Heartbreak", query: "heartbreak emotional music" },
  { id: "healing", title: "Healing", query: "healing calm music" },
  { id: "late-night", title: "Late Night", query: "late night mood music" },
  { id: "focus", title: "Focus", query: "focus concentration music" },
  { id: "party-energy", title: "Party Energy", query: "party energy dance music" },
  { id: "romantic", title: "Romantic", query: "romantic love songs" },
  { id: "nostalgic", title: "Nostalgic", query: "nostalgic throwback music" },
  { id: "calm", title: "Calm", query: "calm relaxing music" },
  { id: "deep-feelings", title: "Deep Feelings", query: "deep emotional music" },
  { id: "hidden-gems", title: "Hidden Gems", query: "hidden gems underrated songs" },
];

const PREMIUM = [
  {
    id: "late-night",
    title: "Late Night",
    aliases: ["late night", "midnight", "midnight soul", "late night jazz", "night", "after hours"],
  },
  {
    id: "healing",
    title: "Healing",
    aliases: ["healing", "healing music", "recovery", "restorative", "spiritual calm", "anxiety relief"],
  },
  {
    id: "party-energy",
    title: "Party Energy",
    aliases: ["party", "party energy", "energy", "dance", "club", "movement", "sunset drive"],
  },
  {
    id: "focus",
    title: "Focus",
    aliases: ["focus", "focus flow", "concentration", "study", "work", "deep work"],
  },
  {
    id: "romantic",
    title: "Romantic",
    aliases: ["romantic", "romance", "love", "soft intimacy", "intimate", "warm vintage"],
  },
  {
    id: "heartbreak",
    title: "Heartbreak",
    aliases: ["heartbreak", "heartbreak soul", "breakup", "sad", "lonely roads"],
  },
  {
    id: "calm",
    title: "Calm",
    aliases: ["calm", "peaceful", "relax", "slow burn", "rainy night blues", "emotional piano"],
  },
  {
    id: "nostalgic",
    title: "Nostalgic",
    aliases: ["nostalgic", "nostalgia", "memory", "vintage", "throwback", "retro"],
  },
  {
    id: "deep-feelings",
    title: "Deep Feelings",
    aliases: [
      "deep feelings",
      "deep reflection",
      "deep emotional",
      "emotional",
      "cinematic darkness",
      "dark atmosphere",
    ],
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    aliases: ["hidden gems", "hidden gem", "underrated", "rare finds", "deep cuts"],
  },
];

function normalizeMoodKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseSpaces(value) {
  return value.replace(/\s+/g, " ").trim();
}

function readSource(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function run(name, fn) {
  fn();
  console.log(`OK ${name}`);
}

const LAYER3_KEYS = new Set(MOOD_TAGS.map(normalizeMoodKey));

function exactAliasKeys(room) {
  return [room.title, ...room.aliases].map(normalizeMoodKey).filter(Boolean);
}

function isAssignmentToken(value) {
  const key = normalizeMoodKey(value);
  if (!key) return false;
  if (LAYER3_KEYS.has(key)) return true;
  return PREMIUM.some((room) => exactAliasKeys(room).includes(key));
}

function moodValueMatches(value, room) {
  const moodKey = normalizeMoodKey(value);
  if (!moodKey) return false;
  const aliasKeys = room.aliases.map(normalizeMoodKey);
  if (aliasKeys.includes(moodKey) || moodKey === normalizeMoodKey(room.title)) {
    return true;
  }
  return aliasKeys.some((aliasKey) => {
    if (!aliasKey || aliasKey.length < 4) return moodKey === aliasKey;
    return moodKey.includes(aliasKey) || aliasKey.includes(moodKey);
  });
}

function collectTokens(song) {
  const tokens = [];
  const seen = new Set();
  const push = (value, requireAssignment) => {
    const raw = collapseSpaces(String(value || ""));
    if (!raw) return;
    if (requireAssignment && !isAssignmentToken(raw)) return;
    const key = normalizeMoodKey(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    tokens.push(raw);
  };

  [song.mood, song.moodGenre, song.emotion].forEach((value) => push(value, false));
  [song.genre].forEach((value) => push(value, true));
  if (Array.isArray(song.tags)) {
    song.tags.forEach((tag) => push(tag, true));
  } else if (song.tags) {
    push(song.tags, true);
  }
  return tokens;
}

function songMatchesMoodLabel(song, label) {
  const room = PREMIUM.find((item) => item.title === label);
  if (!room) return false;
  return collectTokens(song).some((token) => moodValueMatches(token, room));
}

function matchSource(song, roomTitle) {
  const room = PREMIUM.find((item) => item.title === roomTitle);
  if (!room) return null;
  const checks = [
    ["mood", song.mood],
    ["moodGenre", song.moodGenre],
    ["genre", song.genre],
  ];
  for (const [source, value] of checks) {
    const raw = collapseSpaces(String(value || ""));
    if (!raw) continue;
    if (source !== "mood" && source !== "moodGenre" && !isAssignmentToken(raw)) {
      continue;
    }
    if (moodValueMatches(raw, room)) return source;
  }
  if (Array.isArray(song.tags)) {
    for (const tag of song.tags) {
      const raw = collapseSpaces(String(tag || ""));
      if (!raw || !isAssignmentToken(raw)) continue;
      if (moodValueMatches(raw, room)) return "tags";
    }
  }
  return null;
}

const songs = [
  { id: "heartbreak-genre", title: "Cry", genre: "Heartbreak Soul" },
  { id: "healing-genre", title: "Heal", genre: "Healing Music" },
  { id: "late-night-genre", title: "Midnight", genre: "Late Night Jazz" },
  { id: "party-genre", title: "Party", genre: "Sunset Drive" },
  { id: "focus-genre", title: "Study", genre: "Focus Flow" },
  { id: "romantic-genre", title: "Love", genre: "Soft Intimacy" },
  { id: "nostalgic-mood", title: "Throwback", mood: "Nostalgic" },
  { id: "calm-genre", title: "Rain", genre: "Rainy Night Blues" },
  { id: "deep-feelings-tags", title: "Deep", tags: ["Deep Feelings"] },
  { id: "hidden-gems-genre", title: "Gem", genre: "Hidden Gems" },
  { id: "deep-reflection-genre", title: "Reflect", genre: "Deep Reflection" },
  { id: "ordinary-genre", title: "Afro Hit", genre: "Afrobeats" },
  { id: "ordinary-soul", title: "Soul Cut", genre: "Soul" },
  { id: "mood-field", title: "Feel", mood: "Deep Feelings" },
  { id: "warm-vintage", title: "Memory", genre: "Warm Vintage" },
];

run("source: mood tokens include Layer-3 genre/tags assignments", () => {
  const source = readSource("utils/moodRooms.ts");
  assert.match(source, /getMoodTags/);
  assert.match(source, /song\.genre/);
  assert.match(source, /song\.tags/);
  assert.match(source, /isCatalogMoodAssignmentToken/);
  assert.match(source, /id:\s*"deep-feelings"/);
  assert.match(source, /id:\s*"hidden-gems"/);
  assert.doesNotMatch(source, /const values = \[song\.mood, song\.moodGenre\];/);
});

run("source: mood catalog targets use room title, not search query", () => {
  const source = readSource("utils/catalogResolver.ts");
  assert.match(source, /type === "mood"/);
  assert.match(source, /\[title, rawTitle, id\]/);
  assert.match(
    source,
    /filterSongsByCatalogLabel\(songs, target\.title, "mood"\)/
  );
});

run("source: Emotional Worlds shortcuts map to /genre mood rooms", () => {
  const chips = readSource("components/EmotionalDiscoveryChips.tsx");
  const nav = readSource("utils/catalogNavigation.ts");
  const shortcuts = readSource("utils/emotionalDiscoveryShortcuts.ts");
  assert.match(chips, /openMoodCatalog/);
  assert.match(nav, /type:\s*"mood"/);
  for (const room of SHORTCUTS) {
    assert.match(shortcuts, new RegExp(`id:\\s*"${room.id}"`));
    assert.match(shortcuts, new RegExp(`title:\\s*"${room.title}"`));
  }
});

run("all ten project rooms exist with stable ids", () => {
  assert.equal(SHORTCUTS.length, 10);
  assert.equal(PREMIUM.length, 10);
  for (const room of SHORTCUTS) {
    assert.ok(
      PREMIUM.some((item) => item.id === room.id && item.title === room.title),
      `missing premium room ${room.id}`
    );
  }
});

const results = SHORTCUTS.map((room) => {
  const matched = songs.filter((song) => songMatchesMoodLabel(song, room.title));
  const ids = matched.map((song) => song.id);
  const unique = new Set(ids);
  return {
    room: room.title,
    id: room.id,
    query: room.query,
    roomExists: PREMIUM.some((item) => item.id === room.id),
    matchedCount: matched.length,
    duplicateIds: ids.length - unique.size,
    matchedIds: ids,
    sources: matched.map((song) => matchSource(song, room.title)),
  };
});

const sourceCounts = { mood: 0, moodGenre: 0, genre: 0, tags: 0 };
for (const row of results) {
  for (const source of row.sources) {
    if (source && sourceCounts[source] != null) sourceCounts[source] += 1;
  }
}

const ordinaryRejected =
  !songMatchesMoodLabel({ id: "ordinary-genre", genre: "Afrobeats" }, "Heartbreak") &&
  !songMatchesMoodLabel({ id: "ordinary-soul", genre: "Soul" }, "Heartbreak") &&
  !SHORTCUTS.some((room) =>
    songMatchesMoodLabel({ id: "ordinary-genre", genre: "Afrobeats" }, room.title)
  );

run("Layer-3 genre/tags fixtures populate rooms", () => {
  assert.ok(songMatchesMoodLabel({ genre: "Heartbreak Soul" }, "Heartbreak"));
  assert.ok(songMatchesMoodLabel({ tags: ["Deep Feelings"] }, "Deep Feelings"));
  assert.ok(songMatchesMoodLabel({ genre: "Hidden Gems" }, "Hidden Gems"));
  assert.ok(songMatchesMoodLabel({ genre: "Healing Music" }, "Healing"));
  assert.ok(songMatchesMoodLabel({ genre: "Late Night Jazz" }, "Late Night"));
});

run("ordinary genres do not become arbitrary moods", () => {
  assert.equal(ordinaryRejected, true);
  assert.equal(songMatchesMoodLabel({ genre: "Afrobeats" }, "Heartbreak"), false);
  assert.equal(songMatchesMoodLabel({ genre: "Soul" }, "Heartbreak"), false);
});

run("matching uses canonical room title, not search query", () => {
  for (const room of SHORTCUTS) {
    const byTitle = songs.filter((song) => songMatchesMoodLabel(song, room.title));
    assert.ok(byTitle.length > 0, `${room.title} should match via title`);
    // Noisy query must not be required; title matching is the contract.
    assert.notEqual(room.query, room.title);
  }
});

run("every room returns songs with zero duplicate ids", () => {
  for (const row of results) {
    assert.ok(row.roomExists, `${row.room} missing`);
    assert.ok(row.matchedCount > 0, `${row.room} expected songs, got 0`);
    assert.equal(row.duplicateIds, 0, `${row.room} has duplicate ids`);
  }
});

console.log("\nMood Room audit table");
console.log(
  "| Room | Fixture matches | Duplicate IDs | Status |"
);
console.log("| --- | ---: | ---: | --- |");
for (const row of results) {
  const status =
    row.roomExists && row.matchedCount > 0 && row.duplicateIds === 0
      ? "PASS"
      : "FAIL";
  console.log(
    `| ${row.room} | ${row.matchedCount} | ${row.duplicateIds} | ${status} |`
  );
}

console.log("\nMatch source counts:", sourceCounts);
console.log("Ordinary genres correctly rejected:", ordinaryRejected);
console.log("Emotional Worlds mood mapping audit passed.");
