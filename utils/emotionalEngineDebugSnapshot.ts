import { getEmotionalFlowLongTermMemory } from "../state/emotionalFlowLongTermMemory";
import { getEmotionalIdentity } from "../state/emotionalIdentity";
import { getEmotionalPersonalityProfile } from "../state/emotionalPersonality";
import {
  getEmotionalQueueLastRebuildTimestamp,
  getEmotionalQueueSnapshot,
} from "../state/emotionalQueueController";
import {
  getDecayedWorldAffinityBoost,
  getEmotionalFlowSession,
  isEmotionalFlowFullPlayStreakActive,
  isEmotionalFlowSkipBurstActive,
} from "../state/emotionalFlowSession";
import { emotionalFlowAutoTune } from "./emotionalFlowAutoTune";

export type EmotionalEngineDebugSnapshot = {
  flowStrengthRaw: number;
  flowStrengthSmoothed: number;
  worldAffinity: Record<string, number>;
  moodAffinity: Record<string, number>;
  timeOfDayAffinity: Record<string, number>;
  emotionalArcPreference: Record<string, number>;
  sessionMetrics: {
    skips: number;
    fullPlays: number;
    modeToggles: number;
    skipBurstActive: boolean;
    fullPlayStreakActive: boolean;
    lastFlowStrength: number;
    worldAffinityBoost: number;
  };
  longTermMemory: {
    totalSkips: number;
    totalFullPlays: number;
    lateNightUsageCount: number;
    flowStrengthHistory: number;
    lastUpdated: number;
    worldAffinityHistory: Record<string, number>;
  };
  autoTune: {
    flowStrength: number;
    worldAffinityBoost: number;
    lateNightBoost: number;
  };
  queue: {
    lastRebuildTimestamp: number;
    lastRebuildAgeMs: number;
    queueLength: number;
    queueIndex: number;
  };
  personalityProfile: {
    cinematicIntensity: number;
    worldSignature: Record<string, number>;
    moodSignature: Record<string, number>;
    arcSignature: Record<string, number>;
    nightSignature: number;
    lastUpdated: number;
  };
  personalityBiasApplied: true;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function computeRawFlowStrength() {
  const session = getEmotionalFlowSession();
  const interactions = session.numberOfSkips + session.numberOfFullPlays;

  if (interactions <= 0) {
    return session.lastFlowStrength;
  }

  const completionRatio = session.numberOfFullPlays / interactions;
  const skipPressure = session.numberOfSkips / interactions;
  const toggleDrag = Math.min(session.numberOfModeToggles * 0.04, 0.2);

  return clamp01(
    completionRatio * 0.72 + session.lastFlowStrength * 0.28 - skipPressure * 0.18 - toggleDrag
  );
}

export function collectEmotionalEngineDebugSnapshot(): EmotionalEngineDebugSnapshot {
  const session = getEmotionalFlowSession();
  const identity = getEmotionalIdentity();
  const longTerm = getEmotionalFlowLongTermMemory();
  const queueSnapshot = getEmotionalQueueSnapshot();
  const lastRebuildTimestamp = getEmotionalQueueLastRebuildTimestamp();
  const autoTune = emotionalFlowAutoTune();
  const personality = getEmotionalPersonalityProfile();

  return {
    flowStrengthRaw: computeRawFlowStrength(),
    flowStrengthSmoothed: session.lastFlowStrength,
    worldAffinity: { ...identity.worldAffinity },
    moodAffinity: { ...identity.moodAffinity },
    timeOfDayAffinity: { ...identity.timeOfDayAffinity },
    emotionalArcPreference: { ...identity.emotionalArcPreference },
    sessionMetrics: {
      skips: session.numberOfSkips,
      fullPlays: session.numberOfFullPlays,
      modeToggles: session.numberOfModeToggles,
      skipBurstActive: isEmotionalFlowSkipBurstActive(),
      fullPlayStreakActive: isEmotionalFlowFullPlayStreakActive(),
      lastFlowStrength: session.lastFlowStrength,
      worldAffinityBoost: getDecayedWorldAffinityBoost(),
    },
    longTermMemory: {
      totalSkips: longTerm.totalSkips,
      totalFullPlays: longTerm.totalFullPlays,
      lateNightUsageCount: longTerm.lateNightUsageCount,
      flowStrengthHistory: longTerm.flowStrengthHistory,
      lastUpdated: longTerm.lastUpdated,
      worldAffinityHistory: { ...longTerm.worldAffinityHistory },
    },
    autoTune,
    queue: {
      lastRebuildTimestamp,
      lastRebuildAgeMs: lastRebuildTimestamp
        ? Date.now() - lastRebuildTimestamp
        : 0,
      queueLength: queueSnapshot.emotionalQueue.length,
      queueIndex: queueSnapshot.queueIndex,
    },
    personalityProfile: {
      cinematicIntensity: personality.cinematicIntensity,
      worldSignature: { ...personality.worldSignature },
      moodSignature: { ...personality.moodSignature },
      arcSignature: { ...personality.arcSignature },
      nightSignature: personality.nightSignature,
      lastUpdated: personality.lastUpdated,
    },
    personalityBiasApplied: true,
  };
}

function formatRecord(record: Record<string, number>) {
  const entries = Object.entries(record);
  if (!entries.length) {
    return "{}";
  }

  return entries
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `${key}:${value.toFixed(3)}`)
    .join("  ");
}

export function formatEmotionalEngineDebugSnapshot(
  snapshot: EmotionalEngineDebugSnapshot
) {
  const lines = [
    "── flowStrength ──",
    `raw ${snapshot.flowStrengthRaw.toFixed(3)}  smoothed ${snapshot.flowStrengthSmoothed.toFixed(3)}`,
    "── auto-tune ──",
    `flow ${snapshot.autoTune.flowStrength.toFixed(3)}  world ${snapshot.autoTune.worldAffinityBoost.toFixed(3)}  late ${snapshot.autoTune.lateNightBoost.toFixed(3)}`,
    "── worldAffinity ──",
    formatRecord(snapshot.worldAffinity),
    "── moodAffinity ──",
    formatRecord(snapshot.moodAffinity),
    "── timeOfDayAffinity ──",
    formatRecord(snapshot.timeOfDayAffinity),
    "── emotionalArcPreference ──",
    formatRecord(snapshot.emotionalArcPreference),
    "── session ──",
    `skips ${snapshot.sessionMetrics.skips}  full ${snapshot.sessionMetrics.fullPlays}  toggles ${snapshot.sessionMetrics.modeToggles}`,
    `skipBurst ${snapshot.sessionMetrics.skipBurstActive ? "yes" : "no"}  fullStreak ${snapshot.sessionMetrics.fullPlayStreakActive ? "yes" : "no"}`,
    `sessionBoost ${snapshot.sessionMetrics.worldAffinityBoost.toFixed(3)}`,
    "── long-term ──",
    `totalSkips ${snapshot.longTermMemory.totalSkips}  totalFull ${snapshot.longTermMemory.totalFullPlays}`,
    `lateNightUses ${snapshot.longTermMemory.lateNightUsageCount}  flowHist ${snapshot.longTermMemory.flowStrengthHistory.toFixed(3)}`,
    `lastUpdated ${new Date(snapshot.longTermMemory.lastUpdated).toISOString()}`,
    `worldHist ${formatRecord(snapshot.longTermMemory.worldAffinityHistory)}`,
    "── queue rebuild ──",
    snapshot.queue.lastRebuildTimestamp
      ? `at ${new Date(snapshot.queue.lastRebuildTimestamp).toISOString()}  ageMs ${snapshot.queue.lastRebuildAgeMs}`
      : "never",
    `queue ${snapshot.queue.queueIndex + 1}/${snapshot.queue.queueLength}`,
    "── personalityProfile ──",
    `personalityBiasApplied ${snapshot.personalityBiasApplied ? "true" : "false"}`,
    `cinematic ${snapshot.personalityProfile.cinematicIntensity.toFixed(3)}  night ${snapshot.personalityProfile.nightSignature.toFixed(3)}`,
    `worldSig ${formatRecord(snapshot.personalityProfile.worldSignature)}`,
    `moodSig ${formatRecord(snapshot.personalityProfile.moodSignature)}`,
    `arcSig ${formatRecord(snapshot.personalityProfile.arcSignature)}`,
    `updated ${new Date(snapshot.personalityProfile.lastUpdated).toISOString()}`,
  ];

  return lines.join("\n");
}
