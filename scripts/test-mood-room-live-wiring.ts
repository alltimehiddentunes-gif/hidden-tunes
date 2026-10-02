/**
 * Live Mood Room wiring probe — uses discovery against a real API catalog when available,
 * otherwise proves the integration contract with a production-shaped mood label.
 */
import assert from "node:assert/strict";

import {
  normalizeDiscoveryConcepts,
  selectMoodCatalogCandidates,
} from "../services/radioCatalogDiscovery";

const label = "Worship,praise,inspiration,intimacy";
const afroLabel = "Afro,Party,Chill";

const concepts = normalizeDiscoveryConcepts(label);
console.log("NORMALIZED_MOOD_TOKENS:", concepts);
assert.ok(concepts.includes("worship"));
assert.ok(concepts.includes("praise"));
assert.ok(concepts.includes("inspiration") || concepts.includes("inspirational"));
assert.ok(concepts.includes("intimacy") || concepts.includes("intimate"));

const apiBase =
  process.env.EXPO_PUBLIC_HIDDEN_TUNES_API_URL ||
  process.env.HIDDEN_TUNES_API_BASE_URL ||
  "https://api.hiddentunes.com";

async function tryRealCatalog(): Promise<void> {
  if (!apiBase) {
    console.log("REAL_CATALOG_SIZE: (no API base in env — skipped live fetch)");
    console.log(
      "WHY_TEST_SAID_3_BUT_UI_0: fixture tests called selectMoodCatalogCandidates directly; live /genre used shallow hydrateHiddenTunesCatalogCache (~first page) so matchSongsForCatalogTarget saw too few songs and returned 0"
    );
    return;
  }

  const songs: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 30) {
    const url = `${apiBase.replace(/\/$/, "")}/api/songs?page=${page}&limit=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
    const json = await res.json();
    const batch = Array.isArray(json?.songs)
      ? json.songs
      : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json)
          ? json
          : [];
    songs.push(
      ...batch.map((song: any) => ({
        ...song,
        streamUrl: song.streamUrl || song.url || song.audioUrl || "https://example.com/x.mp3",
        isOnline: true,
      }))
    );
    hasMore = Boolean(json?.hasMore ?? batch.length === 100);
    page += 1;
    if (!batch.length) break;
  }

  console.log("REAL_CATALOG_SIZE:", songs.length);
  const matched = selectMoodCatalogCandidates(songs, label, 20);
  console.log("CANDIDATES_AFTER_MATCH:", matched.songs.length);
  console.log(
    "REAL_MATCHES:",
    matched.songs.slice(0, 8).map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      genre: song.genre,
      mood: song.mood,
    }))
  );
  const afro = selectMoodCatalogCandidates(songs, afroLabel, 20);
  console.log("AFRO_PARTY_CHILL_MATCHES:", afro.songs.length);
  assert.ok(
    matched.songs.length > 0 || songs.length === 0,
    "real catalog should yield worship-room matches when non-empty"
  );
}

void tryRealCatalog()
  .then(() => {
    console.log("PASS mood room live wiring probe");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
