/**
 * Fixture matching helpers — pure, no DB.
 */

import { normalizeFootballName } from "./normalize";
import type { CanonicalScoreBatMatch } from "./types";

export type ExistingFixtureCandidate = {
  id: string;
  providerExternalId?: string | null;
  startsAt: string;
  homeName?: string | null;
  awayName?: string | null;
  competitionName?: string | null;
};

export type MatchDecision =
  | { kind: "exact_external"; fixtureId: string }
  | { kind: "kickoff_pair"; fixtureId: string; confidence: number }
  | { kind: "ambiguous"; candidateIds: string[]; reason: string }
  | { kind: "create_new" };

const KICKOFF_TOLERANCE_MS = 30 * 60_000;

export function matchScoreBatToExistingFixtures(
  incoming: CanonicalScoreBatMatch,
  existing: ExistingFixtureCandidate[],
  opts: { kickoffToleranceMs?: number } = {}
): MatchDecision {
  const tolerance = opts.kickoffToleranceMs ?? KICKOFF_TOLERANCE_MS;

  const byExternal = existing.find(
    (e) =>
      e.providerExternalId &&
      e.providerExternalId === incoming.providerNativeId
  );
  if (byExternal) {
    return { kind: "exact_external", fixtureId: byExternal.id };
  }

  const home = normalizeFootballName(incoming.homeTeam?.name || "");
  const away = normalizeFootballName(incoming.awayTeam?.name || "");
  const start = Date.parse(incoming.startsAt);
  if (!home || !away || !Number.isFinite(start)) {
    return { kind: "create_new" };
  }

  const windowHits = existing.filter((e) => {
    const eStart = Date.parse(e.startsAt);
    if (!Number.isFinite(eStart)) return false;
    if (Math.abs(eStart - start) > tolerance) return false;
    const eHome = normalizeFootballName(e.homeName || "");
    const eAway = normalizeFootballName(e.awayName || "");
    if (!eHome || !eAway) return false;
    return (
      (eHome === home && eAway === away) || (eHome === away && eAway === home)
    );
  });

  if (windowHits.length === 1) {
    return {
      kind: "kickoff_pair",
      fixtureId: windowHits[0].id,
      confidence: 0.9,
    };
  }
  if (windowHits.length > 1) {
    return {
      kind: "ambiguous",
      candidateIds: windowHits.map((h) => h.id),
      reason: "multiple_fixtures_in_kickoff_window",
    };
  }

  // Title-only similar matches are never merged.
  return { kind: "create_new" };
}
