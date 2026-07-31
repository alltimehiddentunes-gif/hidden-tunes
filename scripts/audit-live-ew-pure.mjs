/**
 * Pure live audit — no RN imports.
 * Reimplements Active moodRooms + catalogResolver mood matching.
 */
const PREMIUM_MOOD_ROOMS = [
  { id: "late-night", title: "Late Night", aliases: ["late night","midnight","midnight soul","late night jazz","night","after hours"] },
  { id: "healing", title: "Healing", aliases: ["healing","healing music","recovery","restorative","spiritual calm","anxiety relief"] },
  { id: "party-energy", title: "Party Energy", aliases: ["party","party energy","energy","dance","club","movement","sunset drive"] },
  { id: "focus", title: "Focus", aliases: ["focus","focus flow","concentration","study","work","deep work"] },
  { id: "romantic", title: "Romantic", aliases: ["romantic","romance","love","soft intimacy","intimate","warm vintage"] },
  { id: "heartbreak", title: "Heartbreak", aliases: ["heartbreak","heartbreak soul","breakup","sad","lonely roads","deep reflection"] },
  { id: "calm", title: "Calm", aliases: ["calm","peaceful","relax","slow burn","rainy night blues","emotional piano"] },
  { id: "nostalgic", title: "Nostalgic", aliases: ["nostalgic","nostalgia","memory","vintage","throwback","retro"] },
];

const SHORTCUTS = [
  ["Heartbreak", "heartbreak emotional music", "heartbreak"],
  ["Healing", "healing calm music", "healing"],
  ["Late Night", "late night mood music", "late-night"],
  ["Focus", "focus concentration music", "focus"],
  ["Party Energy", "party energy dance music", "party-energy"],
  ["Romantic", "romantic love songs", "romantic"],
  ["Nostalgic", "nostalgic throwback music", "nostalgic"],
  ["Calm", "calm relaxing music", "calm"],
  ["Deep Feelings", "deep emotional music", "deep-feelings"],
  ["Hidden Gems", "hidden gems underrated songs", "hidden-gems"],
];

const HIDDEN = new Set(["", "mood unknown", "unknown", "unknown mood", "none", "untagged"]);

function collapseSpaces(v){return String(v||"").replace(/\s+/g," ").trim()}
function normalizeMoodKey(v){return collapseSpaces(v).toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"")}

function moodValueMatchesDefinition(moodValue, definition) {
  const moodKey = normalizeMoodKey(moodValue);
  if (!moodKey || HIDDEN.has(moodKey)) return false;
  const aliasKeys = definition.aliases.map(normalizeMoodKey);
  if (aliasKeys.includes(moodKey)) return true;
  const titleKey = normalizeMoodKey(definition.title);
  if (moodKey === titleKey) return true;
  return aliasKeys.some((aliasKey) => {
    if (!aliasKey || aliasKey.length < 4) return moodKey === aliasKey;
    return moodKey.includes(aliasKey) || aliasKey.includes(moodKey);
  });
}

function normalizeMoodName(value) {
  const cleaned = collapseSpaces(String(value || ""));
  if (!cleaned) return "";
  const key = normalizeMoodKey(cleaned);
  if (HIDDEN.has(key)) return "";
  const premium = PREMIUM_MOOD_ROOMS.find((room) => moodValueMatchesDefinition(cleaned, room));
  if (premium) return premium.title;
  return cleaned.split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" ");
}

function collectSongMoodTokens(song) {
  const tokens = [];
  for (const value of [song.mood, song.moodGenre]) {
    const raw = collapseSpaces(String(value || ""));
    if (!raw) continue;
    if (raw.includes(",")) {
      raw.split(",").forEach((part) => tokens.push(collapseSpaces(part)));
      continue;
    }
    tokens.push(raw);
  }
  return tokens.filter(Boolean);
}

function songMatchesMoodLabel(song, label) {
  const targetTitle = normalizeMoodName(label);
  if (!targetTitle) return false;
  const premium = PREMIUM_MOOD_ROOMS.find((room) => room.title === targetTitle);
  if (premium) {
    return collectSongMoodTokens(song).some((token) => moodValueMatchesDefinition(token, premium));
  }
  return collectSongMoodTokens(song).some((token) => normalizeMoodName(token) === targetTitle);
}

function buildCatalogTarget(title, query, id) {
  const labels = [...new Set([title, query, id, title].filter(Boolean))];
  return { type: "mood", title, query, id, labels };
}

function matchSongs(songs, target) {
  const seen = new Set();
  const matches = [];
  for (const label of target.labels) {
    for (const song of songs) {
      if (!songMatchesMoodLabel(song, label)) continue;
      const key = String(song.id || "").toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      matches.push(song);
    }
  }
  return matches;
}

async function loadAll() {
  const all = [];
  for (let p = 1; p <= 40; p++) {
    const r = await fetch(`https://api.hiddentunes.com/api/songs?page=${p}&limit=50`);
    const j = await r.json();
    const items = Array.isArray(j) ? j : j.data || j.songs || [];
    if (!items.length) break;
    all.push(...items);
  }
  return all;
}

const songs = await loadAll();
const withStream = songs.filter(s => s.streamUrl || s.stream_url || s.audio_url || s.url || s.audioUrl);
console.log(JSON.stringify({
  loaded: songs.length,
  withMood: songs.filter(s => s.mood).length,
  withStream: withStream.length,
  sampleKeys: Object.keys(songs[0] || {}),
  heartbreakSample: songs.find(s => String(s.mood||"").toLowerCase().includes("heartbreak"))
}, null, 2));

for (const [title, query, id] of SHORTCUTS) {
  const target = buildCatalogTarget(title, query, id);
  const matched = matchSongs(withStream, target);
  // Deep Feelings / Hidden Gems custom path simulation
  let custom = 0;
  if (!PREMIUM_MOOD_ROOMS.some(r => r.title === title)) {
    custom = withStream.filter(s => songMatchesMoodLabel(s, title)).length;
  }
  console.log(JSON.stringify({
    room: title,
    labels: target.labels,
    matched: matched.length,
    customDirect: custom,
    tokensExample: matched[0] ? collectSongMoodTokens(matched[0]).slice(0, 8) : [],
    firstMood: matched[0]?.mood || null,
  }));
}
