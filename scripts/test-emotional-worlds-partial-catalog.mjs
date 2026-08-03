/**
 * Regression: partial first-page catalog must not be treated as complete for mood rooms.
 * Run: node scripts/test-emotional-worlds-partial-catalog.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readSource(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function normalizeMoodKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "");
}

function collapseSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const PREMIUM = [
  { title: "Heartbreak", aliases: ["heartbreak", "heartbreak soul", "breakup", "sad", "lonely roads"] },
  { title: "Healing", aliases: ["healing", "healing music", "recovery", "restorative"] },
  { title: "Late Night", aliases: ["late night", "midnight", "night", "after hours"] },
  { title: "Focus", aliases: ["focus", "focus flow", "concentration", "study", "deep work"] },
  { title: "Party Energy", aliases: ["party", "party energy", "energy", "dance", "club"] },
  { title: "Romantic", aliases: ["romantic", "romance", "love", "intimate"] },
  { title: "Nostalgic", aliases: ["nostalgic", "nostalgia", "memory", "vintage", "throwback"] },
  { title: "Calm", aliases: ["calm", "peaceful", "relax"] },
  {
    title: "Deep Feelings",
    aliases: ["deep feelings", "deep reflection", "emotional", "cinematic darkness"],
  },
  {
    title: "Hidden Gems",
    aliases: ["hidden gems", "underrated", "indie", "indie ballad", "underground"],
  },
];

function matchDef(val, def) {
  const k = normalizeMoodKey(val);
  if (!k) return false;
  const aks = def.aliases.map(normalizeMoodKey);
  if (aks.includes(k) || normalizeMoodKey(def.title) === k) return true;
  return aks.some((a) => {
    if (!a || a.length < 4) return k === a;
    return k.includes(a) || a.includes(k);
  });
}

function tokens(song) {
  const raw = collapseSpaces(song.mood);
  if (!raw) return [];
  if (raw.includes(",")) return raw.split(",").map(collapseSpaces).filter(Boolean);
  return [raw];
}

function matches(song, title) {
  const def = PREMIUM.find((r) => r.title === title);
  if (!def) return false;
  return tokens(song).some((t) => matchDef(t, def));
}

const FIRST_PAGE = [
  { id: "1", mood: "rap" },
  { id: "2", mood: "Vibes , Afro, Party" },
  { id: "3", mood: "Afro Hip Hop, vibe , Party" },
];

const DEEP = [
  ...FIRST_PAGE,
  { id: "10", mood: "Quiet Heartbreak, Slowly Healing" },
  { id: "11", mood: "Healing, Soft Loneliness" },
  { id: "12", mood: "Midnight Café, Night Reflection" },
  { id: "13", mood: "Deep Focus, study" },
  { id: "14", mood: "Campfire Romance, Intimate" },
  { id: "15", mood: "Warm Nostalgic Love, vintage" },
  { id: "16", mood: "Calm, Peaceful, relax" },
  { id: "17", mood: "emotional reflection, Deep Reflection" },
  { id: "18", mood: "indie, ballad" },
];

assert.equal(
  FIRST_PAGE.filter((s) => matches(s, "Heartbreak")).length,
  0,
  "first-page party/rap slice must yield 0 Heartbreak"
);

const deepCounts = {};
for (const room of PREMIUM) {
  deepCounts[room.title] = DEEP.filter((s) => matches(s, room.title)).length;
  assert.ok(
    deepCounts[room.title] > 0,
    `${room.title} must be >0 on deep free-text catalog`
  );
}

const apiSource = readSource("services/hiddenTunesApi.ts");
assert.match(apiSource, /FULL_CATALOG_TRUSTED_CACHE_MIN\s*=\s*1500/);
assert.match(apiSource, /allowCatalogPagination/);

const genreSource = readSource("app/genre.tsx");
assert.doesNotMatch(
  genreSource,
  /fetchHiddenTunesCatalog/,
  "genre rooms must never start a full catalog walk"
);
assert.match(
  genreSource,
  /(?:loadCatalogView|getInstantCatalogView)/,
  "genre rooms must use the bounded catalog view"
);
assert.match(
  genreSource,
  /onEndReached=\{loadMore\}/,
  "genre rooms must paginate incrementally"
);
assert.match(
  genreSource,
  /loadGenerationRef\.current \+= 1/,
  "blur/unmount must invalidate stale catalog responses"
);
assert.match(
  genreSource,
  /MAX_HELD_TRACKS = 150/,
  "genre room queues must remain bounded"
);

const unifiedCatalogSource = readSource("services/unifiedCatalog.ts");
assert.match(
  unifiedCatalogSource,
  /target\.type === "mood"[\s\S]{0,500}query: target\.query \|\| target\.title/,
  "mood rooms must use a bounded search fallback when genre filtering is empty"
);

const moodSource = readSource("utils/moodRooms.ts");
assert.match(moodSource, /indie/);

console.log("PASS emotional-worlds-partial-catalog", { deepCounts });
