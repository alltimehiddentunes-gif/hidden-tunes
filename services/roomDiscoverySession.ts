/**
 * Shared room discovery session — Explore preview, Room Detail, Start Radio,
 * and Smart Auto-Next must consume the SAME initial candidate set.
 *
 * ULTRA-LIGHT:
 * FULL CATALOG ACCESS ≠ full catalog in memory / React.
 * Keep a small track object window + large lightweight seen-ID set.
 */

import type { HiddenTunesNormalizedSong } from "./hiddenTunesApi";
import { normalizeDiscoveryConcepts } from "./radioCatalogDiscovery";
import { MOOD_ROOM_DISCOVERY } from "./moodRoomDiscovery";

export type RoomDiscoveryType = "mood" | "genre" | string;

export type RoomDiscoverySession = {
  roomId: string;
  type: RoomDiscoveryType;
  title: string;
  concepts: string[];
  /** Bounded heavy objects for immediate paint / Start Radio. */
  tracks: HiddenTunesNormalizedSong[];
  /** Lightweight dedupe — IDs only, no artwork/metadata retention. */
  seenTrackIds: Set<string>;
  continuationCursor: number;
  discoveryLevel: number;
  hasMore: boolean;
  loadingMore: boolean;
  generation: number;
  updatedAt: number;
};

const sessions = new Map<string, RoomDiscoverySession>();
const MAX_TRACK_OBJECTS = MOOD_ROOM_DISCOVERY.uiHoldCap;
const MAX_SEEN_IDS = MOOD_ROOM_DISCOVERY.seenIdCap;

function recordingId(song: { id?: unknown }) {
  return String(song?.id || "").trim();
}

export function roomDiscoverySessionKey(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
}) {
  const type = String(input.type || "mood").trim().toLowerCase() || "mood";
  const title = String(input.title || input.query || input.id || "")
    .trim()
    .toLowerCase();
  const id = String(input.id || title).trim().toLowerCase() || title;
  return `${type}:${id}|${title}`;
}

function trimSeenIds(seen: Set<string>) {
  if (seen.size <= MAX_SEEN_IDS) return;
  const overflow = seen.size - MAX_SEEN_IDS;
  let dropped = 0;
  for (const id of seen) {
    seen.delete(id);
    dropped += 1;
    if (dropped >= overflow) break;
  }
}

function trimTrackObjects(tracks: HiddenTunesNormalizedSong[]) {
  if (tracks.length <= MAX_TRACK_OBJECTS) return tracks;
  // Keep newest page window for scroll/append continuity.
  return tracks.slice(tracks.length - MAX_TRACK_OBJECTS);
}

/**
 * Create or reuse a room session. When Explore already has tracks, pass them
 * as initialTracks so Room Detail / Start Radio do not rediscover blank.
 */
export function upsertRoomDiscoverySession(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
  initialTracks?: HiddenTunesNormalizedSong[];
  hasMore?: boolean;
  replaceTracks?: boolean;
}): RoomDiscoverySession {
  const key = roomDiscoverySessionKey(input);
  const type = String(input.type || "mood").trim() || "mood";
  const title = String(input.title || input.query || input.id || "").trim();
  const roomId = String(input.id || title).trim() || title;
  const incoming = Array.isArray(input.initialTracks)
    ? input.initialTracks.filter(Boolean).slice(0, MAX_TRACK_OBJECTS)
    : [];

  const existing = sessions.get(key);
  if (existing && !input.replaceTracks) {
    if (incoming.length) {
      const merged: HiddenTunesNormalizedSong[] = [...existing.tracks];
      incoming.forEach((song) => {
        const id = recordingId(song);
        if (!id || existing.seenTrackIds.has(id)) return;
        existing.seenTrackIds.add(id);
        merged.push(song);
      });
      existing.tracks = trimTrackObjects(merged);
      existing.hasMore =
        typeof input.hasMore === "boolean" ? input.hasMore : true;
      existing.updatedAt = Date.now();
      existing.generation += 1;
      trimSeenIds(existing.seenTrackIds);
    }
    return existing;
  }

  const seenTrackIds = new Set(incoming.map(recordingId).filter(Boolean));
  const session: RoomDiscoverySession = {
    roomId,
    type,
    title,
    concepts: normalizeDiscoveryConcepts(title),
    tracks: incoming,
    seenTrackIds,
    continuationCursor: 1,
    discoveryLevel: 0,
    hasMore: typeof input.hasMore === "boolean" ? input.hasMore : incoming.length > 0,
    loadingMore: false,
    generation: 1,
    updatedAt: Date.now(),
  };
  // Explore found some tracks → room may still have more in catalog.
  if (incoming.length) session.hasMore = true;
  sessions.set(key, session);
  return session;
}

export function getRoomDiscoverySession(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
}): RoomDiscoverySession | null {
  return sessions.get(roomDiscoverySessionKey(input)) || null;
}

/** Non-destructive peek of initial tracks for immediate Room Detail paint. */
export function peekRoomInitialTracks(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
}): HiddenTunesNormalizedSong[] {
  const session = getRoomDiscoverySession(input);
  return session?.tracks?.length ? session.tracks.slice() : [];
}

export function appendRoomDiscoveryTracks(
  input: {
    type?: string;
    id?: string;
    title?: string;
    query?: string;
  },
  songs: HiddenTunesNormalizedSong[],
  options?: { hasMore?: boolean; discoveryLevel?: number; continuationCursor?: number }
): RoomDiscoverySession | null {
  const session = getRoomDiscoverySession(input);
  if (!session) return null;
  const incoming = Array.isArray(songs) ? songs.filter(Boolean) : [];
  incoming.forEach((song) => {
    const id = recordingId(song);
    if (!id || session.seenTrackIds.has(id)) return;
    session.seenTrackIds.add(id);
    session.tracks.push(song);
  });
  session.tracks = trimTrackObjects(session.tracks);
  trimSeenIds(session.seenTrackIds);
  if (typeof options?.hasMore === "boolean") session.hasMore = options.hasMore;
  if (typeof options?.discoveryLevel === "number") {
    session.discoveryLevel = options.discoveryLevel;
  }
  if (typeof options?.continuationCursor === "number") {
    session.continuationCursor = options.continuationCursor;
  }
  session.updatedAt = Date.now();
  session.generation += 1;
  session.loadingMore = false;
  return session;
}

export function markRoomDiscoveryLoadingMore(
  input: {
    type?: string;
    id?: string;
    title?: string;
    query?: string;
  },
  loadingMore: boolean
) {
  const session = getRoomDiscoverySession(input);
  if (session) session.loadingMore = loadingMore;
}

/**
 * Offscreen rooms: drop heavy track objects, keep IDs/cursor/concepts for return.
 */
export function compactRoomDiscoverySessionForOffscreen(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
}) {
  const session = getRoomDiscoverySession(input);
  if (!session) return;
  // Keep a tiny seed so return paint is instant without remounting hundreds of images.
  session.tracks = session.tracks.slice(0, Math.min(12, session.tracks.length));
  session.loadingMore = false;
  session.updatedAt = Date.now();
}

export function resetRoomDiscoverySession(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
}) {
  sessions.delete(roomDiscoverySessionKey(input));
}

export const ROOM_DISCOVERY_LIMITS = {
  maxTrackObjects: MAX_TRACK_OBJECTS,
  maxSeenIds: MAX_SEEN_IDS,
} as const;
