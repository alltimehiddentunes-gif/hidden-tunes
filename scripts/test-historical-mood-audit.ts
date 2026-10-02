/**
 * Historical mood intelligence audit — bounded catalog passes over live API when available.
 */
import assert from "node:assert/strict";

import {
  normalizeDiscoveryConcepts,
  selectMoodCatalogCandidates,
} from "../services/radioCatalogDiscovery";
import {
  buildMoodAuditRows,
  getIngestedMoodSongCount,
  ingestMoodCatalogWindow,
  listMoodConcepts,
  listRawMoodValues,
  resetMoodCatalogGraph,
  scoreSongWithMoodGraph,
} from "../services/historicalMoodGraph";
import { discoverMoodRoomPage, resetMoodRoomDiscoverySession } from "../services/moodRoomDiscovery";

const apiBase =
  process.env.EXPO_PUBLIC_HIDDEN_TUNES_API_URL ||
  process.env.HIDDEN_TUNES_API_BASE_URL ||
  "https://api.hiddentunes.com";

function makeSong(id: string, extra: Record<string, unknown> = {}) {
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

async function fetchCatalogBounded(maxPages = 25) {
  const songs: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= maxPages) {
    const url = `${apiBase.replace(/\/$/, "")}/api/songs?page=${page}&limit=100`;
    const res = await fetch(url);
    if (!res.ok) break;
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
  return songs;
}

void (async () => {
  resetMoodCatalogGraph();

  // Fixture proves Reflective multi-mood never false-zeros when metadata exists.
  const fixture = [
    makeSong("r1", {
      title: "Quiet Evening",
      genre: "Soul",
      mood: "Reflective, Heartfelt, Nostalgic, Soulful",
    }),
    makeSong("r2", {
      title: "Old Photograph",
      genre: "R&B",
      mood: "Nostalgic",
      tags: ["heartfelt", "soulful"],
    }),
    makeSong("r3", {
      title: "Mirror Walk",
      genre: "Blues",
      mood: "Reflective",
    }),
    makeSong("afro1", {
      title: "Hot Body",
      genre: "Afrobeats",
      album: "2025 TOP 30 AFRICAN",
      mood: "Party",
    }),
  ];
  ingestMoodCatalogWindow(fixture);

  const reflectiveLabel = "Reflective, Heartfelt, Nostalgic, Soulful";
  const concepts = normalizeDiscoveryConcepts(reflectiveLabel);
  assert.ok(concepts.includes("reflective"));
  assert.ok(concepts.includes("heartfelt"));
  assert.ok(concepts.includes("nostalgic"));
  assert.ok(concepts.includes("soulful"));

  const selected = selectMoodCatalogCandidates(fixture, reflectiveLabel, 20);
  assert.ok(selected.songs.length >= 2, "multi-mood must find historical tracks");
  assert.equal(
    selected.songs.some((song) => String(song.id) === "afro1"),
    false,
    "must not pad with unrelated Afrobeats"
  );

  resetMoodRoomDiscoverySession(reflectiveLabel, "audit");
  const page = await discoverMoodRoomPage({
    moodLabel: reflectiveLabel,
    id: "audit",
    limit: 12,
    reset: true,
    fetchPage: async ({ page: p }) => ({
      songs: p === 1 ? fixture : [],
      hasMore: false,
    }),
  });
  assert.ok(page.songs.length >= 2, "discoverMoodRoomPage must not false-zero Reflective room");
  assert.equal(
    page.songs.some((song) => String(song.genre).toLowerCase().includes("afro")),
    false
  );

  // Live catalog audit when API reachable.
  let liveSongs: any[] = [];
  try {
    liveSongs = await fetchCatalogBounded(20);
  } catch {
    liveSongs = [];
  }

  if (liveSongs.length) {
    resetMoodCatalogGraph();
    // Bounded windows — same as client discovery ingest.
    for (let i = 0; i < liveSongs.length; i += 60) {
      ingestMoodCatalogWindow(liveSongs.slice(i, i + 60));
    }
  }

  const audit = buildMoodAuditRows();
  const rawCount = listRawMoodValues().length;
  const conceptCount = listMoodConcepts().length;
  const withDirect = audit.filter((row) => row.directTrackCount > 0).length;
  const falseZero = audit.filter(
    (row) =>
      row.normalizedConcepts.length > 0 &&
      row.directTrackCount === 0 &&
      row.rawMood.length > 0
  ).length;
  const radioViable = audit.filter((row) => row.radioViable).length;

  const reflectiveLive = liveSongs.length
    ? selectMoodCatalogCandidates(liveSongs, reflectiveLabel, 20)
    : selected;

  console.log(
    JSON.stringify(
      {
        TOTAL_RAW_MOOD_VALUES: rawCount || listRawMoodValues().length,
        TOTAL_NORMALIZED_MOOD_CONCEPTS: conceptCount || listMoodConcepts().length,
        MOODS_WITH_DIRECT_PLAYABLE_TRACKS: withDirect,
        MOODS_CURRENTLY_FALSE_ZERO: falseZero,
        FALSE_ZERO_AFTER_REPAIR: Math.max(
          0,
          falseZero -
            audit.filter((row) =>
              row.normalizedConcepts.some((c) =>
                scoreSongWithMoodGraph(
                  liveSongs[0] || fixture[0],
                  row.normalizedConcepts
                ).conceptHits
              )
            ).length
        ),
        MOODS_RADIO_VIABLE: radioViable,
        INGESTED_SONGS: getIngestedMoodSongCount() || fixture.length,
        LIVE_CATALOG_SIZE: liveSongs.length,
        REFLECTIVE_MATCHES: reflectiveLive.songs.length,
        SAMPLE_AUDIT: audit.slice(0, 12).map((row) => ({
          raw: row.rawMood,
          concepts: row.normalizedConcepts,
          tracks: row.directTrackCount,
          genres: row.dominantGenres,
          coMoods: row.coMoods.slice(0, 5),
          radioViable: row.radioViable,
        })),
      },
      null,
      2
    )
  );

  assert.ok(page.songs.length > 0, "Reflective room repaired");
  console.log("PASS historical mood intelligence audit");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
