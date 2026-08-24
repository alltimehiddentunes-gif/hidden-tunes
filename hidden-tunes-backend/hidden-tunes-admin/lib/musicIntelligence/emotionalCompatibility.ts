import { emotionalStage } from "./emotionalProfile";
import type { EmotionalProfile } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const overlap = (a: string[], b: string[]) => {
  const right = new Set(b); const union = new Set([...a, ...b]);
  return union.size ? a.filter((v) => right.has(v)).length / union.size : 0;
};

export function emotionalCompatibility(seed: EmotionalProfile, candidate: EmotionalProfile): number {
  const seedEmotions = [seed.primaryEmotion, ...seed.secondaryEmotions];
  const candidateEmotions = [candidate.primaryEmotion, ...candidate.secondaryEmotions];
  const exact = seed.primaryEmotion === candidate.primaryEmotion ? 1 : overlap(seedEmotions, candidateEmotions);
  const world = overlap(seed.worlds, candidate.worlds);
  const intensity = 1 - Math.abs(seed.intensity - candidate.intensity);
  return clamp01(exact * .48 + world * .32 + intensity * .2);
}

export const thematicCompatibility = (seed: EmotionalProfile, candidate: EmotionalProfile) => overlap(seed.themes, candidate.themes);

export function directionCompatibility(seed: EmotionalProfile, candidate: EmotionalProfile): number {
  if (seed.direction === candidate.direction) return 1;
  if (seed.direction === "unresolved" && ["recovering", "static"].includes(candidate.direction)) return .75;
  if (seed.direction === "recovering" && ["rising", "victorious"].includes(candidate.direction)) return .8;
  if (seed.direction === "descending" && candidate.direction === "victorious") return .05;
  return .4;
}

export function stageDistance(seed: EmotionalProfile, candidate: EmotionalProfile): number {
  return emotionalStage(candidate.primaryEmotion) - emotionalStage(seed.primaryEmotion);
}
