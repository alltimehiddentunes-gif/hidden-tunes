/**
 * Emotional Worlds mood-room catalog mapping audit (no RN imports).
 * Run: node scripts/test-emotional-worlds-mood-mapping.mjs
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
  { id: "heartbreak", title: "Heartbreak" },
  { id: "healing", title: "Healing" },
  { id: "late-night", title: "Late Night" },
  { id: "focus", title: "Focus" },
  { id: "party-energy", title: "Party Energy" },
  { id: "romantic", title: "Romantic" },
  { id: "nostalgic", title: "Nostalgic" },
  { id: "calm", title: "Calm" },
  { id: "deep-feelings", title: "Deep Feelings" },
  { id: "hidden-gems", title: "Hidden Gems" },
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

run("source: mood tokens include Layer-3 genre assignments", () => {
  const source = readSource("utils/moodRooms.ts");
  assert.match(source, /getMoodTags/);
  assert.match(source, /song\.genre/);
  assert.match(source, /isCatalogMoodAssignmentToken/);
  assert.match(source, /id:\s*"deep-feelings"/);
  assert.match(source, /id:\s*"hidden-gems"/);
  assert.doesNotMatch(
    source,
    /const values = \[song\.mood, song\.moodGenre\];/
  );
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

run("source: Emotional Worlds shortcuts still map to /genre mood rooms", () => {
  const chips = readSource("components/EmotionalDiscoveryChips.tsx");
  const nav = readSource("utils/catalogNavigation.ts");
  const shortcuts = readSource("utils/emotionalDiscoveryShortcuts.ts");
  assert.match(chips, /openMoodCatalog/);
  assert.match(nav, /type:\s*"mood"/);
  for (const room of SHORTCUTS) {
    assert.match(shortcuts, new RegExp(`id:\\s*"${room.id}"`));
  }
});

// Mirror the fixed matching rules closely enough to prove room population.
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
    aliases: ["deep feelings", "deep reflection", "deep emotional", "emotional", "cinematic darkness", "dark atmosphere"],
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    aliases: ["hidden gems", "hidden gem", "underrated", "rare finds", "deep cuts"],
  },
];

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
  if (aliasKeys.includes(moodKey) || moodKey === normalizeMoodKey(room.title)) return true;
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
  return tokens;
}

function songMatchesMoodLabel(song, label) {
  const room = PREMIUM.find((item) => item.title === label);
  if (!room) return false;
  return collectTokens(song).some((token) => moodValueMatches(token, room));
}

const songs = [
  { id: "1", title: "Cry", genre: "Heartbreak Soul" },
  { id: "2", title: "Heal", genre: "Healing Music" },
  { id: "3", title: "Midnight", genre: "Late Night Jazz" },
  { id: "4", title: "Party", genre: "Sunset Drive" },
  { id: "5", title: "Study", genre: "Focus Flow" },
  { id: "6", title: "Love", genre: "Soft Intimacy" },
  { id: "7", title: "Memory", genre: "Warm Vintage" },
  { id: "8", title: "Rain", genre: "Rainy Night Blues" },
  { id: "9", title: "Deep", genre: "Deep Reflection" },
  { id: "10", title: "Gem", genre: "Indie", mood: "Hidden Gems" },
  { id: "11", title: "Soul", genre: "Soul", mood: "Emotional" },
  { id: "12", title: "Feel", mood: "Deep Feelings" },
  { id: "13", title: "Throwback", mood: "Nostalgic" },
];

const results = SHORTCUTS.map((room) => {
  const matched = songs.filter((song) => songMatchesMoodLabel(song, room.title));
  return {
    room: room.title,
    id: room.id,
    roomExists: PREMIUM.some((item) => item.id === room.id),
    matchedCount: matched.length,
    matchedIds: matched.map((song) => song.id),
  };
});

console.log(JSON.stringify(results, null, 2));

run("core genre Soul does not falsely fill Heartbreak", () => {
  assert.equal(songMatchesMoodLabel({ genre: "Soul" }, "Heartbreak"), false);
});

run("Layer-3 genre tags populate Emotional Worlds rooms", () => {
  assert.ok(songMatchesMoodLabel({ genre: "Heartbreak Soul" }, "Heartbreak"));
  assert.ok(songMatchesMoodLabel({ genre: "Healing Music" }, "Healing"));
  assert.ok(songMatchesMoodLabel({ genre: "Late Night Jazz" }, "Late Night"));
  assert.ok(songMatchesMoodLabel({ genre: "Focus Flow" }, "Focus"));
  assert.ok(songMatchesMoodLabel({ genre: "Sunset Drive" }, "Party Energy"));
  assert.ok(songMatchesMoodLabel({ genre: "Soft Intimacy" }, "Romantic"));
  assert.ok(songMatchesMoodLabel({ genre: "Rainy Night Blues" }, "Calm"));
  assert.ok(songMatchesMoodLabel({ genre: "Deep Reflection" }, "Deep Feelings"));
});

run("every Emotional World returns songs from fixtures", () => {
  for (const row of results) {
    assert.ok(row.roomExists, `${row.room} missing room definition`);
    assert.ok(
      row.matchedCount > 0,
      `${row.room} expected songs, got 0`
    );
  }
});

console.log("Emotional Worlds mood mapping audit passed.");
