/**
 * Genre-anchored mood discovery.
 *
 * GENRE = hard session anchor
 * MOOD = intent / refinement
 *
 * Country + Reflective stays Country until Country is genuinely exhausted.
 */

import {
  DISCOVERY_SCORE,
  normalizeDiscoveryConcepts,
  type RankedDiscoveryHit,
  type RadioDiscoverySong,
} from "./radioCatalogDiscovery";
import {
  coMoodsForConcepts,
  dominantGenresForConcepts,
  ingestMoodCatalogWindow,
  scoreSongWithMoodGraph,
  splitMoodRequestConcepts,
} from "./historicalMoodGraph";
import { MOOD_ROOM_DISCOVERY } from "./moodRoomDiscovery";
import { bumpMoodDiscoveryPerf, coalesceDiscoveryRequest } from "./moodDiscoveryIndex";

export type GenreAnchoredSong = RadioDiscoverySong & {
  streamUrl?: unknown;
  audioUrl?: unknown;
  url?: unknown;
};

export type GenreAnchoredLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type GenreAnchoredCursor = {
  catalogPage: number;
  broadeningLevel: GenreAnchoredLevel;
  catalogExhaustedAtLevel: boolean;
  genreExhausted: boolean;
};

export type GenreAnchoredSession = {
  originGenre: string;
  originMood: string;
  currentGenre: string;
  currentMoodSet: string[];
  broadeningLevel: GenreAnchoredLevel;
  seenTrackIds: Set<string>;
  recentArtistIds: string[];
  recentGenreIds: string[];
  recentMoodConcepts: string[];
  skippedIds: Set<string>;
  cursor: GenreAnchoredCursor;
  servedCount: number;
};

export type GenreAnchoredPageResult = {
  songs: GenreAnchoredSong[];
  cursor: GenreAnchoredCursor;
  hasMore: boolean;
  concepts: string[];
  broadeningLevel: GenreAnchoredLevel;
  originGenre: string;
  windowsScanned: number;
  sourceSongCount: number;
};

type PageFetcher = (input: {
  page: number;
  limit: number;
  /** Hard genre query constraint for levels 0–3. */
  genre?: string;
}) => Promise<{ songs: GenreAnchoredSong[]; hasMore: boolean }>;

const sessions = new Map<string, GenreAnchoredSession>();
let defaultFetcher: PageFetcher | null = null;

/** Genre-anchored may page a bit deeper than global mood — still bounded. */
const GENRE_ANCHORED_MAX_WINDOWS = MOOD_ROOM_DISCOVERY.maxWindowsPerRequest + 2;

/** Close-genre map — conservative, catalog-defensible neighbors only. */
const CLOSE_GENRES: Record<string, string[]> = {
  country: ["americana", "folk", "bluegrass", "folk country", "country folk"],
  jazz: ["blues", "soul", "lounge", "smooth jazz"],
  blues: ["jazz", "soul", "rnb", "r&b"],
  gospel: ["worship", "spiritual", "christian", "inspirational"],
  worship: ["gospel", "spiritual", "christian"],
  afrobeats: ["afrobeat", "afro", "amapiano", "afropop", "highlife"],
  amapiano: ["afrobeats", "afrobeat", "afro"],
  soul: ["rnb", "r&b", "jazz", "blues", "gospel"],
  rnb: ["soul", "r&b", "jazz"],
  "r&b": ["soul", "rnb", "jazz"],
  pop: ["indie", "soft pop"],
  rock: ["indie", "alternative"],
  hiphop: ["rap", "hip hop", "hip-hop"],
  "hip hop": ["rap", "hiphop", "hip-hop"],
  rap: ["hip hop", "hiphop"],
};

export function setGenreAnchoredPageFetcher(fetcher: PageFetcher | null) {
  defaultFetcher = fetcher;
}

function text(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function sessionKey(genre: string, mood: string, id?: string) {
  return `genre-mood:${text(id || `${genre}|${mood}`)}`;
}

function recordingKey(song: GenreAnchoredSong) {
  const title = text(song.title).replace(/[^a-z0-9]+/g, " ").trim();
  const artist = text(song.artist || song.artist_name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (title && artist) return `meta:${title}:${artist}`;
  return text(song.id || song.streamUrl || song.url);
}

function isPlayable(song: GenreAnchoredSong) {
  return Boolean(song.streamUrl || song.url || song.audioUrl);
}

function normalizeGenreKey(value: unknown) {
  return text(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function songMatchesGenreAnchor(
  song: GenreAnchoredSong,
  genreAnchor: string
): boolean {
  const anchor = normalizeGenreKey(genreAnchor);
  if (!anchor) return false;
  const songGenre = normalizeGenreKey(song.genre);
  if (!songGenre) return false;
  if (songGenre === anchor) return true;
  if (songGenre.includes(anchor) || anchor.includes(songGenre)) return true;
  // Token overlap for "hip hop" / "hip-hop / rap"
  const a = new Set(anchor.split(" ").filter((t) => t.length > 2));
  const b = songGenre.split(" ").filter((t) => t.length > 2);
  if (!a.size) return false;
  const hits = b.filter((t) => a.has(t)).length;
  return hits >= Math.min(a.size, 2) || (a.size === 1 && hits >= 1);
}

function closeGenresFor(genre: string): string[] {
  const key = normalizeGenreKey(genre);
  const direct = CLOSE_GENRES[key] || CLOSE_GENRES[key.replace(/\s+/g, "")] || [];
  return Array.from(new Set([key, ...direct.map(normalizeGenreKey)].filter(Boolean)));
}

function songInGenreSet(song: GenreAnchoredSong, genres: string[]): boolean {
  return genres.some((genre) => songMatchesGenreAnchor(song, genre));
}

function pushRecent(list: string[], value: string, cap = 24) {
  const clean = text(value);
  if (!clean) return;
  const next = [clean, ...list.filter((entry) => entry !== clean)];
  list.splice(0, list.length, ...next.slice(0, cap));
}

export function createGenreAnchoredSession(input: {
  genre: string;
  mood: string;
  id?: string;
  reset?: boolean;
}): GenreAnchoredSession {
  const originGenre = String(input.genre || "").trim();
  const originMood = String(input.mood || "").trim();
  const key = sessionKey(originGenre, originMood, input.id);
  if (!input.reset) {
    const existing = sessions.get(key);
    if (existing) return existing;
  }

  const moodSet = splitMoodRequestConcepts(originMood);
  const session: GenreAnchoredSession = {
    originGenre,
    originMood,
    currentGenre: originGenre,
    currentMoodSet: moodSet.length ? moodSet : normalizeDiscoveryConcepts(originMood),
    broadeningLevel: 0,
    seenTrackIds: new Set(),
    recentArtistIds: [],
    recentGenreIds: [],
    recentMoodConcepts: [...moodSet],
    skippedIds: new Set(),
    cursor: {
      catalogPage: 1,
      broadeningLevel: 0,
      catalogExhaustedAtLevel: false,
      genreExhausted: false,
    },
    servedCount: 0,
  };
  sessions.set(key, session);
  return session;
}

export function getGenreAnchoredSession(input: {
  genre: string;
  mood: string;
  id?: string;
}): GenreAnchoredSession | null {
  return sessions.get(sessionKey(input.genre, input.mood, input.id)) || null;
}

export function resetGenreAnchoredSession(input: {
  genre: string;
  mood: string;
  id?: string;
}) {
  sessions.delete(sessionKey(input.genre, input.mood, input.id));
}

export function markGenreAnchoredSkipped(
  input: { genre: string; mood: string; id?: string },
  songIds: string[]
) {
  const session = getGenreAnchoredSession(input);
  if (!session) return;
  songIds.forEach((id) => {
    const clean = String(id || "").trim();
    if (clean) session.skippedIds.add(clean);
  });
}

function scoreWithinLevel(
  song: GenreAnchoredSong,
  session: GenreAnchoredSession,
  level: GenreAnchoredLevel
): RankedDiscoveryHit<GenreAnchoredSong> | null {
  const moodConcepts = session.currentMoodSet;
  const originGenre = session.originGenre;
  const close = closeGenresFor(originGenre);
  const coMoods = coMoodsForConcepts(moodConcepts, 8);
  const relatedMoods = Array.from(new Set([...moodConcepts, ...coMoods]));
  const graphGenres = dominantGenresForConcepts(moodConcepts, 6);

  const moodScore = scoreSongWithMoodGraph(song, moodConcepts);
  const relatedScore = scoreSongWithMoodGraph(song, relatedMoods);
  const inOrigin = songMatchesGenreAnchor(song, originGenre);
  const inClose = songInGenreSet(song, close);
  const skipped =
    session.skippedIds.has(String(song.id || "")) ||
    session.seenTrackIds.has(recordingKey(song));
  if (skipped || !isPlayable(song)) return null;

  let score = 0;
  const signals: string[] = [];

  switch (level) {
    case 0: {
      // Exact genre + exact mood
      if (!inOrigin) return null;
      if (moodScore.conceptHits < 1 || moodScore.score < DISCOVERY_SCORE.phrase) {
        return null;
      }
      score = moodScore.score + 40;
      signals.push(`L0:genre+mood`, ...moodScore.signals);
      break;
    }
    case 1: {
      // Same genre + multi-mood associations from catalog
      if (!inOrigin) return null;
      if (relatedScore.conceptHits < 1 || relatedScore.score < DISCOVERY_SCORE.phrase) {
        return null;
      }
      score = relatedScore.score + 28;
      signals.push(`L1:genre+co-mood`, ...relatedScore.signals);
      break;
    }
    case 2: {
      // Same genre + related mood (softer)
      if (!inOrigin) return null;
      if (relatedScore.score < DISCOVERY_SCORE.related) return null;
      if (relatedScore.conceptHits < 1 && relatedScore.score < DISCOVERY_SCORE.phrase) {
        return null;
      }
      score = relatedScore.score + 18;
      signals.push(`L2:genre+related-mood`, ...relatedScore.signals);
      break;
    }
    case 3: {
      // Same genre broader — rank by mood continuity, still Country/Jazz/etc.
      if (!inOrigin) return null;
      score = Math.max(relatedScore.score, 1) + 8;
      if (moodScore.conceptHits > 0) score += 6;
      signals.push(`L3:genre-broader`, ...relatedScore.signals);
      break;
    }
    case 4: {
      // Close genre only after origin genre exhausted
      if (inOrigin) return null;
      if (!inClose) return null;
      if (moodScore.conceptHits < 1 || moodScore.score < DISCOVERY_SCORE.phrase) {
        return null;
      }
      score = moodScore.score + 12;
      signals.push(`L4:close-genre+mood`, ...moodScore.signals);
      break;
    }
    case 5: {
      if (inOrigin) return null;
      if (!inClose) return null;
      if (relatedScore.score < DISCOVERY_SCORE.related) return null;
      score = relatedScore.score + 6;
      signals.push(`L5:close-genre+related`, ...relatedScore.signals);
      break;
    }
    default: {
      // Broader compatible — still require continuity, never random dump
      if (relatedScore.score <= 0 && moodScore.score <= 0) {
        // Allow graph genre continuity as last resort
        const songGenre = normalizeGenreKey(song.genre);
        const ok = graphGenres.some(
          (genre) =>
            songGenre === genre ||
            songGenre.includes(genre) ||
            genre.includes(songGenre)
        );
        if (!ok) return null;
        score = 2;
        signals.push(`L6:graph-genre:${songGenre}`);
      } else {
        score = Math.max(relatedScore.score, moodScore.score);
        signals.push(`L6:broader`, ...relatedScore.signals);
      }
      break;
    }
  }

  if (session.skippedIds.has(String(song.id || ""))) score -= 20;
  if (score <= 0) return null;
  return { song, score, signals: Array.from(new Set(signals)) };
}

export async function discoverGenreAnchoredMoodPage(input: {
  genre: string;
  mood: string;
  id?: string;
  limit?: number;
  reset?: boolean;
  fetchPage?: PageFetcher;
}): Promise<GenreAnchoredPageResult> {
  const genre = String(input.genre || "").trim();
  const mood = String(input.mood || "").trim();
  const limit = Math.min(
    Math.max(Number(input.limit) || MOOD_ROOM_DISCOVERY.resultPageSize, 1),
    100
  );
  if (input.fetchPage) {
    return runGenreAnchoredMoodPage(input, genre, mood, limit);
  }
  const session = createGenreAnchoredSession({
    genre,
    mood,
    id: input.id,
    reset: Boolean(input.reset),
  });
  const coalesceKey = [
    "genre-anchored",
    String(input.id || `${genre}|${mood}`).trim().toLowerCase(),
    genre.toLowerCase(),
    mood.toLowerCase(),
    `l${limit}`,
    `p${session.cursor.catalogPage}`,
    `b${session.broadeningLevel}`,
    input.reset ? "reset" : "cont",
  ].join("|");
  return coalesceDiscoveryRequest(coalesceKey, () =>
    runGenreAnchoredMoodPage(input, genre, mood, limit)
  );
}

async function runGenreAnchoredMoodPage(
  input: {
    genre: string;
    mood: string;
    id?: string;
    limit?: number;
    reset?: boolean;
    fetchPage?: PageFetcher;
  },
  genre: string,
  mood: string,
  limit: number
): Promise<GenreAnchoredPageResult> {
  const started = Date.now();
  bumpMoodDiscoveryPerf("discoveryRequests");
  const session = createGenreAnchoredSession({
    genre,
    mood,
    id: input.id,
    reset: Boolean(input.reset),
  });
  const fetchPage = input.fetchPage || defaultFetcher;
  if (!fetchPage) throw new Error("Genre-anchored page fetcher is not configured");
  if (!session.currentMoodSet.length || !genre) {
    return {
      songs: [],
      cursor: session.cursor,
      hasMore: false,
      concepts: session.currentMoodSet,
      broadeningLevel: session.broadeningLevel,
      originGenre: genre,
      windowsScanned: 0,
      sourceSongCount: 0,
    };
  }

  const collected: RankedDiscoveryHit<GenreAnchoredSong>[] = [];
  let windowsScanned = 0;
  let sourceSongCount = 0;
  let catalogPage = Math.max(1, session.cursor.catalogPage);
  let level = session.broadeningLevel;
  let producedLevel = level;
  let hasMoreCatalog = true;
  let catalogFullyScannedAtLevel = false;

  while (
    collected.length < limit &&
    windowsScanned < GENRE_ANCHORED_MAX_WINDOWS
  ) {
    // Levels 0–3: candidate QUERY is genre-constrained (not global scan).
    const fetchGenre = level <= 3 ? genre : undefined;
    const page = await fetchPage({
      page: catalogPage,
      limit: MOOD_ROOM_DISCOVERY.windowSize,
      genre: fetchGenre,
    });
    windowsScanned += 1;
    // Genre-filtered query: stamp missing/placeholder genre so hard filter
    // does not empty a Country API page whose rows omit genre metadata.
    const pageSongs = (page.songs || []).map((song) => {
      if (!fetchGenre) return song;
      if (songMatchesGenreAnchor(song, fetchGenre)) return song;
      const existing = normalizeGenreKey(song.genre);
      if (!existing || existing === "hidden tunes") {
        return { ...song, genre: fetchGenre };
      }
      return song;
    });
    sourceSongCount += pageSongs.length;
    bumpMoodDiscoveryPerf("candidateRecordsScanned", pageSongs.length);
    hasMoreCatalog = Boolean(page.hasMore && pageSongs.length > 0);
    ingestMoodCatalogWindow(pageSongs);

    // Same-page mood ladder inside origin genre: L0 → L1 → L2 → L3.
    // Never leave Country/Jazz on this page just because exact mood tags are sparse.
    const maxTryLevel: GenreAnchoredLevel = level <= 3 ? 3 : level;
    let pageHits: RankedDiscoveryHit<GenreAnchoredSong>[] = [];
    let pageLevel: GenreAnchoredLevel = level;
    for (let tryLevel = level; tryLevel <= maxTryLevel; tryLevel += 1) {
      const ranked: RankedDiscoveryHit<GenreAnchoredSong>[] = [];
      pageSongs.forEach((song) => {
        const hit = scoreWithinLevel(
          song,
          session,
          tryLevel as GenreAnchoredLevel
        );
        if (hit) ranked.push(hit);
      });
      if (!ranked.length) continue;
      ranked.sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : String(a.song.id || "").localeCompare(String(b.song.id || ""))
      );
      pageHits = ranked;
      pageLevel = tryLevel as GenreAnchoredLevel;
      break;
    }

    for (const hit of pageHits) {
      if (collected.length >= limit) break;
      const key = recordingKey(hit.song);
      if (!key || session.seenTrackIds.has(key)) continue;
      session.seenTrackIds.add(key);
      collected.push(hit);
      producedLevel = pageLevel;
      pushRecent(session.recentArtistIds, String(hit.song.artist || ""));
      pushRecent(session.recentGenreIds, String(hit.song.genre || ""));
    }

    if (collected.length >= limit) {
      catalogFullyScannedAtLevel = false;
      break;
    }

    if (hasMoreCatalog) {
      catalogPage += 1;
      continue;
    }

    // Full genre/catalog scan finished at session level.
    catalogFullyScannedAtLevel = true;

    if (collected.length > 0) {
      if (producedLevel >= 3) {
        session.cursor.genreExhausted = true;
      } else {
        session.cursor.genreExhausted = false;
      }
      const nextLevel = Math.min(6, Math.max(level, producedLevel) + 1) as GenreAnchoredLevel;
      session.broadeningLevel = nextLevel;
      session.cursor = {
        catalogPage: 1,
        broadeningLevel: nextLevel,
        catalogExhaustedAtLevel: false,
        genreExhausted: session.cursor.genreExhausted,
      };
      session.currentGenre =
        nextLevel >= 4 ? closeGenresFor(genre)[1] || genre : genre;
      break;
    }

    // Zero matches after full scan — broaden mood inside genre, then leave genre only at L4.
    if (level < 3) {
      level = (level + 1) as GenreAnchoredLevel;
      catalogPage = 1;
      hasMoreCatalog = true;
      catalogFullyScannedAtLevel = false;
      continue;
    }
    if (level === 3) {
      session.cursor.genreExhausted = true;
      level = 4;
      catalogPage = 1;
      hasMoreCatalog = true;
      catalogFullyScannedAtLevel = false;
      continue;
    }
    if (level < 6) {
      level = (level + 1) as GenreAnchoredLevel;
      catalogPage = 1;
      hasMoreCatalog = true;
      catalogFullyScannedAtLevel = false;
      continue;
    }
    hasMoreCatalog = false;
    break;
  }

  // HARD FILTER: levels 0–3 = origin genre ONLY. Strip any survivors.
  const levelReported = producedLevel;
  const filtered =
    levelReported <= 3
      ? collected.filter((hit) => songMatchesGenreAnchor(hit.song, genre))
      : collected;

  // Persist cursor only when we did not already advance after a partial fill.
  if (!(collected.length > 0 && catalogFullyScannedAtLevel)) {
    session.broadeningLevel = levelReported;
    session.currentGenre =
      levelReported >= 4 ? closeGenresFor(genre)[1] || genre : genre;
    session.cursor = {
      catalogPage: hasMoreCatalog ? catalogPage : 1,
      broadeningLevel: levelReported,
      catalogExhaustedAtLevel: !hasMoreCatalog && levelReported >= 6,
      genreExhausted:
        session.cursor.genreExhausted ||
        (catalogFullyScannedAtLevel && levelReported >= 3 && filtered.length === 0),
    };
  }
  session.servedCount += filtered.length;

  const songs = filtered.map((entry) => entry.song);
  const hasMore =
    hasMoreCatalog ||
    (catalogFullyScannedAtLevel && session.broadeningLevel <= 6 && session.broadeningLevel > levelReported) ||
    (!session.cursor.catalogExhaustedAtLevel && levelReported < 6);

  bumpMoodDiscoveryPerf("rankingDurationMs", Date.now() - started);

  return {
    songs,
    cursor: session.cursor,
    hasMore: Boolean(hasMore || (hasMoreCatalog && songs.length > 0)),
    concepts: session.currentMoodSet,
    broadeningLevel: levelReported,
    originGenre: genre,
    windowsScanned,
    sourceSongCount,
  };
}
