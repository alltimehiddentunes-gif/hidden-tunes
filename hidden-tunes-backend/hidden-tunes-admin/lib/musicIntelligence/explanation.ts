import type { ScoreComponents } from "./types";

const label = (name: string, value: number) => `${name} ${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
export function explainScore(c: ScoreComponents): string[] {
  return [
    label("emotional", c.emotional), label("theme", c.thematic), label("direction", c.direction),
    label("journey", c.journey), label("genre", c.genre), label("artist", c.artist),
    label("user", c.user), label("energy", c.energy), label("freshness", c.freshness),
    label("repetition", c.repetitionPenalty), label("skip", c.skipPenalty), label("final", c.final),
  ];
}
