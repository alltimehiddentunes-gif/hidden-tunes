/**
 * Historical mood intelligence graph — learned from real catalog metadata.
 * FULL CATALOG ACCESS via bounded ingest windows; never requires full catalog in React.
 *
 * Does NOT rewrite source metadata. Builds normalized concept associations only.
 */

import {
  DISCOVERY_SCORE,
  normalizeDiscoveryConcepts,
  splitDiscoveryConcepts,
  scoreSongAgainstConcepts,
  type RadioDiscoverySong,
} from "./radioCatalogDiscovery";
import {
  bumpMoodDiscoveryPerf,
  indexMoodTrackIfChanged,
} from "./moodDiscoveryIndex";

export type MoodConceptStats = {
  concept: string;
  rawValues: Set<string>;
  trackIds: Set<string>;
  artists: Map<string, number>;
  genres: Map<string, number>;
  albums: Map<string, number>;
  coMoods: Map<string, number>;
  tags: Map<string, number>;
  playableCount: number;
};

export type MoodAuditRow = {
  rawMood: string;
  normalizedConcepts: string[];
  directTrackCount: number;
  artistCount: number;
  dominantGenres: string[];
  coMoods: string[];
  playableCount: number;
  radioViable: boolean;
};

const concepts = new Map<string, MoodConceptStats>();
const rawMoodValues = new Set<string>();
let ingestedSongCount = 0;
let graphGeneration = 0;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function bump(map: Map<string, number>, key: string, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
}

function ensureConcept(concept: string): MoodConceptStats {
  let row = concepts.get(concept);
  if (!row) {
    row = {
      concept,
      rawValues: new Set(),
      trackIds: new Set(),
      artists: new Map(),
      genres: new Map(),
      albums: new Map(),
      coMoods: new Map(),
      tags: new Map(),
      playableCount: 0,
    };
    concepts.set(concept, row);
  }
  return row;
}

function extractRawMoodValues(song: RadioDiscoverySong): string[] {
  const values: string[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const raw = text(value);
    if (!raw) return;
    values.push(raw);
    rawMoodValues.add(raw);
  };
  push(song.mood);
  push((song as { moods?: unknown }).moods);
  push(song.moodGenre);
  push(song.emotion);
  push(song.tags);
  push((song as { vibe?: unknown }).vibe);
  push((song as { vibes?: unknown }).vibes);
  push((song as { subgenre?: unknown }).subgenre);
  return values;
}

/** Ingest a bounded catalog window into the mood association graph. */
export function ingestMoodCatalogWindow(songs: RadioDiscoverySong[]) {
  if (!Array.isArray(songs) || !songs.length) return;
  let changed = 0;
  songs.forEach((song) => {
    const id = text(song.id);
    if (!id) return;
    // Skip unchanged tracks — normalize once per fingerprint.
    const indexed = indexMoodTrackIfChanged(song);
    if (!indexed) return;
    changed += 1;
    ingestedSongCount += 1;
    const playable = indexed.playable;
    const genre = text(song.genre).toLowerCase();
    const artist = indexed.artist;
    const album = text(song.album || song.album_title);
    const rawValues = extractRawMoodValues(song);
    const songConcepts = indexed.moods;
    const genreConcepts = indexed.genres;

    songConcepts.forEach((concept) => {
      const row = ensureConcept(concept);
      rawValues.forEach((raw) => row.rawValues.add(raw));
      row.trackIds.add(id);
      if (playable) row.playableCount += 1;
      if (artist) bump(row.artists, artist);
      if (genre) bump(row.genres, genre);
      if (album) bump(row.albums, album);
      songConcepts.forEach((other) => {
        if (other !== concept) bump(row.coMoods, other);
      });
      const tagList = Array.isArray(song.tags) ? song.tags : [song.tags];
      tagList.forEach((tag) => bump(row.tags, text(tag).toLowerCase()));
    });

    // Genre co-occurrence for mood concepts on this track.
    if (genreConcepts.length && songConcepts.length) {
      songConcepts.forEach((concept) => {
        const row = ensureConcept(concept);
        genreConcepts.forEach((g) => bump(row.genres, g));
      });
    }
  });
  if (changed > 0) {
    graphGeneration += 1;
    bumpMoodDiscoveryPerf("historicalGraphRebuilds");
  }
}

export function getMoodGraphGeneration() {
  return graphGeneration;
}

export function getIngestedMoodSongCount() {
  return ingestedSongCount;
}

export function getMoodConceptStats(concept: string): MoodConceptStats | null {
  return concepts.get(String(concept || "").trim().toLowerCase()) || null;
}

export function listMoodConcepts(): string[] {
  return Array.from(concepts.keys()).sort();
}

export function listRawMoodValues(): string[] {
  return Array.from(rawMoodValues.values()).sort((a, b) => a.localeCompare(b));
}

export function dominantGenresForConcepts(conceptList: string[], limit = 4): string[] {
  const weights = new Map<string, number>();
  conceptList.forEach((concept) => {
    const row = concepts.get(concept);
    if (!row) return;
    row.genres.forEach((count, genre) => bump(weights, genre, count));
  });
  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre]) => genre);
}

export function coMoodsForConcepts(conceptList: string[], limit = 8): string[] {
  const weights = new Map<string, number>();
  const seed = new Set(conceptList);
  conceptList.forEach((concept) => {
    const row = concepts.get(concept);
    if (!row) return;
    row.coMoods.forEach((count, other) => {
      if (seed.has(other)) return;
      bump(weights, other, count);
    });
  });
  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([mood]) => mood);
}

/**
 * Continuity score: mood concept hits + genre-anchor respect learned from catalog.
 */
export function scoreSongWithMoodGraph(
  song: RadioDiscoverySong,
  conceptList: string[]
): { score: number; signals: string[]; conceptHits: number; genreAnchor: boolean } {
  const base = scoreSongAgainstConcepts(song, conceptList);
  if (!conceptList.length) {
    return { score: 0, signals: [], conceptHits: 0, genreAnchor: false };
  }

  const conceptHits = conceptList.filter((concept) =>
    base.signals.some((signal) => signal.includes(concept))
  ).length;

  const dominant = dominantGenresForConcepts(conceptList, 6);
  const songGenre = text(song.genre).toLowerCase();
  const genreAnchor =
    dominant.length > 0 &&
    Boolean(
      songGenre &&
        dominant.some(
          (genre) =>
            songGenre === genre ||
            songGenre.includes(genre) ||
            genre.includes(songGenre)
        )
    );

  let score = base.score;
  // Multi-mood: more simultaneous concept hits rank higher (4 > 3 > 2 > 1).
  score += conceptHits * DISCOVERY_SCORE.phrase;
  if (genreAnchor) {
    score += DISCOVERY_SCORE.alias;
    base.signals.push(`genre-anchor:${songGenre}`);
  } else if (base.score > 0 && dominant.length > 0 && songGenre) {
    // Soft penalty only when we already know the mood's genre home and this conflicts hard.
    const conflict = !dominant.some(
      (genre) => songGenre.includes(genre) || genre.includes(songGenre)
    );
    if (conflict && conceptHits <= 1) {
      score = Math.max(1, score - DISCOVERY_SCORE.typo);
      base.signals.push(`genre-soft-mismatch:${songGenre}`);
    }
  }

  return {
    score,
    signals: Array.from(new Set(base.signals)),
    conceptHits,
    genreAnchor,
  };
}

export function buildMoodAuditRows(): MoodAuditRow[] {
  const byRaw = new Map<string, MoodAuditRow>();

  rawMoodValues.forEach((raw) => {
    const normalizedConcepts = normalizeDiscoveryConcepts(raw);
    const trackIds = new Set<string>();
    const artists = new Set<string>();
    const genreWeights = new Map<string, number>();
    const coWeights = new Map<string, number>();
    let playableCount = 0;

    normalizedConcepts.forEach((concept) => {
      const row = concepts.get(concept);
      if (!row) return;
      row.trackIds.forEach((id) => trackIds.add(id));
      row.artists.forEach((_n, artist) => artists.add(artist));
      row.genres.forEach((count, genre) => bump(genreWeights, genre, count));
      row.coMoods.forEach((count, mood) => bump(coWeights, mood, count));
      playableCount += row.playableCount;
    });

    byRaw.set(raw, {
      rawMood: raw,
      normalizedConcepts,
      directTrackCount: trackIds.size,
      artistCount: artists.size,
      dominantGenres: Array.from(genreWeights.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre]) => genre),
      coMoods: Array.from(coWeights.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([mood]) => mood),
      playableCount: Math.min(playableCount, trackIds.size || playableCount),
      radioViable: trackIds.size > 0,
    });
  });

  return Array.from(byRaw.values()).sort((a, b) =>
    b.directTrackCount !== a.directTrackCount
      ? b.directTrackCount - a.directTrackCount
      : a.rawMood.localeCompare(b.rawMood)
  );
}

export function resetMoodCatalogGraph() {
  concepts.clear();
  rawMoodValues.clear();
  ingestedSongCount = 0;
  graphGeneration += 1;
}

export function splitMoodRequestConcepts(label: unknown): string[] {
  return normalizeDiscoveryConcepts(label);
}

export function moodRequestHasKnownHistory(label: unknown): boolean {
  const list = splitMoodRequestConcepts(label);
  return list.some((concept) => (concepts.get(concept)?.trackIds.size || 0) > 0);
}
