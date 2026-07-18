/**
 * Score sport / country browse cards. Prefer first; retain all.
 */

import type { SportsCountryCard, SportsWorldCard } from "../home/types";
import type { SportsPreferenceProfile } from "./types";

export function scoreSport(
  card: SportsWorldCard,
  profile: SportsPreferenceProfile | null,
  opts: { neutral?: boolean } = {}
): number {
  let score = 0;
  // Stable seeded order: higher sortOrder originally means later — invert gently.
  const sort = Number(card.sortOrder ?? 999);
  score += Math.max(0, 200 - sort);

  if (!profile || opts.neutral) return score;

  if (profile.explicit.sportIds.has(card.id)) score += 300;
  const aff = profile.implicit.sportAffinity.get(card.id) || 0;
  score += Math.min(100, aff);
  return score;
}

export function scoreCountry(
  card: SportsCountryCard,
  profile: SportsPreferenceProfile | null,
  opts: { neutral?: boolean } = {}
): number {
  let score = 0;
  // Stable alpha fallback encoded as negative char codes of first letters.
  score += Math.max(0, 100 - (card.name.charCodeAt(0) || 0) / 2);

  if (!profile || opts.neutral) return score;

  if (profile.explicit.countryCodes.has(card.code.toUpperCase())) {
    score += 250;
  }
  return score;
}
