import type { AppSong, PlaybackQueueContext } from "../../context/PlayerContext";
import type { RadioStation } from "../../types/radio";
import {
  isRadioStreamSong,
  radioStationToAppSong,
} from "../playback/radioPlaybackAdapter";

export const LIVE_RADIO_QUEUE_TYPE = "live_radio" as const;

export type LiveRadioSessionOptions = {
  session?: RadioStation[];
  startIndex?: number;
  label?: string;
  /** Cache / category key used for optional bounded pagination. */
  cacheKey?: string;
  searchQuery?: string;
};

export type LiveRadioNavigateDirection = "next" | "previous";

export type LiveRadioSkipCycle = {
  generation: number;
  direction: LiveRadioNavigateDirection;
  failedIds: Set<string>;
  startedAt: number;
};

let liveRadioNavigateGeneration = 0;

export function createLiveRadioSkipCycle(
  direction: LiveRadioNavigateDirection
): LiveRadioSkipCycle {
  liveRadioNavigateGeneration += 1;
  return {
    generation: liveRadioNavigateGeneration,
    direction,
    failedIds: new Set(),
    startedAt: Date.now(),
  };
}

export function getLiveRadioNavigateGeneration() {
  return liveRadioNavigateGeneration;
}

export function bumpLiveRadioNavigateGeneration() {
  liveRadioNavigateGeneration += 1;
  return liveRadioNavigateGeneration;
}

export function isLiveRadioQueueContext(
  context?: PlaybackQueueContext | null
): boolean {
  if (!context) return false;
  if (context.queueType === LIVE_RADIO_QUEUE_TYPE) return true;
  if (context.contextType === "live-radio-session") return true;
  return false;
}

export function isLiveRadioSessionQueue(
  queue: AppSong[] | null | undefined,
  context?: PlaybackQueueContext | null,
  mode?: string | null
): boolean {
  if (mode && mode !== "live_stream") return false;
  if (isLiveRadioQueueContext(context)) return true;
  const list = queue || [];
  if (!list.length) return false;
  return list.every((song) => isRadioStreamSong(song));
}

export function canNavigateLiveRadioSession(queue: AppSong[] | null | undefined) {
  return (queue || []).filter((song) => isRadioStreamSong(song)).length > 1;
}

export function buildLiveRadioQueueContext(
  options?: LiveRadioSessionOptions
): PlaybackQueueContext {
  const label = String(options?.label || "Live Radio").trim() || "Live Radio";
  return {
    source: "radio",
    label,
    queueType: LIVE_RADIO_QUEUE_TYPE,
    contextType: "live-radio-session",
    railId: options?.cacheKey ? String(options.cacheKey) : undefined,
    searchQuery: options?.searchQuery
      ? String(options.searchQuery).trim() || undefined
      : undefined,
  };
}

export function dedupeRadioStations(stations: RadioStation[]) {
  const seen = new Set<string>();
  const result: RadioStation[] = [];
  for (const station of stations) {
    const id = String(station?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(station);
  }
  return result;
}

/**
 * Build an ordered live-radio queue from the exact visible session.
 * Stream URLs are taken from the session stations already resolved for the list —
 * we do not fetch additional play endpoints for siblings until next/prev/skip.
 */
export function buildLiveRadioSessionSongs(
  activeStation: RadioStation,
  session?: RadioStation[] | null
): { songs: AppSong[]; activeIndex: number } {
  const ordered = dedupeRadioStations(
    (session && session.length ? session : [activeStation]).filter(Boolean)
  );

  if (!ordered.some((station) => station.id === activeStation.id)) {
    ordered.unshift(activeStation);
  }

  const songs = ordered.map((station) => radioStationToAppSong(station));
  const activeIndex = Math.max(
    0,
    songs.findIndex((song) => song.id === `radio-${activeStation.id}`)
  );

  return { songs, activeIndex };
}

export function wrapLiveRadioIndex(
  currentIndex: number,
  queueLength: number,
  direction: LiveRadioNavigateDirection
): number {
  if (queueLength <= 0) return -1;
  const safe = Math.max(0, Math.min(currentIndex, queueLength - 1));
  if (queueLength === 1) return safe;
  if (direction === "next") return (safe + 1) % queueLength;
  return (safe - 1 + queueLength) % queueLength;
}

export function pickNextEligibleLiveRadioIndex(options: {
  currentIndex: number;
  queue: AppSong[];
  direction: LiveRadioNavigateDirection;
  failedIds: Set<string>;
}): number | null {
  const { queue, direction, failedIds } = options;
  if (!queue.length) return null;

  const start = Math.max(0, Math.min(options.currentIndex, queue.length - 1));
  let index = start;

  for (let attempt = 0; attempt < queue.length; attempt += 1) {
    index = wrapLiveRadioIndex(index, queue.length, direction);
    const song = queue[index];
    if (!song) continue;
    if (failedIds.has(song.id)) continue;
    if (!isRadioStreamSong(song)) continue;
    return index;
  }

  return null;
}

export function isPlayableLiveRadioStreamUrl(url: unknown) {
  return String(url || "").trim().startsWith("https://");
}

export function liveRadioStationHasPlayableStream(song: AppSong | null | undefined) {
  if (!song || !isRadioStreamSong(song)) return false;
  return isPlayableLiveRadioStreamUrl(song.streamUrl || song.url || song.audioUrl);
}

export const RADIO_SKIP_MESSAGE =
  "Station unavailable — trying the next station";
export const RADIO_ALL_FAILED_MESSAGE =
  "No playable stations are currently available in this list.";
