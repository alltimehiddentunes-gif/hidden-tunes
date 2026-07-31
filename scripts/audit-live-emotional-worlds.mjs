/**
 * Live Emotional Worlds audit against production API + Active matcher.
 * Run: npx tsx scripts/audit-live-emotional-worlds.mjs
 */
import {
  songMatchesMoodLabel,
} from "../utils/moodRooms.ts";
import {
  matchSongsForCatalogTarget,
  buildCatalogTarget,
} from "../utils/catalogResolver.ts";
import { EMOTIONAL_DISCOVERY_SHORTCUTS } from "../utils/emotionalDiscoveryShortcuts.ts";

async function loadAll() {
  const all = [];
  for (let p = 1; p <= 40; p += 1) {
    const r = await fetch(`https://api.hiddentunes.com/api/songs?page=${p}&limit=50`);
    const j = await r.json();
    const items = Array.isArray(j) ? j : j.data || j.songs || [];
    if (!items.length) break;
    all.push(
      ...items.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist || s.artist_name,
        genre: s.genre,
        mood: s.mood,
        moodGenre: s.moodGenre || s.mood_genre,
        tags: s.tags,
        emotion: s.emotion,
      }))
    );
  }
  return all;
}

const songs = await loadAll();
console.log("LOADED", songs.length);
console.log("WITH_MOOD", songs.filter((s) => s.mood).length);

const heartbreakSample =
  songs.find((s) => String(s.mood || "").toLowerCase().includes("heartbreak")) ||
  songs[0];
console.log("HEARTBREAK_SAMPLE", JSON.stringify(heartbreakSample, null, 2));

for (const room of EMOTIONAL_DISCOVERY_SHORTCUTS) {
  const target = buildCatalogTarget({
    type: "mood",
    title: room.title,
    query: room.query,
    id: room.id,
  });
  const matched = matchSongsForCatalogTarget(songs, target);
  const direct = songs.filter((s) => songMatchesMoodLabel(s, room.title)).length;
  console.log(
    JSON.stringify({
      room: room.title,
      labels: target.labels,
      matched: matched.length,
      directTitleMatch: direct,
      first: matched.slice(0, 2).map((s) => ({
        title: s.title,
        mood: s.mood,
        genre: s.genre,
      })),
    })
  );
}
