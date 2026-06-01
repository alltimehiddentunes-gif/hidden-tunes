import {
  getCachedTopMoods,
  getCachedTopWorlds,
  getEmotionalIdentity,
  type TimeOfDayBucket,
} from "../state/emotionalIdentity";
import { getEmotionalFlowLongTermMemory } from "../state/emotionalFlowLongTermMemory";
import { getEmotionalFlowSession } from "../state/emotionalFlowSession";
import { getWorldUiMeta } from "./worldPresentation";

function formatMoodLabel(tag: string) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, " ");
}

function formatTimeBucketLabel(bucket: TimeOfDayBucket) {
  if (bucket === "lateNight") {
    return "Late-night";
  }

  return bucket.charAt(0).toUpperCase() + bucket.slice(1);
}

function buildSessionKey() {
  const session = getEmotionalFlowSession();

  return [
    session.numberOfSkips,
    session.numberOfFullPlays,
    session.numberOfModeToggles,
    session.lastFlowStrength,
    session.lastWorldEntered,
    session.lastWorldExited,
    session.worldAffinityBoost,
    session.worldAffinityBoostUpdatedAt,
  ].join(":");
}

let cachedFlowStrength: number | null = null;
let cachedFlowStrengthKey = "";

let cachedTopWorld: string | null | undefined;
let cachedTopWorldKey = "";

let cachedTopMoods: readonly string[] | undefined;
let cachedTopMoodsKey = "";

let cachedTimeBucket: string | undefined;
let cachedTimeBucketKey = "";

export function getFlowStrength(): number {
  const identity = getEmotionalIdentity();
  const longTerm = getEmotionalFlowLongTermMemory();
  const key = `${identity.lastUpdated}:${buildSessionKey()}:${longTerm.lastUpdated}`;

  if (key === cachedFlowStrengthKey && cachedFlowStrength !== null) {
    return cachedFlowStrength;
  }

  const session = getEmotionalFlowSession();
  const blendedFlowStrength =
    session.lastFlowStrength * 0.62 + longTerm.flowStrengthHistory * 0.38;

  cachedFlowStrength = Math.round(blendedFlowStrength * 100) / 100;
  cachedFlowStrengthKey = key;
  return cachedFlowStrength;
}

export function getTopWorld(): string | null {
  const identity = getEmotionalIdentity();
  const key = `${identity.lastUpdated}:${getCachedTopWorlds()
    .map((entry) => `${entry.id}:${entry.score}`)
    .join("|")}`;

  if (key === cachedTopWorldKey) {
    return cachedTopWorld ?? null;
  }

  const entry = getCachedTopWorlds()[0];
  if (!entry || entry.score <= 0) {
    cachedTopWorld = null;
    cachedTopWorldKey = key;
    return null;
  }

  cachedTopWorld =
    getWorldUiMeta(entry.id)?.title ??
    formatMoodLabel(entry.id.replace(/_/g, "-"));
  cachedTopWorldKey = key;
  return cachedTopWorld;
}

export function getTopMoods(): readonly string[] {
  const identity = getEmotionalIdentity();
  const key = `${identity.lastUpdated}:${getCachedTopMoods().join("|")}`;

  if (key === cachedTopMoodsKey && cachedTopMoods) {
    return cachedTopMoods;
  }

  cachedTopMoods = Object.freeze(
    getCachedTopMoods()
      .filter((tag) => (identity.moodAffinity[tag] ?? 0) > 0)
      .slice(0, 2)
      .map((tag) => formatMoodLabel(tag))
  );
  cachedTopMoodsKey = key;
  return cachedTopMoods;
}

export function getTimeBucket(): string {
  const identity = getEmotionalIdentity();
  const key = String(identity.lastUpdated);

  if (key === cachedTimeBucketKey && cachedTimeBucket) {
    return cachedTimeBucket;
  }

  const entries = Object.entries(identity.timeOfDayAffinity) as Array<
    [TimeOfDayBucket, number]
  >;
  const top = entries.sort((left, right) => right[1] - left[1])[0];

  cachedTimeBucket = top ? formatTimeBucketLabel(top[0]) : "Evening";
  cachedTimeBucketKey = key;
  return cachedTimeBucket;
}
