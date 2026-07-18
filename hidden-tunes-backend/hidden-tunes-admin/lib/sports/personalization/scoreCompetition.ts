/**
 * Score competition cards for Popular Competitions.
 */

import type { SportsCompetitionCard } from "../home/types";
import type { SportsPreferenceProfile } from "./types";

const TYPE_RANK: Record<string, number> = {
  olympic: 10,
  world_cup: 20,
  championship: 30,
  tournament: 40,
  cup: 50,
  league: 60,
  grand_prix: 70,
  series: 80,
  fight_card: 90,
  friendly: 100,
  esports: 110,
  other: 120,
};

export function scoreCompetition(
  card: SportsCompetitionCard,
  profile: SportsPreferenceProfile | null,
  opts: { neutral?: boolean } = {}
): number {
  let score = 0;
  const typeRank = TYPE_RANK[String(card.competitionType || "other")] ?? 120;
  score += Math.max(0, 130 - typeRank);

  if (!profile || opts.neutral) return score;

  if (profile.explicit.competitionIds.has(card.id)) score += 200;
  const aff = profile.implicit.competitionAffinity.get(card.id) || 0;
  score += Math.min(80, aff);

  if (
    card.countryCode &&
    profile.explicit.countryCodes.has(card.countryCode.toUpperCase())
  ) {
    score += 25;
  }

  return score;
}
