import AsyncStorage from "@react-native-async-storage/async-storage";

import { getEmotionalFlowSettings } from "./emotionalFlowSettings";
import type { Track } from "../types/music";
import { freezeEmotionalIdentitySnapshot } from "../utils/emotionalStateFreeze";

const STORAGE_KEY = "hidden_tunes_emotional_identity_v1";
const IDENTITY_BLEND_WEIGHT = 0.24;
const DAILY_DECAY_RATE = 0.01;
const MS_PER_DAY = 86_400_000;

export type EmotionalIdentityEventType =
  | "fullPlay"
  | "skip"
  | "worldEnter"
  | "worldExit";

export type TimeOfDayAffinity = {
  morning: number;
  afternoon: number;
  evening: number;
  lateNight: number;
};

export type EmotionalArcPreference = {
  rising: number;
  falling: number;
  stable: number;
};

export type EmotionalIdentity = {
  moodAffinity: Record<string, number>;
  worldAffinity: Record<string, number>;
  timeOfDayAffinity: TimeOfDayAffinity;
  emotionalArcPreference: EmotionalArcPreference;
  lastUpdated: number;
};

type StringStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

type StorageReader = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const DEFAULT_TIME_OF_DAY: TimeOfDayAffinity = {
  morning: 0.25,
  afternoon: 0.25,
  evening: 0.25,
  lateNight: 0.25,
};

const DEFAULT_ARC_PREFERENCE: EmotionalArcPreference = {
  rising: 0.33,
  falling: 0.33,
  stable: 0.34,
};

const DEFAULT_IDENTITY: EmotionalIdentity = {
  moodAffinity: {},
  worldAffinity: {},
  timeOfDayAffinity: { ...DEFAULT_TIME_OF_DAY },
  emotionalArcPreference: { ...DEFAULT_ARC_PREFERENCE },
  lastUpdated: Date.now(),
};

let identity: EmotionalIdentity = freezeEmotionalIdentitySnapshot({
  ...DEFAULT_IDENTITY,
  timeOfDayAffinity: { ...DEFAULT_TIME_OF_DAY },
  emotionalArcPreference: { ...DEFAULT_ARC_PREFERENCE },
});

let cachedTopMoods: readonly string[] = Object.freeze([]);
let cachedTopWorlds: readonly { id: string; score: number }[] = Object.freeze([]);

let hasLoadedIdentity = false;
let loadPromise: Promise<EmotionalIdentity> | null = null;
let storageReader: StorageReader | null = null;

function getStorageReader(): StorageReader {
  if (storageReader) {
    return storageReader;
  }

  try {
    const { MMKV } = require("react-native-mmkv") as {
      MMKV: new (config: { id: string }) => StringStorage;
    };
    const mmkv = new MMKV({ id: "hidden-tunes-emotional-identity" });

    storageReader = {
      getItem: async (key) => mmkv.getString(key) ?? null,
      setItem: async (key, value) => {
        mmkv.set(key, value);
      },
    };
  } catch {
    storageReader = {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    };
  }

  return storageReader;
}

function refreshIdentityCache() {
  cachedTopMoods = Object.freeze(
    Object.entries(identity.moodAffinity)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 2)
      .map(([tag]) => tag)
  );

  cachedTopWorlds = Object.freeze(
    Object.entries(identity.worldAffinity)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([worldId, score]) => Object.freeze({ id: worldId, score }))
  );
}

function commitIdentity(nextIdentity: EmotionalIdentity) {
  identity = freezeEmotionalIdentitySnapshot(nextIdentity);
  refreshIdentityCache();
  void persistIdentity();
  return identity;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeMoodTag(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function normalizeRecordScores(
  value: Record<string, unknown> | null | undefined
): Record<string, number> {
  const normalized: Record<string, number> = {};

  if (!value || typeof value !== "object") {
    return normalized;
  }

  Object.entries(value).forEach(([key, score]) => {
    const normalizedKey = normalizeMoodTag(key);
    if (!normalizedKey) {
      return;
    }

    normalized[normalizedKey] = clampScore(Number(score));
  });

  return normalized;
}

function normalizeTimeOfDayAffinity(
  value: Partial<TimeOfDayAffinity> | null | undefined
): TimeOfDayAffinity {
  return {
    morning: clamp01(Number(value?.morning ?? DEFAULT_TIME_OF_DAY.morning)),
    afternoon: clamp01(Number(value?.afternoon ?? DEFAULT_TIME_OF_DAY.afternoon)),
    evening: clamp01(Number(value?.evening ?? DEFAULT_TIME_OF_DAY.evening)),
    lateNight: clamp01(Number(value?.lateNight ?? DEFAULT_TIME_OF_DAY.lateNight)),
  };
}

function normalizeArcPreference(
  value: Partial<EmotionalArcPreference> | null | undefined
): EmotionalArcPreference {
  const rising = clamp01(Number(value?.rising ?? DEFAULT_ARC_PREFERENCE.rising));
  const falling = clamp01(Number(value?.falling ?? DEFAULT_ARC_PREFERENCE.falling));
  const stable = clamp01(Number(value?.stable ?? DEFAULT_ARC_PREFERENCE.stable));
  const total = rising + falling + stable || 1;

  return {
    rising: rising / total,
    falling: falling / total,
    stable: stable / total,
  };
}

function normalizeIdentity(
  value: Partial<EmotionalIdentity> | null | undefined
): EmotionalIdentity {
  if (!value || typeof value !== "object") {
    return {
      ...DEFAULT_IDENTITY,
      timeOfDayAffinity: { ...DEFAULT_TIME_OF_DAY },
      emotionalArcPreference: { ...DEFAULT_ARC_PREFERENCE },
      lastUpdated: Date.now(),
    };
  }

  return {
    moodAffinity: normalizeRecordScores(value.moodAffinity),
    worldAffinity: normalizeRecordScores(value.worldAffinity),
    timeOfDayAffinity: normalizeTimeOfDayAffinity(value.timeOfDayAffinity),
    emotionalArcPreference: normalizeArcPreference(value.emotionalArcPreference),
    lastUpdated:
      typeof value.lastUpdated === "number" && value.lastUpdated > 0
        ? value.lastUpdated
        : Date.now(),
  };
}

async function persistIdentity() {
  try {
    await getStorageReader().setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Persistence failures should not block in-memory updates.
  }
}

function getTrackMoodTags(track: Track | null) {
  return (track?.emotionalTags ?? [])
    .map((tag) => normalizeMoodTag(String(tag)))
    .filter(Boolean);
}

export type TimeOfDayBucket = keyof TimeOfDayAffinity;

export function resolveTimeOfDayBucket(
  track: Track | null,
  now = new Date()
): TimeOfDayBucket {
  const raw = String(track?.emotionalMetadataRaw?.timeOfDay || "")
    .trim()
    .toLowerCase();

  if (raw.includes("morning")) {
    return "morning";
  }

  if (raw.includes("afternoon")) {
    return "afternoon";
  }

  if (raw.includes("evening")) {
    return "evening";
  }

  if (raw.includes("late") || raw.includes("night")) {
    return "lateNight";
  }

  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 17) {
    return "afternoon";
  }

  if (hour >= 17 && hour < 22) {
    return "evening";
  }

  return "lateNight";
}

export function inferEmotionalArc(
  track: Track | null
): keyof EmotionalArcPreference {
  const vector = track?.emotionalVector;

  if (!vector) {
    return "stable";
  }

  if (vector.energy >= 0.62 && vector.aggression >= 0.35) {
    return "rising";
  }

  if (vector.energy <= 0.42 && vector.nostalgia >= 0.52) {
    return "falling";
  }

  return "stable";
}

function applySignedDelta(current: number, delta: number) {
  return clampScore(current + delta);
}

function bumpMoodAffinities(
  moodAffinity: Record<string, number>,
  tags: string[],
  delta: number
) {
  const next = { ...moodAffinity };

  tags.forEach((tag) => {
    next[tag] = applySignedDelta(next[tag] ?? 0, delta);
    if (next[tag] <= 0) {
      delete next[tag];
    }
  });

  return next;
}

function bumpWorldAffinity(
  worldAffinity: Record<string, number>,
  worldId: string,
  delta: number
) {
  const normalizedWorldId = String(worldId || "").trim();
  if (!normalizedWorldId) {
    return worldAffinity;
  }

  const next = { ...worldAffinity };
  next[normalizedWorldId] = applySignedDelta(
    next[normalizedWorldId] ?? 0,
    delta
  );

  if (next[normalizedWorldId] <= 0) {
    delete next[normalizedWorldId];
  }

  return next;
}

export function loadEmotionalIdentity(): Promise<EmotionalIdentity> {
  if (loadPromise) {
    return loadPromise;
  }

  if (hasLoadedIdentity) {
    return Promise.resolve(identity);
  }

  loadPromise = (async () => {
    try {
      const raw = await getStorageReader().getItem(STORAGE_KEY);
      commitIdentity(
        raw
          ? normalizeIdentity(JSON.parse(raw) as Partial<EmotionalIdentity>)
          : normalizeIdentity(null)
      );
    } catch {
      commitIdentity(normalizeIdentity(null));
    } finally {
      hasLoadedIdentity = true;
    }

    return identity;
  })();

  return loadPromise;
}

export function getEmotionalIdentity(): EmotionalIdentity {
  return identity;
}

export function getCachedTopMoods() {
  return cachedTopMoods;
}

export function getCachedTopWorlds() {
  return cachedTopWorlds;
}

export function decayIdentity(now = Date.now()) {
  const elapsedDays = Math.max(0, (now - identity.lastUpdated) / MS_PER_DAY);
  if (elapsedDays <= 0) {
    return identity;
  }

  const decayAmount = elapsedDays * DAILY_DECAY_RATE;
  const nextMoodAffinity: Record<string, number> = {};
  const nextWorldAffinity: Record<string, number> = {};

  Object.entries(identity.moodAffinity).forEach(([tag, score]) => {
    const decayed = clampScore(score - decayAmount);
    if (decayed > 0) {
      nextMoodAffinity[tag] = decayed;
    }
  });

  Object.entries(identity.worldAffinity).forEach(([worldId, score]) => {
    const decayed = clampScore(score - decayAmount);
    if (decayed > 0) {
      nextWorldAffinity[worldId] = decayed;
    }
  });

  const lerpTowardNeutral = (value: number, neutral = 0.25) =>
    clamp01(value - (value - neutral) * Math.min(elapsedDays * DAILY_DECAY_RATE * 4, 0.35));

  return commitIdentity({
    moodAffinity: nextMoodAffinity,
    worldAffinity: nextWorldAffinity,
    timeOfDayAffinity: {
      morning: lerpTowardNeutral(identity.timeOfDayAffinity.morning),
      afternoon: lerpTowardNeutral(identity.timeOfDayAffinity.afternoon),
      evening: lerpTowardNeutral(identity.timeOfDayAffinity.evening),
      lateNight: lerpTowardNeutral(identity.timeOfDayAffinity.lateNight),
    },
    emotionalArcPreference: normalizeArcPreference({
      rising:
        identity.emotionalArcPreference.rising -
        (identity.emotionalArcPreference.rising - DEFAULT_ARC_PREFERENCE.rising) *
          Math.min(elapsedDays * DAILY_DECAY_RATE * 4, 0.35),
      falling:
        identity.emotionalArcPreference.falling -
        (identity.emotionalArcPreference.falling - DEFAULT_ARC_PREFERENCE.falling) *
          Math.min(elapsedDays * DAILY_DECAY_RATE * 4, 0.35),
      stable:
        identity.emotionalArcPreference.stable -
        (identity.emotionalArcPreference.stable - DEFAULT_ARC_PREFERENCE.stable) *
          Math.min(elapsedDays * DAILY_DECAY_RATE * 4, 0.35),
    }),
    lastUpdated: now,
  });
}

export function updateIdentityFromTrack(
  track: Track | null,
  eventType: EmotionalIdentityEventType
) {
  const now = Date.now();
  const settings = getEmotionalFlowSettings();
  const moodTags = getTrackMoodTags(track);
  const timeBucket = resolveTimeOfDayBucket(track, new Date(now));
  const arc = inferEmotionalArc(track);

  if (eventType === "fullPlay") {
    return commitIdentity({
      ...identity,
      moodAffinity: bumpMoodAffinities(identity.moodAffinity, moodTags, 0.06),
      timeOfDayAffinity: {
        ...identity.timeOfDayAffinity,
        [timeBucket]: applySignedDelta(
          identity.timeOfDayAffinity[timeBucket],
          0.05
        ),
      },
      emotionalArcPreference: normalizeArcPreference({
        ...identity.emotionalArcPreference,
        [arc]: identity.emotionalArcPreference[arc] + 0.05,
      }),
      lastUpdated: now,
    });
  }

  if (eventType === "skip") {
    return commitIdentity({
      ...identity,
      moodAffinity: bumpMoodAffinities(identity.moodAffinity, moodTags, -0.03),
      timeOfDayAffinity: {
        ...identity.timeOfDayAffinity,
        [timeBucket]: applySignedDelta(
          identity.timeOfDayAffinity[timeBucket],
          -0.02
        ),
      },
      emotionalArcPreference: normalizeArcPreference({
        ...identity.emotionalArcPreference,
        [arc]: Math.max(0, identity.emotionalArcPreference[arc] - 0.02),
      }),
      lastUpdated: now,
    });
  }

  if (eventType === "worldEnter") {
    const worldId =
      settings.activeWorldId || String(track?.id || "").trim() || null;
    if (!worldId) {
      return identity;
    }

    return commitIdentity({
      ...identity,
      worldAffinity: bumpWorldAffinity(identity.worldAffinity, worldId, 0.08),
      lastUpdated: now,
    });
  }

  if (eventType === "worldExit") {
    const worldId = String(track?.id || settings.activeWorldId || "").trim();
    if (!worldId) {
      return identity;
    }

    return commitIdentity({
      ...identity,
      worldAffinity: bumpWorldAffinity(
        identity.worldAffinity,
        worldId,
        -0.03
      ),
      lastUpdated: now,
    });
  }

  return identity;
}

export function blendWithIdentityBaseline(
  sessionValue: number,
  identityValue: number
) {
  return clamp01(
    sessionValue * (1 - IDENTITY_BLEND_WEIGHT) +
      identityValue * IDENTITY_BLEND_WEIGHT
  );
}

export function getIdentityFlowStrengthBaseline() {
  const arc = identity.emotionalArcPreference;
  return clamp01(
    arc.stable * 0.42 + arc.rising * 0.34 + arc.falling * 0.24
  );
}

export function getIdentityWorldAffinityBaseline(worldId: string | null) {
  if (!worldId) {
    return 0;
  }

  const cached = cachedTopWorlds.find((entry) => entry.id === worldId);
  if (cached) {
    return cached.score;
  }

  return identity.worldAffinity[worldId] ?? 0;
}

export function getIdentityTimeOfDayWeight(now = new Date()) {
  const bucket = resolveTimeOfDayBucket(null, now);
  return identity.timeOfDayAffinity[bucket];
}

export function scoreTrackMoodIdentityAffinity(track: Track) {
  const tags = getTrackMoodTags(track);
  if (!tags.length) {
    return 0;
  }

  const total = tags.reduce(
    (sum, tag) => sum + (identity.moodAffinity[tag] ?? 0),
    0
  );

  return clamp01(total / tags.length);
}

export function applyIdentityMoodOrderingToPool(candidatePool: Track[]) {
  if (candidatePool.length <= 1) {
    return candidatePool;
  }

  const ranked = candidatePool
    .map((track, index) => ({
      track,
      index,
      score: scoreTrackMoodIdentityAffinity(track),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    });

  return ranked.map((entry) => entry.track);
}

refreshIdentityCache();
void loadEmotionalIdentity();
