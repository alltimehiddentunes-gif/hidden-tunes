/**
 * Build a bounded preference profile from already-fetched Sports rows.
 * Framework-free — used by tests and the DB loader.
 */

import { applyRecencyDecay, isMeaningfulSportsWatch } from "./decay";
import { emptyPreferenceProfile } from "./profileHelpers";
import type { SportsPreferenceProfile } from "./types";
import {
  SPORTS_IMPLICIT_WEIGHTS,
  SPORTS_PERSONALIZATION_BOUNDS,
} from "./weights";

export type PreferenceSignalRows = {
  userId: string;
  follows?: Array<{ target_type: string; target_id: string }>;
  favorites?: Array<{ target_type: string; target_id: string }>;
  preferences?: {
    preferred_country?: string | null;
    preferred_sports?: string[] | null;
    preferred_teams?: string[] | null;
  } | null;
  reminders?: Array<{ fixture_id: string; status?: string }>;
  continueWatching?: Array<{ fixture_id?: string | null }>;
  watchHistory?: Array<{
    fixture_id?: string | null;
    position_ms?: number | null;
    duration_ms?: number | null;
    completed?: boolean | null;
    last_watched_at?: string | null;
    sport_id?: string | null;
    competition_id?: string | null;
    team_ids?: string[] | null;
    athlete_ids?: string[] | null;
  }>;
  /** Optional request locale — stored as soft language preference, not geo. */
  languageCodes?: string[];
  now?: Date;
  generatedAt?: string;
};

function bump(
  map: Map<string, number>,
  id: string | null | undefined,
  amount: number
) {
  if (!id || !(amount > 0)) return;
  map.set(id, (map.get(id) || 0) + amount);
}

export function buildPreferenceProfileFromSignals(
  input: PreferenceSignalRows
): SportsPreferenceProfile {
  const now = input.now ?? new Date();
  const profile = emptyPreferenceProfile(
    input.userId,
    input.generatedAt || now.toISOString()
  );

  for (const follow of (input.follows || []).slice(
    0,
    SPORTS_PERSONALIZATION_BOUNDS.maxFollows
  )) {
    const id = follow.target_id;
    if (!id) continue;
    if (follow.target_type === "team") profile.explicit.teamIds.add(id);
    else if (follow.target_type === "athlete") profile.explicit.athleteIds.add(id);
    else if (follow.target_type === "competition") {
      profile.explicit.competitionIds.add(id);
    } else if (follow.target_type === "sport") {
      profile.explicit.sportIds.add(id);
    }
  }

  for (const fav of (input.favorites || []).slice(
    0,
    SPORTS_PERSONALIZATION_BOUNDS.maxFavorites
  )) {
    if (fav.target_type === "fixture" && fav.target_id) {
      profile.explicit.favoriteFixtureIds.add(fav.target_id);
    } else if (fav.target_type === "team" && fav.target_id) {
      profile.explicit.teamIds.add(fav.target_id);
    } else if (fav.target_type === "competition" && fav.target_id) {
      profile.explicit.competitionIds.add(fav.target_id);
    }
  }

  const prefs = input.preferences;
  if (prefs?.preferred_country) {
    profile.explicit.countryCodes.add(
      String(prefs.preferred_country).toUpperCase()
    );
  }
  for (const sportId of prefs?.preferred_sports || []) {
    if (sportId) profile.explicit.sportIds.add(String(sportId));
  }
  for (const teamId of prefs?.preferred_teams || []) {
    if (teamId) profile.explicit.teamIds.add(String(teamId));
  }

  for (const lang of input.languageCodes || []) {
    const code = String(lang || "")
      .trim()
      .toLowerCase()
      .slice(0, 16);
    if (code) profile.explicit.languageCodes.add(code);
  }

  for (const reminder of (input.reminders || []).slice(
    0,
    SPORTS_PERSONALIZATION_BOUNDS.maxReminders
  )) {
    if (reminder.status && reminder.status === "cancelled") continue;
    if (reminder.fixture_id) profile.reminders.add(reminder.fixture_id);
  }

  for (const row of input.continueWatching || []) {
    if (row.fixture_id) {
      profile.continueWatchingFixtureIds.add(row.fixture_id);
    }
  }

  const history = (input.watchHistory || []).slice(
    0,
    SPORTS_PERSONALIZATION_BOUNDS.maxHistoryRows
  );
  const lookbackMs =
    SPORTS_PERSONALIZATION_BOUNDS.maxLookbackDays * 24 * 60 * 60_000;

  for (const row of history) {
    const at = row.last_watched_at
      ? new Date(row.last_watched_at).getTime()
      : NaN;
    if (Number.isFinite(at) && now.getTime() - at > lookbackMs) continue;

    if (row.fixture_id) {
      profile.fixtureOpenCounts.set(
        row.fixture_id,
        (profile.fixtureOpenCounts.get(row.fixture_id) || 0) + 1
      );
    }

    const meaningful = isMeaningfulSportsWatch({
      positionMs: row.position_ms,
      durationMs: row.duration_ms,
      completed: row.completed,
    });

    let base: number = SPORTS_IMPLICIT_WEIGHTS.singleFixtureOpen;
    if (row.completed && meaningful) {
      base = SPORTS_IMPLICIT_WEIGHTS.completedMeaningfulSession;
    } else if (meaningful) {
      base = SPORTS_IMPLICIT_WEIGHTS.meaningfulWatchSession;
    }

    const weight = applyRecencyDecay(
      base,
      row.last_watched_at || now.toISOString(),
      now
    );

    bump(profile.implicit.sportAffinity, row.sport_id, weight * 0.45);
    bump(
      profile.implicit.competitionAffinity,
      row.competition_id,
      weight * 0.65
    );
    for (const teamId of row.team_ids || []) {
      bump(
        profile.implicit.teamAffinity,
        teamId,
        weight *
          (SPORTS_IMPLICIT_WEIGHTS.repeatedParticipantViewing /
            SPORTS_IMPLICIT_WEIGHTS.meaningfulWatchSession)
      );
    }
    for (const athleteId of row.athlete_ids || []) {
      bump(
        profile.implicit.athleteAffinity,
        athleteId,
        weight *
          (SPORTS_IMPLICIT_WEIGHTS.repeatedParticipantViewing /
            SPORTS_IMPLICIT_WEIGHTS.meaningfulWatchSession)
      );
    }
  }

  return profile;
}
