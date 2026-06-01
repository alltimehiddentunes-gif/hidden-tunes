import { getEmotionalFlowLongTermMemory } from "../state/emotionalFlowLongTermMemory";
import { getEmotionalIdentity } from "../state/emotionalIdentity";
import { getEmotionalFlowSession } from "../state/emotionalFlowSession";
import {
  getFlowStrength,
  getTimeBucket,
  getTopMoods,
  getTopWorld,
} from "./emotionalSelectors";
import { summarizeEmotionalIdentity } from "./summarizeEmotionalIdentity";

export type EmotionalEngineSummary = {
  identitySummary: string | null;
  flowStrength: number;
  topWorld: string | null;
  topMoods: string[];
  timeBucket: string;
  sessionRatio: string;
};

function buildSessionRatioKey() {
  const session = getEmotionalFlowSession();

  return `${session.numberOfSkips}:${session.numberOfFullPlays}`;
}

function formatSessionRatio(numberOfSkips: number, numberOfFullPlays: number) {
  const total = numberOfSkips + numberOfFullPlays;

  if (total <= 0) {
    return "0 full · 0 skip";
  }

  const fullRatio = Math.round((numberOfFullPlays / total) * 100);
  return `${numberOfFullPlays} full · ${numberOfSkips} skip (${fullRatio}%)`;
}

let cachedEngineSummary: EmotionalEngineSummary | null = null;
let cachedEngineSummaryKey = "";

function buildEngineSummaryKey() {
  const identity = getEmotionalIdentity();
  const longTerm = getEmotionalFlowLongTermMemory();
  const session = getEmotionalFlowSession();

  return [
    identity.lastUpdated,
    longTerm.lastUpdated,
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

export function summarizeEmotionalEngine(): EmotionalEngineSummary {
  const cacheKey = buildEngineSummaryKey();

  if (cacheKey === cachedEngineSummaryKey && cachedEngineSummary) {
    return cachedEngineSummary;
  }

  const identity = getEmotionalIdentity();
  const session = getEmotionalFlowSession();

  cachedEngineSummary = Object.freeze({
    identitySummary: summarizeEmotionalIdentity(identity),
    flowStrength: getFlowStrength(),
    topWorld: getTopWorld(),
    topMoods: [...getTopMoods()],
    timeBucket: getTimeBucket(),
    sessionRatio: formatSessionRatio(
      session.numberOfSkips,
      session.numberOfFullPlays
    ),
  });

  cachedEngineSummaryKey = cacheKey;
  return cachedEngineSummary;
}
