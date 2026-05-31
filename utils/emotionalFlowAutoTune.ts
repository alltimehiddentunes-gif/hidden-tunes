import {
  applyIdentityMoodOrderingToPool,
  blendWithIdentityBaseline,
  decayIdentity,
  getCachedTopWorlds,
  getEmotionalIdentity,
  getIdentityFlowStrengthBaseline,
  getIdentityTimeOfDayWeight,
  getIdentityWorldAffinityBaseline,
  loadEmotionalIdentity,
  resolveTimeOfDayBucket,
} from "../state/emotionalIdentity";
import { getEmotionalFlowSettings } from "../state/emotionalFlowSettings";
import {
  blendWithLongTermBaseline,
  getEmotionalFlowLongTermMemory,
  getLongTermFlowStrengthBaseline,
  getLongTermLateNightBaseline,
  getLongTermWorldAffinityBaseline,
} from "../state/emotionalFlowLongTermMemory";
import {
  getDecayedWorldAffinityBoost,
  getEmotionalFlowSession,
  isEmotionalFlowFullPlayStreakActive,
  isEmotionalFlowSkipBurstActive,
  setEmotionalFlowLastFlowStrength,
} from "../state/emotionalFlowSession";
import { getEmotionalPersonalityProfile } from "../state/emotionalPersonality";
import type { Track } from "../types/music";
import { applyPersonalityBias } from "./emotionalPersonalityBias";
import {
  LATE_NIGHT_MOOD_TAGS,
  trackMatchesAnyMoodTags,
} from "./emotionalFlowTrackFilter";
import { getWorldPreset } from "./emotionalWorlds";

export type EmotionalFlowAutoTune = {
  flowStrength: number;
  worldAffinityBoost: number;
  lateNightBoost: number;
};

const FLOW_STRENGTH_SMOOTHING = 0.7;

let cachedAutoTune: EmotionalFlowAutoTune | null = null;
let cachedAutoTuneKey = "";
let cachedAutoTuneBaseFlowStrength = 0.5;

function buildAutoTuneCacheKey(
  session: ReturnType<typeof getEmotionalFlowSession>,
  settings: ReturnType<typeof getEmotionalFlowSettings>,
  longTerm: ReturnType<typeof getEmotionalFlowLongTermMemory>,
  identity: ReturnType<typeof getEmotionalIdentity>
) {
  const topWorlds = getCachedTopWorlds()
    .map((entry) => `${entry.id}:${entry.score}`)
    .join("|");

  return [
    session.numberOfSkips,
    session.numberOfFullPlays,
    session.numberOfModeToggles,
    session.lastFlowStrength,
    session.lastWorldEntered,
    session.lastWorldExited,
    session.worldAffinityBoost,
    session.worldAffinityBoostUpdatedAt,
    settings.activeWorldId,
    settings.stayInWorldEnabled,
    settings.lateNightModeEnabled,
    longTerm.lastUpdated,
    longTerm.totalSkips,
    longTerm.totalFullPlays,
    longTerm.flowStrengthHistory,
    identity.lastUpdated,
    topWorlds,
    resolveTimeOfDayBucket(null),
    getEmotionalPersonalityProfile().lastUpdated,
  ].join(":");
}

function clamp01(value: number) {
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

function getTrackMoodTags(track: Track) {
  return (track.emotionalTags ?? [])
    .map((tag) => normalizeMoodTag(String(tag)))
    .filter(Boolean);
}

function countSharedMoodTags(left: Track, right: Track) {
  const leftTags = new Set(getTrackMoodTags(left));
  return getTrackMoodTags(right).filter((tag) => leftTags.has(tag)).length;
}

function dedupeTracksById(tracks: Track[]) {
  const seen = new Set<string>();
  const deduped: Track[] = [];

  tracks.forEach((track) => {
    const id = String(track.id);
    if (seen.has(id)) {
      return;
    }

    seen.add(id);
    deduped.push(track);
  });

  return deduped;
}

function ensureStartTrackInPool(pool: Track[], startTrack: Track) {
  const startId = String(startTrack.id);
  const includesStart = pool.some((track) => String(track.id) === startId);

  if (includesStart) {
    return pool.length ? pool : [startTrack];
  }

  return [startTrack, ...pool];
}

function widenPool(
  sourcePool: Track[],
  candidatePool: Track[],
  widenCount: number
) {
  const existingIds = new Set(candidatePool.map((track) => String(track.id)));
  const extras = sourcePool
    .filter((track) => !existingIds.has(String(track.id)))
    .slice(0, widenCount);

  return dedupeTracksById([...candidatePool, ...extras]);
}

function narrowPool(candidatePool: Track[], startTrack: Track, minSharedTags: number) {
  const narrowed = candidatePool.filter(
    (track) => countSharedMoodTags(startTrack, track) >= minSharedTags
  );

  return narrowed.length >= 3 ? narrowed : candidatePool;
}

export function emotionalFlowAutoTune(): EmotionalFlowAutoTune {
  const session = getEmotionalFlowSession();
  const settings = getEmotionalFlowSettings();
  const longTerm = getEmotionalFlowLongTermMemory();
  const identity = getEmotionalIdentity();
  const cacheKey = buildAutoTuneCacheKey(session, settings, longTerm, identity);

  if (cacheKey === cachedAutoTuneKey && cachedAutoTune) {
    setEmotionalFlowLastFlowStrength(cachedAutoTuneBaseFlowStrength);
    return cachedAutoTune;
  }

  const interactions = session.numberOfSkips + session.numberOfFullPlays;
  const previousFlowStrength = session.lastFlowStrength;
  const longTermInteractions = longTerm.totalSkips + longTerm.totalFullPlays;

  const sessionCompletionRatio =
    interactions > 0
      ? session.numberOfFullPlays / interactions
      : previousFlowStrength;

  const longTermCompletionRatio =
    longTermInteractions > 0
      ? longTerm.totalFullPlays / longTermInteractions
      : longTerm.flowStrengthHistory;

  const completionRatio = blendWithLongTermBaseline(
    sessionCompletionRatio,
    longTermCompletionRatio
  );

  const sessionSkipPressure =
    interactions > 0 ? session.numberOfSkips / interactions : 0.5;
  const longTermSkipPressure =
    longTermInteractions > 0
      ? longTerm.totalSkips / longTermInteractions
      : 0.5;
  const skipPressure = blendWithLongTermBaseline(
    sessionSkipPressure,
    longTermSkipPressure
  );
  const toggleDrag = Math.min(session.numberOfModeToggles * 0.04, 0.2);

  let computedFlowStrength =
    completionRatio * 0.72 +
    blendWithLongTermBaseline(previousFlowStrength, getLongTermFlowStrengthBaseline()) *
      0.28 -
    skipPressure * 0.18;
  computedFlowStrength -= toggleDrag;
  computedFlowStrength = clamp01(computedFlowStrength);

  const flowStrength =
    Number.isFinite(previousFlowStrength)
      ? clamp01(
          previousFlowStrength * FLOW_STRENGTH_SMOOTHING +
            computedFlowStrength * (1 - FLOW_STRENGTH_SMOOTHING)
        )
      : computedFlowStrength;

  const blendedFlowStrength = blendWithLongTermBaseline(
    flowStrength,
    getLongTermFlowStrengthBaseline()
  );
  const identityFlowBaseline = getIdentityFlowStrengthBaseline();
  const identityAwareFlowStrength = blendWithIdentityBaseline(
    blendedFlowStrength,
    identityFlowBaseline
  );

  let worldAffinityBoost = blendWithLongTermBaseline(
    getDecayedWorldAffinityBoost(),
    getLongTermWorldAffinityBaseline(settings.activeWorldId)
  );
  worldAffinityBoost = blendWithIdentityBaseline(
    worldAffinityBoost,
    getIdentityWorldAffinityBaseline(settings.activeWorldId)
  );

  if (settings.activeWorldId) {
    worldAffinityBoost += settings.stayInWorldEnabled ? 0.25 : 0.15;
  }

  if (session.lastWorldEntered) {
    worldAffinityBoost += 0.1;
    worldAffinityBoost = blendWithLongTermBaseline(
      worldAffinityBoost,
      getLongTermWorldAffinityBaseline(session.lastWorldEntered)
    );
    worldAffinityBoost = blendWithIdentityBaseline(
      worldAffinityBoost,
      getIdentityWorldAffinityBaseline(session.lastWorldEntered)
    );
  }

  if (
    session.lastWorldExited &&
    session.lastWorldEntered &&
    session.lastWorldExited !== session.lastWorldEntered
  ) {
    worldAffinityBoost -= 0.08;
  }

  worldAffinityBoost = clamp01(worldAffinityBoost);

  let lateNightBoost = settings.lateNightModeEnabled ? 0.65 : 0.2;
  lateNightBoost = blendWithLongTermBaseline(
    lateNightBoost,
    getLongTermLateNightBaseline()
  );

  const currentTimeBucket = resolveTimeOfDayBucket(null);
  const timeOfDayWeight = getIdentityTimeOfDayWeight();
  lateNightBoost = blendWithIdentityBaseline(
    lateNightBoost,
    identity.timeOfDayAffinity[currentTimeBucket]
  );

  if (currentTimeBucket === "lateNight") {
    lateNightBoost = clamp01(lateNightBoost + timeOfDayWeight * 0.12);
  }

  if (session.numberOfFullPlays > session.numberOfSkips) {
    lateNightBoost += 0.08;
  }

  if (skipPressure > 0.6) {
    lateNightBoost += 0.12;
  }

  lateNightBoost = clamp01(lateNightBoost);

  cachedAutoTuneBaseFlowStrength = identityAwareFlowStrength;
  setEmotionalFlowLastFlowStrength(identityAwareFlowStrength);

  const baseResult: EmotionalFlowAutoTune = {
    flowStrength: identityAwareFlowStrength,
    worldAffinityBoost,
    lateNightBoost,
  };
  const personality = getEmotionalPersonalityProfile();
  cachedAutoTune = applyPersonalityBias(baseResult, personality);
  cachedAutoTuneKey = cacheKey;

  return cachedAutoTune;
}

export function applyEmotionalFlowAutoTuneToPool(
  sourcePool: Track[],
  filteredPool: Track[],
  startTrack: Track,
  autoTune: EmotionalFlowAutoTune
): Track[] {
  const settings = getEmotionalFlowSettings();
  let candidatePool = filteredPool.length ? filteredPool : sourcePool;

  if (isEmotionalFlowSkipBurstActive()) {
    const aggressiveWidenCount = Math.max(
      16,
      Math.ceil(sourcePool.length * 0.55)
    );
    candidatePool = widenPool(sourcePool, candidatePool, aggressiveWidenCount);
  } else if (autoTune.flowStrength < 0.3) {
    const widenCount = Math.max(
      8,
      Math.ceil(sourcePool.length * (0.35 + (0.3 - autoTune.flowStrength)))
    );
    candidatePool = widenPool(sourcePool, candidatePool, widenCount);
  } else if (isEmotionalFlowFullPlayStreakActive()) {
    const narrowed = narrowPool(candidatePool, startTrack, 1);
    if (narrowed.length >= 3) {
      candidatePool = narrowed;
    }
  } else if (autoTune.flowStrength > 0.7) {
    candidatePool = narrowPool(candidatePool, startTrack, 2);
  }

  if (autoTune.worldAffinityBoost > 0.5 && settings.activeWorldId) {
    const preset = getWorldPreset(settings.activeWorldId);
    const worldTags = preset?.moodTags ?? [];

    if (worldTags.length) {
      const worldMatches = candidatePool.filter((track) =>
        trackMatchesAnyMoodTags(track, worldTags)
      );
      const remainder = candidatePool.filter(
        (track) => !worldMatches.some((match) => match.id === track.id)
      );
      candidatePool = dedupeTracksById([...worldMatches, ...remainder]);
    }
  }

  if (autoTune.lateNightBoost > 0.5) {
    const calmMatches = candidatePool.filter((track) =>
      trackMatchesAnyMoodTags(track, [...LATE_NIGHT_MOOD_TAGS])
    );
    const remainder = candidatePool.filter(
      (track) => !calmMatches.some((match) => match.id === track.id)
    );
    candidatePool = dedupeTracksById([...calmMatches, ...remainder]);
  }

  candidatePool = applyIdentityMoodOrderingToPool(candidatePool);

  return ensureStartTrackInPool(candidatePool, startTrack);
}
