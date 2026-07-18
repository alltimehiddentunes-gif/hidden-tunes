/** Configurable first-page limits for Sports home IA sections. */

export type SportsHomeLimits = {
  liveNow: number;
  startingSoon: number;
  featured: number;
  becauseYouFollow: number;
  continueWatching: number;
  popularCompetitions: number;
  browseSports: number;
  browseCountries: number;
  todaysSchedule: number;
  trending: number;
  recentlyFinished: number;
  highlights: number;
  replays: number;
  startingSoonWindowMs: number;
  recentlyFinishedWindowMs: number;
  sectionTimeoutMs: number;
};

export const SPORTS_HOME_DEFAULT_LIMITS: SportsHomeLimits = {
  liveNow: 20,
  startingSoon: 20,
  featured: 20,
  becauseYouFollow: 20,
  continueWatching: 20,
  popularCompetitions: 20,
  browseSports: 30,
  browseCountries: 30,
  todaysSchedule: 40,
  trending: 20,
  recentlyFinished: 20,
  highlights: 20,
  replays: 20,
  startingSoonWindowMs: 120 * 60_000,
  recentlyFinishedWindowMs: 24 * 60 * 60_000,
  sectionTimeoutMs: 4_000,
};

export function resolveSportsHomeLimits(
  over: Partial<SportsHomeLimits> = {}
): SportsHomeLimits {
  const clamp = (n: number, max = 50) =>
    Math.min(max, Math.max(1, Math.floor(n)));
  return {
    liveNow: clamp(over.liveNow ?? SPORTS_HOME_DEFAULT_LIMITS.liveNow),
    startingSoon: clamp(
      over.startingSoon ?? SPORTS_HOME_DEFAULT_LIMITS.startingSoon
    ),
    featured: clamp(over.featured ?? SPORTS_HOME_DEFAULT_LIMITS.featured),
    becauseYouFollow: clamp(
      over.becauseYouFollow ?? SPORTS_HOME_DEFAULT_LIMITS.becauseYouFollow
    ),
    continueWatching: clamp(
      over.continueWatching ?? SPORTS_HOME_DEFAULT_LIMITS.continueWatching
    ),
    popularCompetitions: clamp(
      over.popularCompetitions ??
        SPORTS_HOME_DEFAULT_LIMITS.popularCompetitions
    ),
    browseSports: clamp(
      over.browseSports ?? SPORTS_HOME_DEFAULT_LIMITS.browseSports,
      50
    ),
    browseCountries: clamp(
      over.browseCountries ?? SPORTS_HOME_DEFAULT_LIMITS.browseCountries,
      50
    ),
    todaysSchedule: clamp(
      over.todaysSchedule ?? SPORTS_HOME_DEFAULT_LIMITS.todaysSchedule,
      60
    ),
    trending: clamp(over.trending ?? SPORTS_HOME_DEFAULT_LIMITS.trending),
    recentlyFinished: clamp(
      over.recentlyFinished ?? SPORTS_HOME_DEFAULT_LIMITS.recentlyFinished
    ),
    highlights: clamp(
      over.highlights ?? SPORTS_HOME_DEFAULT_LIMITS.highlights
    ),
    replays: clamp(over.replays ?? SPORTS_HOME_DEFAULT_LIMITS.replays),
    startingSoonWindowMs:
      over.startingSoonWindowMs ??
      SPORTS_HOME_DEFAULT_LIMITS.startingSoonWindowMs,
    recentlyFinishedWindowMs:
      over.recentlyFinishedWindowMs ??
      SPORTS_HOME_DEFAULT_LIMITS.recentlyFinishedWindowMs,
    sectionTimeoutMs:
      over.sectionTimeoutMs ?? SPORTS_HOME_DEFAULT_LIMITS.sectionTimeoutMs,
  };
}
