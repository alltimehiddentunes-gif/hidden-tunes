import {
  getEmotionalIdentity,
  loadEmotionalIdentity,
  type EmotionalArcPreference,
} from "./emotionalIdentity";
import {
  getEmotionalFlowLongTermMemory,
  loadEmotionalFlowLongTermMemory,
} from "./emotionalFlowLongTermMemory";

const PERSONALITY_REFRESH_MS = 10 * 60 * 1000;

export type EmotionalPersonalityProfile = {
  cinematicIntensity: number;
  worldSignature: Readonly<Record<string, number>>;
  moodSignature: Readonly<Record<string, number>>;
  arcSignature: Readonly<EmotionalArcPreference>;
  nightSignature: number;
  lastUpdated: number;
};

const DEFAULT_ARC_SIGNATURE: EmotionalArcPreference = {
  rising: 0.33,
  falling: 0.33,
  stable: 0.34,
};

const DEFAULT_PROFILE: EmotionalPersonalityProfile = Object.freeze({
  cinematicIntensity: 0.5,
  worldSignature: Object.freeze({}),
  moodSignature: Object.freeze({}),
  arcSignature: Object.freeze({ ...DEFAULT_ARC_SIGNATURE }),
  nightSignature: 0.25,
  lastUpdated: 0,
});

let frozenProfile: EmotionalPersonalityProfile = DEFAULT_PROFILE;
let lastComputedAt = 0;
let lastSeenIdentityUpdated = 0;
let hasLoadedPersonality = false;
let loadPromise: Promise<EmotionalPersonalityProfile> | null = null;

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function topSignatureEntries(
  record: Record<string, number>,
  limit: number
): Readonly<Record<string, number>> {
  const next: Record<string, number> = {};

  Object.entries(record)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .forEach(([key, score]) => {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        return;
      }

      next[normalizedKey] = clamp01(score);
    });

  return Object.freeze(next);
}

function mergeWorldSignature(
  identityWorlds: Record<string, number>,
  longTermWorlds: Record<string, number>
) {
  const merged: Record<string, number> = {};
  const worldIds = new Set([
    ...Object.keys(identityWorlds),
    ...Object.keys(longTermWorlds),
  ]);

  worldIds.forEach((worldId) => {
    merged[worldId] = clamp01(
      (identityWorlds[worldId] ?? 0) * 0.62 +
        (longTermWorlds[worldId] ?? 0) * 0.38
    );
  });

  return topSignatureEntries(merged, 2);
}

function computeCinematicIntensity(
  arcPreference: EmotionalArcPreference,
  flowStrengthHistory: number,
  totalSkips: number,
  totalFullPlays: number
) {
  const arcValues = [
    arcPreference.rising,
    arcPreference.falling,
    arcPreference.stable,
  ];
  const arcSpread =
    Math.max(...arcValues) - Math.min(...arcValues);
  const interactions = totalSkips + totalFullPlays;
  const engagement =
    interactions > 0 ? totalFullPlays / interactions : flowStrengthHistory;

  return clamp01(
    flowStrengthHistory * 0.5 + arcSpread * 0.28 + engagement * 0.22
  );
}

function computeNightSignature(
  lateNightAffinity: number,
  lateNightUsageCount: number
) {
  const usageWeight = Math.min(lateNightUsageCount / 30, 1);

  return clamp01(lateNightAffinity * 0.55 + usageWeight * 0.45);
}

function computePersonalityProfile(now = Date.now()): EmotionalPersonalityProfile {
  const identity = getEmotionalIdentity();
  const longTerm = getEmotionalFlowLongTermMemory();

  const arcSignature = Object.freeze({
    rising: clamp01(identity.emotionalArcPreference.rising),
    falling: clamp01(identity.emotionalArcPreference.falling),
    stable: clamp01(identity.emotionalArcPreference.stable),
  });

  return Object.freeze({
    cinematicIntensity: computeCinematicIntensity(
      arcSignature,
      longTerm.flowStrengthHistory,
      longTerm.totalSkips,
      longTerm.totalFullPlays
    ),
    worldSignature: mergeWorldSignature(
      identity.worldAffinity,
      longTerm.worldAffinityHistory
    ),
    moodSignature: topSignatureEntries(identity.moodAffinity, 3),
    arcSignature,
    nightSignature: computeNightSignature(
      identity.timeOfDayAffinity.lateNight,
      longTerm.lateNightUsageCount
    ),
    lastUpdated: now,
  });
}

function refreshPersonalityProfileIfNeeded(force = false) {
  const identity = getEmotionalIdentity();
  const now = Date.now();
  const identityChanged = identity.lastUpdated !== lastSeenIdentityUpdated;
  const refreshIntervalElapsed = now - lastComputedAt >= PERSONALITY_REFRESH_MS;

  if (!force && !identityChanged && !refreshIntervalElapsed) {
    return frozenProfile;
  }

  frozenProfile = computePersonalityProfile(now);
  lastComputedAt = now;
  lastSeenIdentityUpdated = identity.lastUpdated;
  return frozenProfile;
}

export function loadEmotionalPersonality(): Promise<EmotionalPersonalityProfile> {
  if (loadPromise) {
    return loadPromise;
  }

  if (hasLoadedPersonality) {
    return Promise.resolve(getEmotionalPersonalityProfile());
  }

  loadPromise = (async () => {
    await Promise.all([
      loadEmotionalIdentity(),
      loadEmotionalFlowLongTermMemory(),
    ]);

    hasLoadedPersonality = true;
    return refreshPersonalityProfileIfNeeded(true);
  })();

  return loadPromise;
}

export function getEmotionalPersonalityProfile(): EmotionalPersonalityProfile {
  return refreshPersonalityProfileIfNeeded();
}

void loadEmotionalPersonality();
