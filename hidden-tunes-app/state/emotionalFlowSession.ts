import {
  SkipTimestampRingBuffer,
  freezeEmotionalIdentitySnapshot,
} from "../utils/emotionalStateFreeze";

export type EmotionalFlowSession = {
  numberOfSkips: number;
  numberOfFullPlays: number;
  numberOfModeToggles: number;
  lastWorldEntered: string | null;
  lastWorldExited: string | null;
  lastFlowStrength: number;
  worldAffinityBoost: number;
  worldAffinityBoostUpdatedAt: number;
};

const DEFAULT_SESSION: EmotionalFlowSession = {
  numberOfSkips: 0,
  numberOfFullPlays: 0,
  numberOfModeToggles: 0,
  lastWorldEntered: null,
  lastWorldExited: null,
  lastFlowStrength: 0.5,
  worldAffinityBoost: 0,
  worldAffinityBoostUpdatedAt: Date.now(),
};

const SKIP_BURST_WINDOW_MS = 10_000;
const SKIP_BURST_THRESHOLD = 3;
const FULL_PLAY_STREAK_THRESHOLD = 3;
const WORLD_AFFINITY_DECAY_PER_MINUTE = 0.05;
const SESSION_UPDATE_BATCH_MS = 50;

type SessionUpdateKind = "skip" | "fullPlay";

let session: EmotionalFlowSession = { ...DEFAULT_SESSION };
let frozenSessionSnapshot: EmotionalFlowSession = freezeEmotionalIdentitySnapshot({
  ...DEFAULT_SESSION,
});

const skipTimestampRing = new SkipTimestampRingBuffer();
let consecutiveFullPlays = 0;
let pendingSessionUpdates: SessionUpdateKind[] = [];
let sessionBatchTimer: ReturnType<typeof setTimeout> | null = null;
let sessionHydrated = false;
let sessionHydrationPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notifyEmotionalFlowSessionListeners() {
  listeners.forEach((listener) => listener());
}

function clampFlowStrength(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION.lastFlowStrength;
  }

  return Math.max(0, Math.min(1, value));
}

function clampBoost(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function buildFrozenSessionSnapshot(nextSession: EmotionalFlowSession) {
  return freezeEmotionalIdentitySnapshot({
    ...nextSession,
    worldAffinityBoost: getDecayedWorldAffinityBoost(),
  });
}

function commitSession(nextSession: EmotionalFlowSession) {
  session = nextSession;
  frozenSessionSnapshot = buildFrozenSessionSnapshot(nextSession);
  notifyEmotionalFlowSessionListeners();
}

function applySkipUpdate(now: number) {
  skipTimestampRing.push(now);
  consecutiveFullPlays = 0;
  session = {
    ...session,
    numberOfSkips: session.numberOfSkips + 1,
  };
}

function applyFullPlayUpdate() {
  consecutiveFullPlays += 1;
  skipTimestampRing.clear();
  session = {
    ...session,
    numberOfFullPlays: session.numberOfFullPlays + 1,
  };
}

function flushPendingSessionUpdates() {
  sessionBatchTimer = null;

  if (!pendingSessionUpdates.length) {
    return;
  }

  const updates = pendingSessionUpdates;
  pendingSessionUpdates = [];
  const now = Date.now();

  updates.forEach((kind) => {
    if (kind === "skip") {
      applySkipUpdate(now);
      return;
    }

    applyFullPlayUpdate();
  });

  commitSession(session);
}

function queueSessionUpdate(kind: SessionUpdateKind) {
  pendingSessionUpdates.push(kind);

  if (sessionBatchTimer) {
    return;
  }

  sessionBatchTimer = setTimeout(flushPendingSessionUpdates, SESSION_UPDATE_BATCH_MS);
}

export function ensureEmotionalFlowSessionHydrated(): Promise<void> {
  if (sessionHydrated) {
    return sessionHydrationPromise ?? Promise.resolve();
  }

  if (sessionHydrationPromise) {
    return sessionHydrationPromise;
  }

  sessionHydrationPromise = Promise.resolve().then(() => {
    if (sessionHydrated) {
      return;
    }

    sessionHydrated = true;
    frozenSessionSnapshot = buildFrozenSessionSnapshot(session);
  });

  return sessionHydrationPromise;
}

export function getEmotionalFlowSession(): EmotionalFlowSession {
  return frozenSessionSnapshot;
}

export function subscribeEmotionalFlowSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDecayedWorldAffinityBoost(now = Date.now()): number {
  const elapsedMinutes = Math.max(
    0,
    (now - session.worldAffinityBoostUpdatedAt) / 60_000
  );
  const decayed =
    session.worldAffinityBoost - elapsedMinutes * WORLD_AFFINITY_DECAY_PER_MINUTE;

  return clampBoost(decayed);
}

export function isEmotionalFlowSkipBurstActive(now = Date.now()): boolean {
  return (
    skipTimestampRing.countWithinWindow(now, SKIP_BURST_WINDOW_MS) >=
    SKIP_BURST_THRESHOLD
  );
}

export function isEmotionalFlowFullPlayStreakActive(): boolean {
  return consecutiveFullPlays >= FULL_PLAY_STREAK_THRESHOLD;
}

export function recordEmotionalFlowSkip() {
  queueSessionUpdate("skip");
}

export function recordEmotionalFlowFullPlay() {
  queueSessionUpdate("fullPlay");
}

export function recordEmotionalFlowModeToggle() {
  commitSession({
    ...session,
    numberOfModeToggles: session.numberOfModeToggles + 1,
  });
}

export function recordEmotionalFlowWorldEntered(worldId: string) {
  const normalized = String(worldId || "").trim();
  if (!normalized) {
    return;
  }

  const now = Date.now();
  const decayedBoost = getDecayedWorldAffinityBoost(now);

  commitSession({
    ...session,
    lastWorldEntered: normalized,
    worldAffinityBoost: clampBoost(decayedBoost + 0.35),
    worldAffinityBoostUpdatedAt: now,
  });
}

export function recordEmotionalFlowWorldExited(worldId: string | null) {
  const normalized = worldId ? String(worldId).trim() : null;
  const now = Date.now();
  const decayedBoost = getDecayedWorldAffinityBoost(now);

  commitSession({
    ...session,
    lastWorldExited: normalized,
    worldAffinityBoost: decayedBoost,
    worldAffinityBoostUpdatedAt: now,
  });
}

export function setEmotionalFlowLastFlowStrength(value: number) {
  const nextStrength = clampFlowStrength(value);

  if (session.lastFlowStrength === nextStrength) {
    return;
  }

  commitSession({
    ...session,
    lastFlowStrength: nextStrength,
  });
}

void ensureEmotionalFlowSessionHydrated();
