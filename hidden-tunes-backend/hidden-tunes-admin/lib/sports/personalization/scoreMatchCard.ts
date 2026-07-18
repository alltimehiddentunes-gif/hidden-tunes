/**
 * Score a SportsMatchCard against a preference profile.
 * Breakdown is internal — never serialize onto public home responses.
 */

import type { SportsMatchCard } from "../home/types";
import type {
  SportsMatchScore,
  SportsPreferenceProfile,
  SportsRecommendationReason,
} from "./types";
import {
  SPORTS_EDITORIAL_MAX,
  SPORTS_EXPLICIT_WEIGHTS,
  SPORTS_FRESHNESS_MAX,
  SPORTS_GLOBAL_IMPORTANCE_MAX,
  SPORTS_IMPLICIT_WEIGHTS,
  SPORTS_LIVE_PRIORITY,
} from "./weights";

export type ScoreMatchCardOptions = {
  profile: SportsPreferenceProfile | null;
  now?: Date;
  /** Neutral mode: only live/freshness/editorial/importance. */
  neutral?: boolean;
};

function emptyScore(): SportsMatchScore {
  return {
    continueWatching: 0,
    reminder: 0,
    followedTeam: 0,
    followedAthlete: 0,
    followedCompetition: 0,
    preferredSport: 0,
    preferredCountry: 0,
    preferredLanguage: 0,
    implicitAffinity: 0,
    livePriority: 0,
    freshness: 0,
    editorialPriority: 0,
    globalImportance: 0,
    discoveryAdjustment: 0,
    total: 0,
  };
}

function sumScore(score: SportsMatchScore): number {
  return (
    score.continueWatching +
    score.reminder +
    score.followedTeam +
    score.followedAthlete +
    score.followedCompetition +
    score.preferredSport +
    score.preferredCountry +
    score.preferredLanguage +
    score.implicitAffinity +
    score.livePriority +
    score.freshness +
    score.editorialPriority +
    score.globalImportance +
    score.discoveryAdjustment
  );
}

export function pickRecommendationReason(
  score: SportsMatchScore,
  card: SportsMatchCard,
  profile: SportsPreferenceProfile | null
): SportsRecommendationReason | null {
  if (!profile) return null;
  if (score.continueWatching > 0) {
    return { code: "continue_watching", label: "Continue watching" };
  }
  if (score.reminder > 0) {
    return { code: "reminder", label: "Reminder set" };
  }
  if (score.followedTeam > 0) {
    const team = card.participants.find(
      (p) => p.type === "team" && profile.explicit.teamIds.has(p.id)
    );
    return {
      code: "followed_team",
      label: team ? `Because you follow ${team.name}` : "Because you follow a team",
    };
  }
  if (score.followedAthlete > 0) {
    const athlete = card.participants.find(
      (p) => p.type === "athlete" && profile.explicit.athleteIds.has(p.id)
    );
    return {
      code: "followed_athlete",
      label: athlete
        ? `Because you follow ${athlete.name}`
        : "Because you follow an athlete",
    };
  }
  if (score.followedCompetition > 0 && card.competition) {
    return {
      code: "followed_competition",
      label: `Because you follow ${card.competition.shortName || card.competition.name}`,
    };
  }
  if (score.preferredSport > 0) {
    return {
      code: "favorite_sport",
      label: `From ${card.sport.name}`,
    };
  }
  return null;
}

export function scoreMatchCard(
  card: SportsMatchCard,
  options: ScoreMatchCardOptions
): { score: SportsMatchScore; reason: SportsRecommendationReason | null } {
  const score = emptyScore();
  const now = options.now ?? new Date();
  const profile = options.profile;

  if (card.status.live) score.livePriority = SPORTS_LIVE_PRIORITY;

  const startsAt = card.timing.startsAt
    ? Date.parse(card.timing.startsAt)
    : NaN;
  if (Number.isFinite(startsAt)) {
    const hours = Math.abs(startsAt - now.getTime()) / 3_600_000;
    score.freshness = Math.max(
      0,
      Math.round(SPORTS_FRESHNESS_MAX - Math.min(SPORTS_FRESHNESS_MAX, hours))
    );
  }

  if (card.badges?.includes("featured")) {
    score.editorialPriority = SPORTS_EDITORIAL_MAX;
  }

  // Stable global importance from competition name length / presence — weak, deterministic.
  if (card.competition) {
    score.globalImportance = Math.min(
      SPORTS_GLOBAL_IMPORTANCE_MAX,
      10 + (card.competition.shortName ? 8 : 0)
    );
  }

  if (!profile || options.neutral) {
    score.total = sumScore(score);
    return { score, reason: null };
  }

  if (profile.continueWatchingFixtureIds.has(card.id)) {
    score.continueWatching =
      SPORTS_IMPLICIT_WEIGHTS.continueWatchingSameFixture;
  }
  if (profile.reminders.has(card.id)) {
    score.reminder = SPORTS_EXPLICIT_WEIGHTS.reminderFixture;
  }
  if (profile.explicit.favoriteFixtureIds.has(card.id)) {
    score.reminder = Math.max(
      score.reminder,
      SPORTS_EXPLICIT_WEIGHTS.favoriteFixture
    );
  }

  for (const p of card.participants) {
    if (p.type === "team" && profile.explicit.teamIds.has(p.id)) {
      score.followedTeam = Math.max(
        score.followedTeam,
        SPORTS_EXPLICIT_WEIGHTS.followedTeam
      );
    }
    if (p.type === "athlete" && profile.explicit.athleteIds.has(p.id)) {
      score.followedAthlete = Math.max(
        score.followedAthlete,
        SPORTS_EXPLICIT_WEIGHTS.followedAthlete
      );
    }
    if (p.type === "team") {
      const aff = profile.implicit.teamAffinity.get(p.id) || 0;
      score.implicitAffinity += Math.min(
        SPORTS_IMPLICIT_WEIGHTS.repeatedParticipantViewing,
        aff
      );
    }
    if (p.type === "athlete") {
      const aff = profile.implicit.athleteAffinity.get(p.id) || 0;
      score.implicitAffinity += Math.min(
        SPORTS_IMPLICIT_WEIGHTS.repeatedParticipantViewing,
        aff
      );
    }
  }

  if (
    card.competition &&
    profile.explicit.competitionIds.has(card.competition.id)
  ) {
    score.followedCompetition = SPORTS_EXPLICIT_WEIGHTS.followedCompetition;
  } else if (card.competition) {
    const aff =
      profile.implicit.competitionAffinity.get(card.competition.id) || 0;
    score.implicitAffinity += Math.min(
      SPORTS_IMPLICIT_WEIGHTS.repeatedCompetitionViewing,
      aff
    );
  }

  if (profile.explicit.sportIds.has(card.sport.id)) {
    score.preferredSport = SPORTS_EXPLICIT_WEIGHTS.followedSport;
  } else {
    const aff = profile.implicit.sportAffinity.get(card.sport.id) || 0;
    score.implicitAffinity += Math.min(
      SPORTS_IMPLICIT_WEIGHTS.repeatedSportViewing,
      aff
    );
  }

  const country =
    card.competition?.countryCode ||
    card.venue?.countryCode ||
    null;
  if (country && profile.explicit.countryCodes.has(country.toUpperCase())) {
    score.preferredCountry = SPORTS_EXPLICIT_WEIGHTS.preferredCountry;
  }

  // Language is soft — only when card metadata exposes a language code.
  const metaLang =
    typeof (card as { languageCode?: string }).languageCode === "string"
      ? (card as { languageCode?: string }).languageCode
      : null;
  if (
    metaLang &&
    profile.explicit.languageCodes.has(metaLang.toLowerCase())
  ) {
    score.preferredLanguage = SPORTS_EXPLICIT_WEIGHTS.preferredLanguage;
  }

  const opens = profile.fixtureOpenCounts.get(card.id) || 0;
  if (opens === 1) {
    score.implicitAffinity += SPORTS_IMPLICIT_WEIGHTS.singleFixtureOpen;
  } else if (opens > 1) {
    score.implicitAffinity += Math.min(
      20,
      opens * SPORTS_IMPLICIT_WEIGHTS.singleFixtureOpen
    );
  }

  // Cap implicit so weak taps cannot drown explicit follows.
  score.implicitAffinity = Math.min(120, score.implicitAffinity);

  score.total = sumScore(score);
  return {
    score,
    reason: pickRecommendationReason(score, card, profile),
  };
}

/** Bound raw total for diagnostics (internal). */
export function boundMatchScoreTotal(total: number): number {
  return Math.max(0, Math.min(800, total));
}
