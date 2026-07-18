/**
 * Preference profile serialization helpers (framework-free).
 */

import type {
  SportsPreferenceProfile,
  SportsPreferenceProfileData,
} from "./types";

export function emptyPreferenceProfile(
  userId: string,
  generatedAt = new Date().toISOString()
): SportsPreferenceProfile {
  return {
    userId,
    explicit: {
      sportIds: new Set(),
      competitionIds: new Set(),
      teamIds: new Set(),
      athleteIds: new Set(),
      countryCodes: new Set(),
      languageCodes: new Set(),
      favoriteFixtureIds: new Set(),
    },
    implicit: {
      sportAffinity: new Map(),
      competitionAffinity: new Map(),
      teamAffinity: new Map(),
      athleteAffinity: new Map(),
    },
    reminders: new Set(),
    continueWatchingFixtureIds: new Set(),
    fixtureOpenCounts: new Map(),
    generatedAt,
  };
}

export function profileToData(
  profile: SportsPreferenceProfile
): SportsPreferenceProfileData {
  return {
    userId: profile.userId,
    explicit: {
      sportIds: [...profile.explicit.sportIds],
      competitionIds: [...profile.explicit.competitionIds],
      teamIds: [...profile.explicit.teamIds],
      athleteIds: [...profile.explicit.athleteIds],
      countryCodes: [...profile.explicit.countryCodes],
      languageCodes: [...profile.explicit.languageCodes],
      favoriteFixtureIds: [...profile.explicit.favoriteFixtureIds],
    },
    implicit: {
      sportAffinity: Object.fromEntries(profile.implicit.sportAffinity),
      competitionAffinity: Object.fromEntries(
        profile.implicit.competitionAffinity
      ),
      teamAffinity: Object.fromEntries(profile.implicit.teamAffinity),
      athleteAffinity: Object.fromEntries(profile.implicit.athleteAffinity),
    },
    reminders: [...profile.reminders],
    continueWatchingFixtureIds: [...profile.continueWatchingFixtureIds],
    fixtureOpenCounts: Object.fromEntries(profile.fixtureOpenCounts),
    generatedAt: profile.generatedAt,
  };
}

export function profileFromData(
  data: SportsPreferenceProfileData
): SportsPreferenceProfile {
  return {
    userId: data.userId,
    explicit: {
      sportIds: new Set(data.explicit.sportIds),
      competitionIds: new Set(data.explicit.competitionIds),
      teamIds: new Set(data.explicit.teamIds),
      athleteIds: new Set(data.explicit.athleteIds),
      countryCodes: new Set(data.explicit.countryCodes),
      languageCodes: new Set(data.explicit.languageCodes),
      favoriteFixtureIds: new Set(data.explicit.favoriteFixtureIds || []),
    },
    implicit: {
      sportAffinity: new Map(Object.entries(data.implicit.sportAffinity || {})),
      competitionAffinity: new Map(
        Object.entries(data.implicit.competitionAffinity || {})
      ),
      teamAffinity: new Map(Object.entries(data.implicit.teamAffinity || {})),
      athleteAffinity: new Map(
        Object.entries(data.implicit.athleteAffinity || {})
      ),
    },
    reminders: new Set(data.reminders),
    continueWatchingFixtureIds: new Set(data.continueWatchingFixtureIds),
    fixtureOpenCounts: new Map(Object.entries(data.fixtureOpenCounts || {})),
    generatedAt: data.generatedAt,
  };
}

export function profileHasSignals(profile: SportsPreferenceProfile | null | undefined): boolean {
  if (!profile) return false;
  const e = profile.explicit;
  if (
    e.sportIds.size ||
    e.competitionIds.size ||
    e.teamIds.size ||
    e.athleteIds.size ||
    e.countryCodes.size ||
    e.favoriteFixtureIds.size ||
    profile.reminders.size ||
    profile.continueWatchingFixtureIds.size
  ) {
    return true;
  }
  const i = profile.implicit;
  return (
    i.sportAffinity.size > 0 ||
    i.competitionAffinity.size > 0 ||
    i.teamAffinity.size > 0 ||
    i.athleteAffinity.size > 0
  );
}
