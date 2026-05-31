import {
  getEmotionalIdentity,
  getCachedTopWorlds,
  type EmotionalArcPreference,
  type EmotionalIdentity,
  type TimeOfDayAffinity,
} from "../state/emotionalIdentity";
import { getWorldUiMeta } from "./worldPresentation";

const MIN_MOOD_SCORE = 0.12;
const STRONG_WORLD_SCORE = 0.35;
const STRONG_TIME_SCORE = 0.32;
const STRONG_ARC_SCORE = 0.38;

let cachedIdentitySummary: string | null | undefined;
let cachedIdentitySummaryKey = "";

function formatMoodLabel(tag: string) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, " ");
}

function formatTimeOfDayLabel(bucket: keyof TimeOfDayAffinity) {
  if (bucket === "lateNight") {
    return "Late-night";
  }

  return bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

function formatArcLabel(arc: keyof EmotionalArcPreference) {
  if (arc === "stable") {
    return "steady";
  }

  return arc;
}

function getTopMoodTags(identity: EmotionalIdentity, limit = 2) {
  return Object.entries(identity.moodAffinity)
    .sort((left, right) => right[1] - left[1])
    .filter(([, score]) => score >= MIN_MOOD_SCORE)
    .slice(0, limit)
    .map(([tag]) => formatMoodLabel(tag));
}

function getTopWorldAffinity(identity: EmotionalIdentity) {
  const cachedEntry = getCachedTopWorlds()[0];
  const entry =
    cachedEntry && cachedEntry.score >= STRONG_WORLD_SCORE
      ? ([cachedEntry.id, cachedEntry.score] as const)
      : Object.entries(identity.worldAffinity).sort(
          (left, right) => right[1] - left[1]
        )[0];

  if (!entry || entry[1] < STRONG_WORLD_SCORE) {
    return null;
  }

  const [worldId, score] = entry;
  const title =
    getWorldUiMeta(worldId)?.title ?? formatMoodLabel(worldId.replace(/_/g, "-"));

  return { title, score };
}

function getTopTimeBucket(identity: EmotionalIdentity) {
  const entries = Object.entries(identity.timeOfDayAffinity) as Array<
    [keyof TimeOfDayAffinity, number]
  >;

  return entries.sort((left, right) => right[1] - left[1])[0] ?? null;
}

function getTopArcPreference(identity: EmotionalIdentity) {
  const entries = Object.entries(identity.emotionalArcPreference) as Array<
    [keyof EmotionalArcPreference, number]
  >;

  return entries.sort((left, right) => right[1] - left[1])[0] ?? null;
}

function hasMeaningfulIdentity(identity: EmotionalIdentity) {
  const moodCount = Object.keys(identity.moodAffinity).length;
  const worldCount = Object.keys(identity.worldAffinity).length;

  return moodCount + worldCount > 0;
}

export function summarizeEmotionalIdentity(
  identity: EmotionalIdentity = getEmotionalIdentity()
): string | null {
  const cacheKey = String(identity.lastUpdated);

  if (cacheKey === cachedIdentitySummaryKey) {
    return cachedIdentitySummary ?? null;
  }

  if (!hasMeaningfulIdentity(identity)) {
    cachedIdentitySummary = null;
    cachedIdentitySummaryKey = cacheKey;
    return null;
  }

  const topWorld = getTopWorldAffinity(identity);
  if (topWorld) {
    cachedIdentitySummary = `Strong affinity for ${topWorld.title} world`;
    cachedIdentitySummaryKey = cacheKey;
    return cachedIdentitySummary;
  }

  const topTime = getTopTimeBucket(identity);
  const topArc = getTopArcPreference(identity);

  if (
    topTime &&
    topArc &&
    topTime[1] >= STRONG_TIME_SCORE &&
    topArc[1] >= STRONG_ARC_SCORE &&
    topArc[0] !== "stable"
  ) {
    cachedIdentitySummary = `${formatTimeOfDayLabel(topTime[0])} listener with ${formatArcLabel(
      topArc[0]
    )} emotional arcs`;
    cachedIdentitySummaryKey = cacheKey;
    return cachedIdentitySummary;
  }

  const moodTags = getTopMoodTags(identity, 2);
  if (moodTags.length >= 2) {
    cachedIdentitySummary = `You gravitate toward ${moodTags[0]} + ${moodTags[1]} moods`;
    cachedIdentitySummaryKey = cacheKey;
    return cachedIdentitySummary;
  }

  if (moodTags.length === 1) {
    cachedIdentitySummary = `You gravitate toward ${moodTags[0]} moods`;
    cachedIdentitySummaryKey = cacheKey;
    return cachedIdentitySummary;
  }

  if (topTime && topTime[1] >= STRONG_TIME_SCORE) {
    cachedIdentitySummary = `${formatTimeOfDayLabel(topTime[0])} listener`;
    cachedIdentitySummaryKey = cacheKey;
    return cachedIdentitySummary;
  }

  if (topArc && topArc[1] >= STRONG_ARC_SCORE) {
    cachedIdentitySummary = `You prefer ${formatArcLabel(topArc[0])} emotional arcs`;
    cachedIdentitySummaryKey = cacheKey;
    return cachedIdentitySummary;
  }

  cachedIdentitySummary = null;
  cachedIdentitySummaryKey = cacheKey;
  return null;
}
