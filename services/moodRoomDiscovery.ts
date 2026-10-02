/**
 * Paginated Mood Room discovery over the eligible catalog.
 * Full catalog ACCESS via bounded windows — never requires full catalog IN MEMORY.
 */

import {
  DISCOVERY_SCORE,
  normalizeDiscoveryConcepts,
  type RankedDiscoveryHit,
  type RadioDiscoverySong,
} from "./radioCatalogDiscovery";
import { normalizeRoomConcepts } from "./roomRelevance";
import {
  coMoodsForConcepts,
  dominantGenresForConcepts,
  ingestMoodCatalogWindow,
  scoreSongWithMoodGraph,
  splitMoodRequestConcepts,
} from "./historicalMoodGraph";

export type MoodDiscoverySong = RadioDiscoverySong & {
  streamUrl?: unknown;
  audioUrl?: unknown;
  url?: unknown;
};

export type MoodCatalogPage = {
  songs: MoodDiscoverySong[];
  hasMore: boolean;
};

export type MoodCatalogPageFetcher = (input: {
  page: number;
  limit: number;
}) => Promise<MoodCatalogPage>;

export const MOOD_ROOM_DISCOVERY = {
  /** Catalog page size fetched per discovery window (bounded). */
  windowSize: 60,
  /** Songs returned to UI/queue per request. */
  resultPageSize: 24,
  /** Max catalog windows scored per request — keeps ranking off the UI path. */
  maxWindowsPerRequest: 3,
  /** Start Radio / auto-next upcoming window. */
  playbackBuffer: 12,
  /** Max full track objects held in Room Detail React state. */
  uiHoldCap: 72,
  /** Lightweight dedupe ID retention (no heavy song objects). */
  seenIdCap: 2000,
} as const;

export type MoodBroadenLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type MoodDiscoveryCursor = {
  catalogPage: number;
  broadenLevel: MoodBroadenLevel;
  catalogExhaustedAtLevel: boolean;
};

export type MoodDiscoveryPageResult = {
  songs: MoodDiscoverySong[];
  cursor: MoodDiscoveryCursor;
  hasMore: boolean;
  concepts: string[];
  broadenLevel: MoodBroadenLevel;
  windowsScanned: number;
  sourceSongCount: number;
};

type MoodRoomSession = {
  moodLabel: string;
  concepts: string[];
  excludeKeys: Set<string>;
  cursor: MoodDiscoveryCursor;
  servedCount: number;
};

const sessions = new Map<string, MoodRoomSession>();
let defaultPageFetcher: MoodCatalogPageFetcher | null = null;

function trimExcludeKeys(excludeKeys: Set<string>) {
  if (excludeKeys.size <= MOOD_ROOM_DISCOVERY.seenIdCap) return;
  const overflow = excludeKeys.size - MOOD_ROOM_DISCOVERY.seenIdCap;
  let dropped = 0;
  for (const key of excludeKeys) {
    excludeKeys.delete(key);
    dropped += 1;
    if (dropped >= overflow) break;
  }
}

export function setMoodCatalogPageFetcher(fetcher: MoodCatalogPageFetcher | null) {
  defaultPageFetcher = fetcher;
}

function sessionKey(moodLabel: string, id?: string) {
  return `mood:${String(id || moodLabel).trim().toLowerCase()}`;
}

function recordingKey(song: {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  streamUrl?: unknown;
  url?: unknown;
}) {
  const title = String(song.title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const artist = String(song.artist || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (title && artist) return `meta:${title}:${artist}`;
  return String(song.id || song.streamUrl || song.url || "")
    .trim()
    .toLowerCase();
}

function minScoreForLevel(level: MoodBroadenLevel): number {
  switch (level) {
    case 0:
      // Direct mood/concept match (exact/alias/phrase). Never random pad.
      return DISCOVERY_SCORE.phrase;
    case 1:
      return DISCOVERY_SCORE.phrase;
    case 2:
      return DISCOVERY_SCORE.typo;
    case 3:
      return DISCOVERY_SCORE.related;
    case 4:
      return DISCOVERY_SCORE.related;
    default:
      return DISCOVERY_SCORE.related;
  }
}

function conceptsForLevel(base: string[], level: MoodBroadenLevel): string[] {
  if (level <= 0) return base;
  if (level === 1) {
    return Array.from(new Set([...base, ...coMoodsForConcepts(base, 6)]));
  }
  if (level === 2) {
    return Array.from(
      new Set([
        ...base,
        ...coMoodsForConcepts(base, 10),
        ...dominantGenresForConcepts(base, 4),
      ])
    );
  }
  return Array.from(
    new Set([
      ...base,
      ...coMoodsForConcepts(base, 12),
      ...dominantGenresForConcepts(base, 6),
    ])
  );
}

function isPlayable(song: MoodDiscoverySong) {
  return Boolean(song.streamUrl || song.url || song.audioUrl);
}

function ensureSession(moodLabel: string, id?: string, reset = false): MoodRoomSession {
  const key = sessionKey(moodLabel, id);
  if (!reset) {
    const existing = sessions.get(key);
    if (existing && existing.moodLabel === moodLabel) return existing;
  }
  const fromRoom = normalizeRoomConcepts({ title: moodLabel, id });
  const fromRequest = splitMoodRequestConcepts(moodLabel);
  const concepts =
    fromRoom.length > 0
      ? fromRoom
      : fromRequest.length > 0
        ? fromRequest
        : normalizeDiscoveryConcepts(moodLabel);
  const next: MoodRoomSession = {
    moodLabel,
    concepts,
    excludeKeys: new Set(),
    cursor: { catalogPage: 1, broadenLevel: 0, catalogExhaustedAtLevel: false },
    servedCount: 0,
  };
  sessions.set(key, next);
  return next;
}

export function resetMoodRoomDiscoverySession(moodLabel: string, id?: string) {
  sessions.delete(sessionKey(moodLabel, id));
}

/** Align session excludes after a cached first page so scroll/auto-next never re-serve those rows. */
export function alignMoodRoomDiscoverySession(
  moodLabel: string,
  id: string | undefined,
  alreadyServed: MoodDiscoverySong[],
  hasMore = true
) {
  const session = ensureSession(moodLabel, id, true);
  alreadyServed.forEach((song) => {
    const key = recordingKey(song);
    if (key) session.excludeKeys.add(key);
  });
  session.servedCount = session.excludeKeys.size;
  session.cursor = {
    catalogPage: 1,
    broadenLevel: 0,
    catalogExhaustedAtLevel: !hasMore,
  };
  return session;
}

/** Mark queue/buffer tracks seen so auto-next refill does not immediately repeat them. */
export function markMoodRoomSongsSeen(
  moodLabel: string,
  id: string | undefined,
  songs: MoodDiscoverySong[]
) {
  const session = ensureSession(moodLabel, id, false);
  songs.forEach((song) => {
    const key = recordingKey(song);
    if (key) session.excludeKeys.add(key);
  });
}

function rankWindow(
  windowSongs: MoodDiscoverySong[],
  concepts: string[],
  level: MoodBroadenLevel,
  excludeKeys: Set<string>
): RankedDiscoveryHit<MoodDiscoverySong>[] {
  const activeConcepts = conceptsForLevel(concepts, level);
  const minScore = minScoreForLevel(level);
  const dominant = dominantGenresForConcepts(concepts, 6);
  const ranked: RankedDiscoveryHit<MoodDiscoverySong>[] = [];

  windowSongs.forEach((song) => {
    if (!isPlayable(song)) return;
    const key = recordingKey(song);
    if (!key || excludeKeys.has(key)) return;
    const scored = scoreSongWithMoodGraph(song, activeConcepts);

    if (level === 0) {
      // Direct historical mood evidence only.
      if (scored.conceptHits < 1 || scored.score < minScore) return;
    } else if (level === 1) {
      // Genre-anchored / co-mood: require mood hit OR (genre home + soft mood continuity).
      if (scored.score < minScore) return;
      if (scored.conceptHits < 1 && !scored.genreAnchor) return;
    } else {
      if (scored.score < minScore) return;
      // Never accept zero-continuity global dump.
      if (scored.conceptHits < 1 && !scored.genreAnchor && dominant.length > 0) {
        const songGenre = String(song.genre || "").toLowerCase();
        const ok = dominant.some(
          (genre) =>
            songGenre === genre ||
            songGenre.includes(genre) ||
            genre.includes(songGenre)
        );
        if (!ok) return;
      }
    }

    ranked.push({
      song,
      score: scored.score,
      signals: scored.signals,
    });
  });

  ranked.sort((left, right) =>
    right.score !== left.score
      ? right.score - left.score
      : String(left.song.id || "").localeCompare(String(right.song.id || ""))
  );
  return ranked;
}

export async function discoverMoodRoomPage(input: {
  moodLabel: string;
  id?: string;
  limit?: number;
  reset?: boolean;
  fetchPage?: MoodCatalogPageFetcher;
}): Promise<MoodDiscoveryPageResult> {
  const moodLabel = String(input.moodLabel || "").trim();
  const limit = Math.min(
    Math.max(Number(input.limit) || MOOD_ROOM_DISCOVERY.resultPageSize, 1),
    100
  );
  const session = ensureSession(moodLabel, input.id, Boolean(input.reset));
  const concepts = session.concepts;
  const fetchPage = input.fetchPage || defaultPageFetcher;

  if (!concepts.length) {
    return {
      songs: [],
      cursor: session.cursor,
      hasMore: false,
      concepts,
      broadenLevel: session.cursor.broadenLevel,
      windowsScanned: 0,
      sourceSongCount: 0,
    };
  }
  if (!fetchPage) {
    throw new Error("Mood catalog page fetcher is not configured");
  }

  const collected: RankedDiscoveryHit<MoodDiscoverySong>[] = [];
  let windowsScanned = 0;
  let sourceSongCount = 0;
  let catalogPage = Math.max(1, session.cursor.catalogPage);
  let broadenLevel = session.cursor.broadenLevel;
  let hasMoreCatalog = true;

  while (
    collected.length < limit &&
    windowsScanned < MOOD_ROOM_DISCOVERY.maxWindowsPerRequest
  ) {
    const page = await fetchPage({
      page: catalogPage,
      limit: MOOD_ROOM_DISCOVERY.windowSize,
    });
    windowsScanned += 1;
    sourceSongCount += page.songs.length;
    hasMoreCatalog = Boolean(page.hasMore && page.songs.length > 0);

    // Teach the mood graph from every bounded window (historical intelligence).
    ingestMoodCatalogWindow(page.songs);

    const ranked = rankWindow(
      page.songs,
      concepts,
      broadenLevel,
      session.excludeKeys
    );
    for (const hit of ranked) {
      if (collected.length >= limit) break;
      const key = recordingKey(hit.song);
      if (!key || session.excludeKeys.has(key)) continue;
      session.excludeKeys.add(key);
      collected.push(hit);
    }

    if (hasMoreCatalog) {
      catalogPage += 1;
      continue;
    }
    if (broadenLevel < 5) {
      broadenLevel = (broadenLevel + 1) as MoodBroadenLevel;
      catalogPage = 1;
      hasMoreCatalog = true;
      continue;
    }
    hasMoreCatalog = false;
    break;
  }

  session.cursor = {
    catalogPage,
    broadenLevel,
    catalogExhaustedAtLevel: !hasMoreCatalog && broadenLevel >= 5,
  };
  session.servedCount += collected.length;
  trimExcludeKeys(session.excludeKeys);

  const songs = collected.map((entry) => entry.song);
  const hasMore =
    !session.cursor.catalogExhaustedAtLevel &&
    (hasMoreCatalog || broadenLevel < 5 || songs.length >= limit);

  return {
    songs,
    cursor: session.cursor,
    hasMore,
    concepts,
    broadenLevel,
    windowsScanned,
    sourceSongCount,
  };
}

export function takeMoodPlaybackBuffer<T>(
  songs: T[],
  limit = MOOD_ROOM_DISCOVERY.playbackBuffer
) {
  return songs.slice(0, Math.max(1, limit));
}
