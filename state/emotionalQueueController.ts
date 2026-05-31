import { getQueueSequence } from "../queue/getQueueSequence";
import type { Track } from "../types/music";
import {
  applyEmotionalFlowAutoTuneToPool,
  emotionalFlowAutoTune,
} from "../utils/emotionalFlowAutoTune";
import { filterTracksForEmotionalFlow } from "../utils/emotionalFlowTrackFilter";
import {
  ensureEmotionalQueueCatalogTracks,
  getEmotionalQueueCatalogTracks,
} from "./emotionalQueueCatalogPool";
import {
  getEmotionalFlowSettings,
  isEmotionalFlowEnabled,
  subscribeEmotionalFlowSettings,
} from "./emotionalFlowSettings";
import {
  decayIdentity,
  loadEmotionalIdentity,
  updateIdentityFromTrack,
} from "./emotionalIdentity";
import {
  decayLongTermMemory,
  loadEmotionalFlowLongTermMemory,
  updateLongTermMemoryFromSession,
} from "./emotionalFlowLongTermMemory";
import {
  getEmotionalFlowSession,
  recordEmotionalFlowFullPlay,
  recordEmotionalFlowModeToggle,
  recordEmotionalFlowSkip,
  recordEmotionalFlowWorldEntered,
  recordEmotionalFlowWorldExited,
} from "./emotionalFlowSession";

export type EmotionalQueueSnapshot = {
  emotionalQueue: Track[];
  queueIndex: number;
};

let snapshot: EmotionalQueueSnapshot = {
  emotionalQueue: [],
  queueIndex: 0,
};

let lastEmotionalQueueAnchorTrack: Track | null = null;
let lastRebuildTimestamp = 0;
const EMOTIONAL_QUEUE_REBUILD_COOLDOWN_MS = 4_000;
const trackStartedAtById = new Map<string, number>();
let hasRunLongTermMemoryDecay = false;
let hasRunIdentityDecay = false;

void loadEmotionalFlowLongTermMemory().then(() => {
  if (hasRunLongTermMemoryDecay) {
    return;
  }

  hasRunLongTermMemoryDecay = true;
  decayLongTermMemory();
});

void loadEmotionalIdentity().then(() => {
  if (hasRunIdentityDecay) {
    return;
  }

  hasRunIdentityDecay = true;
  decayIdentity();
});

function createIdentityWorldTrack(worldId: string): Track {
  return {
    id: worldId,
    title: worldId,
    artist: "Hidden Tunes",
    artwork: "",
    source: "cloudflare",
    type: "song",
    isOnline: true,
  };
}

const listeners = new Set<() => void>();

function notifyEmotionalQueueListeners() {
  listeners.forEach((listener) => listener());
}

function markTrackPlaybackStarted(track: Track | null | undefined) {
  if (!track?.id) {
    return;
  }

  trackStartedAtById.set(String(track.id), Date.now());
}

function parseTrackDurationMs(track: Track): number | null {
  const raw = track.duration;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw > 1000 ? raw : raw * 1000;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }

  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }

  return null;
}

function recordAdvanceSessionMetrics(previousTrack: Track | null) {
  if (!previousTrack) {
    return;
  }

  const trackId = String(previousTrack.id);
  const startedAt = trackStartedAtById.get(trackId) ?? Date.now();
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const durationMs = parseTrackDurationMs(previousTrack);
  const completionThresholdMs = durationMs
    ? durationMs * 0.75
    : 90_000;

  if (elapsedMs >= completionThresholdMs) {
    recordEmotionalFlowFullPlay();
    updateLongTermMemoryFromSession(getEmotionalFlowSession(), "fullPlay");
    updateIdentityFromTrack(previousTrack, "fullPlay");
  } else {
    recordEmotionalFlowSkip();
    updateLongTermMemoryFromSession(getEmotionalFlowSession(), "skip");
    updateIdentityFromTrack(previousTrack, "skip");
  }

  trackStartedAtById.delete(trackId);
}

export function getEmotionalQueueSnapshot(): EmotionalQueueSnapshot {
  return snapshot;
}

export function getEmotionalQueueLastRebuildTimestamp() {
  return lastRebuildTimestamp;
}

export function subscribeEmotionalQueue(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setEmotionalQueueState(tracks: Track[], queueIndex = 0) {
  snapshot = {
    emotionalQueue: tracks,
    queueIndex: Math.max(0, Math.min(queueIndex, Math.max(tracks.length - 1, 0))),
  };
  markTrackPlaybackStarted(snapshot.emotionalQueue[snapshot.queueIndex]);
  notifyEmotionalQueueListeners();
}

export function setEmotionalQueue(tracks: Track[]) {
  setEmotionalQueueState(tracks, 0);
}

export function setEmotionalQueueIndex(queueIndex: number) {
  snapshot = {
    ...snapshot,
    queueIndex: Math.max(
      0,
      Math.min(queueIndex, Math.max(snapshot.emotionalQueue.length - 1, 0))
    ),
  };
  markTrackPlaybackStarted(snapshot.emotionalQueue[snapshot.queueIndex]);
  notifyEmotionalQueueListeners();
}

export function advanceEmotionalQueue(): Track | null {
  if (!isEmotionalFlowEnabled()) {
    return null;
  }

  if (snapshot.queueIndex >= snapshot.emotionalQueue.length - 1) {
    return null;
  }

  const previousTrack = snapshot.emotionalQueue[snapshot.queueIndex] ?? null;
  recordAdvanceSessionMetrics(previousTrack);

  const nextIndex = snapshot.queueIndex + 1;
  const nextTrack = snapshot.emotionalQueue[nextIndex] ?? null;

  snapshot = {
    ...snapshot,
    queueIndex: nextIndex,
  };
  markTrackPlaybackStarted(nextTrack);
  notifyEmotionalQueueListeners();

  return nextTrack;
}

export function clearEmotionalQueue() {
  snapshot = { emotionalQueue: [], queueIndex: 0 };
  trackStartedAtById.clear();
  notifyEmotionalQueueListeners();
}

export function isEmotionalQueueActive() {
  return isEmotionalFlowEnabled() && snapshot.emotionalQueue.length > 1;
}

export function hasMoreEmotionalQueueTracks() {
  if (!isEmotionalFlowEnabled()) {
    return false;
  }

  return snapshot.queueIndex < snapshot.emotionalQueue.length - 1;
}

export function buildEmotionalQueueForTrack(
  startTrack: Track,
  limit = 20
): Track[] {
  if (!isEmotionalFlowEnabled()) {
    return [startTrack];
  }

  const catalogTracks = getEmotionalQueueCatalogTracks();
  const pool =
    catalogTracks.length > 0
      ? catalogTracks
      : [startTrack];

  const flowSettings = getEmotionalFlowSettings();
  const filteredPool = filterTracksForEmotionalFlow(pool, startTrack, {
    lateNightModeEnabled: flowSettings.lateNightModeEnabled,
    stayInWorldEnabled: flowSettings.stayInWorldEnabled,
    activeWorldId: flowSettings.activeWorldId,
  });

  const autoTune = emotionalFlowAutoTune();
  const tunedPool = applyEmotionalFlowAutoTuneToPool(
    pool,
    filteredPool,
    startTrack,
    autoTune
  );

  return getQueueSequence(startTrack, tunedPool, limit);
}

export async function refreshEmotionalQueueForTrack(
  startTrack: Track,
  limit = 20
): Promise<Track[]> {
  lastEmotionalQueueAnchorTrack = startTrack;

  if (!isEmotionalFlowEnabled()) {
    clearEmotionalQueue();
    return [startTrack];
  }

  const now = Date.now();
  if (
    now - lastRebuildTimestamp < EMOTIONAL_QUEUE_REBUILD_COOLDOWN_MS &&
    snapshot.emotionalQueue.length > 0
  ) {
    return snapshot.emotionalQueue;
  }

  lastRebuildTimestamp = now;

  await ensureEmotionalQueueCatalogTracks();
  const sequence = buildEmotionalQueueForTrack(startTrack, limit);
  const startIndex = sequence.findIndex(
    (track) => String(track.id) === String(startTrack.id)
  );

  setEmotionalQueueState(sequence, startIndex >= 0 ? startIndex : 0);
  return sequence;
}

function getCurrentlyPlayingEmotionalTrack(): Track | null {
  return (
    snapshot.emotionalQueue[snapshot.queueIndex] ??
    lastEmotionalQueueAnchorTrack
  );
}

let observedFlowControls = {
  emotionalFlowEnabled: getEmotionalFlowSettings().emotionalFlowEnabled,
  stayInWorldEnabled: getEmotionalFlowSettings().stayInWorldEnabled,
  lateNightModeEnabled: getEmotionalFlowSettings().lateNightModeEnabled,
  activeWorldId: getEmotionalFlowSettings().activeWorldId,
};

let hasInitializedFlowSettingsObserver = false;

function handleEmotionalFlowSettingsChange() {
  const nextSettings = getEmotionalFlowSettings();

  if (!hasInitializedFlowSettingsObserver) {
    hasInitializedFlowSettingsObserver = true;
    observedFlowControls = {
      emotionalFlowEnabled: nextSettings.emotionalFlowEnabled,
      stayInWorldEnabled: nextSettings.stayInWorldEnabled,
      lateNightModeEnabled: nextSettings.lateNightModeEnabled,
      activeWorldId: nextSettings.activeWorldId,
    };
    return;
  }

  const flowControlsChanged =
    nextSettings.emotionalFlowEnabled !==
      observedFlowControls.emotionalFlowEnabled ||
    nextSettings.stayInWorldEnabled !==
      observedFlowControls.stayInWorldEnabled ||
    nextSettings.lateNightModeEnabled !==
      observedFlowControls.lateNightModeEnabled;

  const worldChanged =
    nextSettings.activeWorldId !== observedFlowControls.activeWorldId;

  if (worldChanged) {
    if (nextSettings.activeWorldId) {
      recordEmotionalFlowWorldEntered(nextSettings.activeWorldId);
      updateIdentityFromTrack(
        createIdentityWorldTrack(nextSettings.activeWorldId),
        "worldEnter"
      );
    }

    if (observedFlowControls.activeWorldId) {
      recordEmotionalFlowWorldExited(observedFlowControls.activeWorldId);
      updateIdentityFromTrack(
        createIdentityWorldTrack(observedFlowControls.activeWorldId),
        "worldExit"
      );
    }
  }

  if (flowControlsChanged) {
    recordEmotionalFlowModeToggle();
  }

  if (!flowControlsChanged && !worldChanged) {
    return;
  }

  observedFlowControls = {
    emotionalFlowEnabled: nextSettings.emotionalFlowEnabled,
    stayInWorldEnabled: nextSettings.stayInWorldEnabled,
    lateNightModeEnabled: nextSettings.lateNightModeEnabled,
    activeWorldId: nextSettings.activeWorldId,
  };

  if (!flowControlsChanged) {
    return;
  }

  const playingTrack = getCurrentlyPlayingEmotionalTrack();
  if (!playingTrack) {
    if (!nextSettings.emotionalFlowEnabled) {
      clearEmotionalQueue();
    }
    return;
  }

  if (nextSettings.emotionalFlowEnabled) {
    void refreshEmotionalQueueForTrack(playingTrack, 20);
    return;
  }

  clearEmotionalQueue();
}

subscribeEmotionalFlowSettings(handleEmotionalFlowSettingsChange);
