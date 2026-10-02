/**
 * Shared Mood Room relevance — Explore / Room Detail / Start Radio / Auto-next.
 * Quality > artificial count. Never pad with unrelated playable tracks.
 */

import {
  DISCOVERY_SCORE,
  normalizeDiscoveryConcepts,
  scoreSongAgainstConcepts,
  selectMoodCatalogCandidates,
  type DiscoveryMatchKind,
  type RadioDiscoverySong,
} from "./radioCatalogDiscovery";

/** Initial room page: exact / strong / related-phrase only. Never random catalog. */
export const ROOM_INITIAL_RELEVANCE_MIN = DISCOVERY_SCORE.phrase;

/** Concepts too weak to define a room alone (cause cross-genre leakage). */
const ROOM_WEAK_CONCEPTS = new Set([
  "station",
  "room",
  "rooms",
  "listening",
  "home",
  "road",
  "guitar",
  "deep",
  "blue",
  "dance",
  "piano",
  "south",
  "africa",
  "heat",
  "log",
  "drum",
  "drums",
  "pulse",
  "soft",
  "quiet",
  "space",
  "focus",
  "bright",
  "movement",
  "rhythm",
  "late",
  "night",
  "chords",
  "lounge",
  "energy",
  "grit",
  "ache",
  "story",
  "open",
  "warmth",
  "session",
  "curated",
  "hidden",
  "tunes",
  "music",
]);

export type RoomRelevanceHit<T extends RadioDiscoverySong = RadioDiscoverySong> = {
  song: T;
  score: number;
  signals: string[];
  matchedConcepts: string[];
  reason: string;
};

export function normalizeRoomConcepts(input: {
  title?: string;
  id?: string;
  terms?: string[];
  query?: string;
}): string[] {
  const raw = [
    String(input.title || "").trim(),
    String(input.id || "").replace(/[-_]+/g, " ").trim(),
    String(input.query || "").trim(),
    ...(Array.isArray(input.terms) ? input.terms : []),
  ]
    .filter(Boolean)
    .join(" ");
  return normalizeDiscoveryConcepts(raw).filter(
    (concept) => concept && !ROOM_WEAK_CONCEPTS.has(concept)
  );
}

export function rankSongsForRoomRelevance<T extends RadioDiscoverySong>(
  songs: T[],
  input: {
    title?: string;
    id?: string;
    terms?: string[];
    query?: string;
    concepts?: string[];
    minScore?: number;
    limit?: number;
  }
): RoomRelevanceHit<T>[] {
  const concepts =
    input.concepts?.length
      ? input.concepts.filter((concept) => concept && !ROOM_WEAK_CONCEPTS.has(concept))
      : normalizeRoomConcepts(input);
  if (!concepts.length || !Array.isArray(songs) || !songs.length) return [];

  const minScore = Math.max(
    Number(input.minScore) || ROOM_INITIAL_RELEVANCE_MIN,
    ROOM_INITIAL_RELEVANCE_MIN
  );
  const limit = Math.min(Math.max(Number(input.limit) || 24, 1), 72);
  const queryTokenKinds = new Map<string, DiscoveryMatchKind>();
  concepts.forEach((concept) => queryTokenKinds.set(concept, "exact"));

  const hits: RoomRelevanceHit<T>[] = [];
  const seen = new Set<string>();

  for (const song of songs) {
    const id = String(song.id || "").trim();
    if (!id || seen.has(id)) continue;
    const scored = scoreSongAgainstConcepts(song, concepts, { queryTokenKinds });
    if (scored.score < minScore) continue;
    seen.add(id);
    const matchedConcepts = concepts.filter((concept) =>
      scored.signals.some((signal) => signal.includes(concept))
    );
    hits.push({
      song,
      score: scored.score,
      signals: scored.signals,
      matchedConcepts,
      reason:
        matchedConcepts.length > 0
          ? `matched:${matchedConcepts.join(",")}`
          : scored.signals[0] || `score:${scored.score}`,
    });
  }

  hits.sort((left, right) =>
    right.score !== left.score
      ? right.score - left.score
      : String(left.song.id || "").localeCompare(String(right.song.id || ""))
  );
  return hits.slice(0, limit);
}

/** Drop unrelated tracks from a stale session/cache before Room Detail paints. */
export function filterRelevantRoomTracks<T extends RadioDiscoverySong>(
  songs: T[],
  input: {
    title?: string;
    id?: string;
    terms?: string[];
    query?: string;
    type?: string;
    limit?: number;
    /** Hard genre lock — FILTER first, mood ranking second. */
    genreAnchor?: string;
  }
): T[] {
  if (!Array.isArray(songs) || !songs.length) return [];
  const type = String(input.type || "mood").toLowerCase();
  const label = String(input.title || input.query || "").trim();
  const genreAnchor = String(input.genreAnchor || "").trim();

  // Genre-anchored mood: never paint global mood cache into Country/Jazz rooms.
  const genreLocked = genreAnchor
    ? songs.filter((song) => {
        const songGenre = String(song.genre || "")
          .trim()
          .toLowerCase()
          .replace(/&/g, " and ")
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ");
        const anchor = genreAnchor
          .toLowerCase()
          .replace(/&/g, " and ")
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ");
        if (!songGenre || !anchor) return false;
        if (songGenre === anchor) return true;
        if (songGenre.includes(anchor) || anchor.includes(songGenre)) return true;
        const a = new Set(anchor.split(" ").filter((t) => t.length > 2));
        const b = songGenre.split(" ").filter((t) => t.length > 2);
        if (!a.size) return false;
        const hits = b.filter((t) => a.has(t)).length;
        return hits >= Math.min(a.size, 2) || (a.size === 1 && hits >= 1);
      })
    : songs;
  if (genreAnchor && !genreLocked.length) return [];

  // Multi-mood / historical mood labels: ANY concept match is enough (quality ranked).
  // Do not require every concept simultaneously — that caused false-zero rooms.
  if (type === "mood" || label.includes(",") || /[´^°+|]/u.test(label)) {
    const selected = selectMoodCatalogCandidates(
      genreLocked,
      label || input.id,
      input.limit || 72
    );
    if (selected.songs.length) return selected.songs as T[];
  }

  const ranked = rankSongsForRoomRelevance(genreLocked, {
    title: input.title,
    id: input.id,
    query: input.query,
    terms: input.terms,
    limit: input.limit || 72,
    minScore: type === "mood" ? DISCOVERY_SCORE.phrase : ROOM_INITIAL_RELEVANCE_MIN,
  });
  if (ranked.length) return ranked.map((hit) => hit.song);

  if (type === "genre") {
    const needle = String(input.title || input.query || "")
      .trim()
      .toLowerCase();
    if (!needle) return [];
    return genreLocked
      .filter((song) => {
        const blob = `${song.genre || ""} ${song.mood || ""} ${
          Array.isArray(song.tags) ? song.tags.join(" ") : song.tags || ""
        }`.toLowerCase();
        return blob.includes(needle);
      })
      .slice(0, input.limit || 72);
  }
  return [];
}
