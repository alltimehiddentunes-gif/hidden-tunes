import { stageDistance } from "./emotionalCompatibility";
import type { EmotionalProfile, JourneyMode } from "./types";

export function scoreJourney(mode: JourneyMode, seed: EmotionalProfile, candidate: EmotionalProfile): number {
  const delta = stageDistance(seed, candidate);
  if (mode === "CONTINUE") return Math.max(0, 1 - Math.abs(delta) * .22);
  if (mode === "DEEPEN") return delta <= 0 ? Math.max(.35, 1 - Math.abs(delta) * .18) : Math.max(0, .45 - delta * .15);
  if (mode === "RECOVER") return delta >= 1 && delta <= 3 ? 1 : delta === 0 ? .5 : delta > 3 ? .35 : .05;
  return delta >= 2 ? Math.min(1, .65 + delta * .08) : delta === 1 ? .55 : .15;
}
