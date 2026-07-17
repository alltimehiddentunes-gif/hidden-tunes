/**
 * Development-only Sports fixtures.
 * Guarded by isSportsDevFixturesEnabled() — impossible in production builds.
 * Never written to DB. Never returned by production backend.
 */
import {
  SPORTS_HOME_SECTION_RANK,
  SPORTS_HOME_SECTION_TITLES,
  SPORTS_VISIBLE_SPORTS,
  type SportsCompetitionCard,
  type SportsCountryCard,
  type SportsHomeResponse,
  type SportsHomeSection,
  type SportsMatchCard,
  type SportsVideoCard,
  type SportsWorldCard,
} from "../../../types/sports";
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}
function match(partial: SportsMatchCard): SportsMatchCard {
  return {
    participants: [],
    status: { code: "scheduled", label: "Upcoming", live: false, finished: false },
    timing: { startsAt: hoursFromNow(3) },
    watchability: { state: "starting_soon", playable: false },
    ...partial,
  };
}
export const DEV_FOOTBALL_LIVE: SportsMatchCard = match({
  id: "dev-fixture-football-live",
  sport: { id: "football", slug: "football", name: "Football" },
  competition: {
    id: "dev-comp-epl",
    slug: "premier-league",
    name: "Premier League",
    shortName: "EPL",
    countryCode: "GB",
  },
  participants: [
    {
      id: "dev-team-arsenal",
      type: "team",
      name: "Arsenal",
      shortName: "ARS",
      side: "home",
      score: 2,
    },
    {
      id: "dev-team-chelsea",
      type: "team",
      name: "Chelsea",
      shortName: "CHE",
      side: "away",
      score: 1,
    },
  ],
  status: { code: "live", label: "Live", live: true, finished: false },
  timing: { startsAt: hoursAgo(1), minute: 68, period: "2nd" },
  venue: { name: "Emirates Stadium", city: "London", countryCode: "GB" },
  watchability: {
    state: "watch",
    playable: true,
    playbackModeHint: "embed",
    access: "in_app",
  },
  availabilityState: "live_in_app",
  badges: ["LIVE"],
  featured: true,
});
export const DEV_BASKETBALL_LIVE: SportsMatchCard = match({
  id: "dev-fixture-basketball-live",
  sport: { id: "basketball", slug: "basketball", name: "Basketball" },
  competition: {
    id: "dev-comp-nba",
    slug: "nba",
    name: "NBA",
    shortName: "NBA",
    countryCode: "US",
  },
  participants: [
    {
      id: "dev-team-lakers",
      type: "team",
      name: "Lakers",
      shortName: "LAL",
      side: "home",
      score: 88,
    },
    {
      id: "dev-team-celtics",
      type: "team",
      name: "Celtics",
      shortName: "BOS",
      side: "away",
      score: 84,
    },
  ],
  status: { code: "live", label: "Live", live: true, finished: false },
  timing: { startsAt: hoursAgo(1.5), period: "Q3" },
  watchability: { state: "watch", playable: true, access: "in_app" },
  availabilityState: "live_in_app",
  badges: ["LIVE"],
});
export const DEV_LIVE_EXTERNAL: SportsMatchCard = match({
  id: "dev-fixture-live-external",
  sport: { id: "football", slug: "football", name: "Football" },
  competition: {
    id: "dev-comp-epl",
    slug: "premier-league",
    name: "Premier League",
    countryCode: "GB",
  },
  participants: [
    { id: "dev-team-city", type: "team", name: "Man City", side: "home", score: 1 },
    { id: "dev-team-united", type: "team", name: "Man United", side: "away", score: 0 },
  ],
  status: { code: "live", label: "Live", live: true, finished: false },
  timing: { startsAt: hoursAgo(0.8), minute: 41 },
  watchability: { state: "live_external", playable: false, access: "external" },
  availabilityState: "live_external",
  badges: ["LIVE"],
});
export const DEV_LIVE_SCORE_ONLY: SportsMatchCard = match({
  id: "dev-fixture-live-score-only",
  sport: { id: "tennis", slug: "tennis", name: "Tennis" },
  competition: {
    id: "dev-comp-wimbledon",
    slug: "wimbledon",
    name: "Wimbledon",
    countryCode: "GB",
  },
  participants: [
    { id: "dev-athlete-c", type: "athlete", name: "Djokovic", side: "home", score: "6-4" },
    { id: "dev-athlete-d", type: "athlete", name: "Medvedev", side: "away", score: "3-6" },
  ],
  status: { code: "live", label: "Live", live: true, finished: false },
  timing: { startsAt: hoursAgo(1), period: "Set 3" },
  watchability: { state: "unavailable", playable: false },
  availabilityState: "live_unavailable",
  badges: ["LIVE"],
});
export const DEV_TENNIS_SOON: SportsMatchCard = match({
  id: "dev-fixture-tennis-soon",
  sport: { id: "tennis", slug: "tennis", name: "Tennis" },
  competition: {
    id: "dev-comp-wimbledon",
    slug: "wimbledon",
    name: "Wimbledon",
    countryCode: "GB",
  },
  participants: [
    {
      id: "dev-athlete-a",
      type: "athlete",
      name: "Alcaraz",
      side: "home",
    },
    {
      id: "dev-athlete-b",
      type: "athlete",
      name: "Sinner",
      side: "away",
    },
  ],
  status: {
    code: "starting_soon",
    label: "Starting Soon",
    live: false,
    finished: false,
  },
  timing: { startsAt: hoursFromNow(0.4) },
  watchability: { state: "starting_soon", playable: false },
});
export const DEV_CRICKET_UPCOMING: SportsMatchCard = match({
  id: "dev-fixture-cricket-upcoming",
  sport: { id: "cricket", slug: "cricket", name: "Cricket" },
  competition: {
    id: "dev-comp-ipl",
    slug: "ipl",
    name: "IPL",
    countryCode: "IN",
  },
  participants: [
    { id: "dev-team-mi", type: "team", name: "Mumbai Indians", side: "home" },
    { id: "dev-team-csk", type: "team", name: "Chennai Super Kings", side: "away" },
  ],
  status: { code: "scheduled", label: "Upcoming", live: false, finished: false },
  timing: { startsAt: hoursFromNow(5) },
  watchability: { state: "starting_soon", playable: false },
});
export const DEV_MOTORSPORT_FEATURED: SportsMatchCard = match({
  id: "dev-fixture-motorsport-featured",
  sport: { id: "motorsport", slug: "motorsport", name: "Motorsport" },
  competition: {
    id: "dev-comp-f1",
    slug: "formula-1",
    name: "Formula 1",
    shortName: "F1",
  },
  participants: [
    { id: "dev-event-f1", type: "other", name: "British Grand Prix", side: "home" },
  ],
  status: {
    code: "starting_soon",
    label: "Starting Soon",
    live: false,
    finished: false,
  },
  timing: { startsAt: hoursFromNow(2) },
  watchability: { state: "starting_soon", playable: false },
  featured: true,
  recommendationReason: {
    code: "followed_competition",
    label: "Because you follow Formula 1",
  },
});
export const DEV_FINISHED_HIGHLIGHTS: SportsMatchCard = match({
  id: "dev-fixture-finished-highlights",
  sport: { id: "football", slug: "football", name: "Football" },
  competition: {
    id: "dev-comp-epl",
    slug: "premier-league",
    name: "Premier League",
    countryCode: "GB",
  },
  participants: [
    {
      id: "dev-team-liverpool",
      type: "team",
      name: "Liverpool",
      side: "home",
      score: 3,
      winner: true,
    },
    {
      id: "dev-team-tottenham",
      type: "team",
      name: "Tottenham",
      side: "away",
      score: 1,
    },
  ],
  status: {
    code: "highlights_available",
    label: "Highlights Available",
    live: false,
    finished: true,
  },
  timing: { startsAt: hoursAgo(5), endsAt: hoursAgo(3) },
  watchability: { state: "highlights", playable: true },
  availabilityState: "highlights_available",
});
export const DEV_REPLAY_MATCH: SportsMatchCard = match({
  id: "dev-fixture-replay",
  sport: { id: "basketball", slug: "basketball", name: "Basketball" },
  competition: {
    id: "dev-comp-nba",
    slug: "nba",
    name: "NBA",
    countryCode: "US",
  },
  participants: [
    {
      id: "dev-team-warriors",
      type: "team",
      name: "Warriors",
      side: "home",
      score: 112,
      winner: true,
    },
    {
      id: "dev-team-nuggets",
      type: "team",
      name: "Nuggets",
      side: "away",
      score: 108,
    },
  ],
  status: {
    code: "replay_available",
    label: "Replay Available",
    live: false,
    finished: true,
  },
  timing: { startsAt: hoursAgo(20), endsAt: hoursAgo(17) },
  watchability: { state: "replay", playable: true },
  availabilityState: "replay_available",
});
export const DEV_POSTPONED: SportsMatchCard = match({
  id: "dev-fixture-postponed",
  sport: { id: "football", slug: "football", name: "Football" },
  competition: {
    id: "dev-comp-laliga",
    slug: "la-liga",
    name: "La Liga",
    countryCode: "ES",
  },
  participants: [
    { id: "dev-team-barca", type: "team", name: "Barcelona", side: "home" },
    { id: "dev-team-madrid", type: "team", name: "Real Madrid", side: "away" },
  ],
  status: {
    code: "postponed",
    label: "Postponed",
    live: false,
    finished: false,
  },
  timing: { startsAt: hoursFromNow(1) },
  watchability: { state: "unavailable", playable: false },
});
export const DEV_UNAVAILABLE: SportsMatchCard = match({
  id: "dev-fixture-unavailable",
  sport: { id: "football", slug: "football", name: "Football" },
  competition: {
    id: "dev-comp-seriea",
    slug: "serie-a",
    name: "Serie A",
    countryCode: "IT",
  },
  participants: [
    { id: "dev-team-inter", type: "team", name: "Inter", side: "home", score: 1 },
    { id: "dev-team-milan", type: "team", name: "Milan", side: "away", score: 1 },
  ],
  status: {
    code: "unavailable",
    label: "Unavailable",
    live: true,
    finished: false,
  },
  timing: { startsAt: hoursAgo(0.5), minute: 22 },
  watchability: { state: "unavailable", playable: false },
  availabilityState: "live_unavailable",
});
export const DEV_CONTINUE_LIVE: SportsMatchCard = {
  ...DEV_FOOTBALL_LIVE,
  id: "dev-fixture-continue-live",
  resume: {
    label: "Resume live",
    stillLive: true,
    lastWatchedAt: hoursAgo(0.1),
  },
};
export const DEV_HIGHLIGHT_VIDEO: SportsVideoCard = {
  id: "dev-video-highlight-1",
  title: "Liverpool vs Tottenham — Highlights",
  videoType: "Highlights",
  status: "ready",
  fixtureId: DEV_FINISHED_HIGHLIGHTS.id,
  competitionName: "Premier League",
  durationSeconds: 540,
  publishedAt: hoursAgo(2),
};
export const DEV_REPLAY_VIDEO: SportsVideoCard = {
  id: "dev-video-replay-1",
  title: "Warriors vs Nuggets — Full Replay",
  videoType: "Full replay",
  status: "ready",
  fixtureId: DEV_REPLAY_MATCH.id,
  competitionName: "NBA",
  durationSeconds: 7800,
  publishedAt: hoursAgo(12),
};
const SPORT_NAMES: Record<string, string> = {
  football: "Football",
  basketball: "Basketball",
  tennis: "Tennis",
  cricket: "Cricket",
  rugby: "Rugby",
  baseball: "Baseball",
  "ice-hockey": "Ice Hockey",
  volleyball: "Volleyball",
  handball: "Handball",
  badminton: "Badminton",
  "table-tennis": "Table Tennis",
  golf: "Golf",
  motorsport: "Motorsport",
  cycling: "Cycling",
  athletics: "Athletics",
  swimming: "Swimming",
  boxing: "Boxing",
  mma: "MMA",
  wrestling: "Wrestling",
  esports: "Esports",
  olympics: "Olympics",
  "winter-sports": "Winter Sports",
};
export function buildDevWorldCards(): SportsWorldCard[] {
  return SPORTS_VISIBLE_SPORTS.map((slug, index) => ({
    id: `dev-sport-${slug}`,
    slug,
    name: SPORT_NAMES[slug] || slug,
    sortOrder: index,
    liveCount: slug === "football" || slug === "basketball" ? 1 : 0,
    upcomingCount:
      slug === "tennis" || slug === "cricket" || slug === "motorsport" ? 1 : 0,
    followed: slug === "football" || slug === "motorsport",
  }));
}
export function buildDevCompetitions(): SportsCompetitionCard[] {
  return [
    {
      id: "dev-comp-epl",
      slug: "premier-league",
      name: "Premier League",
      shortName: "EPL",
      sportSlug: "football",
      sportName: "Football",
      countryCode: "GB",
      countryName: "England",
      liveCount: 1,
      upcomingCount: 2,
      followed: true,
    },
    {
      id: "dev-comp-nba",
      slug: "nba",
      name: "NBA",
      sportSlug: "basketball",
      sportName: "Basketball",
      countryCode: "US",
      countryName: "United States",
      liveCount: 1,
      upcomingCount: 1,
    },
    {
      id: "dev-comp-f1",
      slug: "formula-1",
      name: "Formula 1",
      shortName: "F1",
      sportSlug: "motorsport",
      sportName: "Motorsport",
      upcomingCount: 1,
      followed: true,
    },
    {
      id: "dev-comp-wimbledon",
      slug: "wimbledon",
      name: "Wimbledon",
      sportSlug: "tennis",
      sportName: "Tennis",
      countryCode: "GB",
      countryName: "England",
      upcomingCount: 1,
    },
    {
      id: "dev-comp-ipl",
      slug: "ipl",
      name: "IPL",
      sportSlug: "cricket",
      sportName: "Cricket",
      countryCode: "IN",
      countryName: "India",
      upcomingCount: 1,
    },
  ];
}
export function buildDevCountries(): SportsCountryCard[] {
  return [
    {
      code: "GB",
      name: "United Kingdom",
      region: "Europe",
      competitionCount: 3,
      liveCount: 1,
    },
    {
      code: "US",
      name: "United States",
      region: "Americas",
      competitionCount: 2,
      liveCount: 1,
    },
    {
      code: "ES",
      name: "Spain",
      region: "Europe",
      competitionCount: 1,
      liveCount: 0,
    },
    {
      code: "IN",
      name: "India",
      region: "Asia",
      competitionCount: 1,
      liveCount: 0,
    },
    {
      code: "IT",
      name: "Italy",
      region: "Europe",
      competitionCount: 1,
      liveCount: 0,
    },
  ];
}
function section(
  id: string,
  type: string,
  items: unknown[],
  subtitle?: string
): SportsHomeSection {
  return {
    id,
    type,
    title: SPORTS_HOME_SECTION_TITLES[id] || id,
    subtitle,
    rank: SPORTS_HOME_SECTION_RANK[id] ?? 999,
    items,
  };
}
export type DevHomeProfile = "anonymous" | "football" | "basketball" | "personalized";
function preferSport(
  cards: SportsMatchCard[],
  slug: string
): SportsMatchCard[] {
  return [...cards].sort((a, b) => {
    const sa = a.sport?.slug === slug ? 0 : 1;
    const sb = b.sport?.slug === slug ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return String(a.id).localeCompare(String(b.id));
  });
}
export function buildDevSportsHome(
  profile: DevHomeProfile = "anonymous"
): SportsHomeResponse {
  const live = [
    DEV_FOOTBALL_LIVE,
    DEV_BASKETBALL_LIVE,
    DEV_LIVE_EXTERNAL,
    DEV_LIVE_SCORE_ONLY,
  ];
  const soon = [DEV_TENNIS_SOON, DEV_MOTORSPORT_FEATURED];
  const featured = [DEV_MOTORSPORT_FEATURED, DEV_FOOTBALL_LIVE];
  const schedule = [
    DEV_FOOTBALL_LIVE,
    DEV_BASKETBALL_LIVE,
    DEV_LIVE_EXTERNAL,
    DEV_LIVE_SCORE_ONLY,
    DEV_TENNIS_SOON,
    DEV_CRICKET_UPCOMING,
    DEV_MOTORSPORT_FEATURED,
    DEV_FINISHED_HIGHLIGHTS,
    DEV_POSTPONED,
  ];
  const finished = [DEV_FINISHED_HIGHLIGHTS, DEV_REPLAY_MATCH];
  let liveOrdered = live;
  let soonOrdered = soon;
  let featuredOrdered = featured;
  let becauseYouFollow: SportsMatchCard[] = [];
  if (profile === "football") {
    liveOrdered = preferSport(live, "football");
    soonOrdered = preferSport(soon, "football");
    featuredOrdered = preferSport(featured, "football");
  } else if (profile === "basketball") {
    liveOrdered = preferSport(live, "basketball");
    soonOrdered = preferSport(soon, "basketball");
    featuredOrdered = preferSport(featured, "basketball");
  } else if (profile === "personalized") {
    becauseYouFollow = [
      {
        ...DEV_FOOTBALL_LIVE,
        recommendationReason: {
          code: "followed_team",
          label: "Because you follow Arsenal",
        },
      },
      {
        ...DEV_MOTORSPORT_FEATURED,
        recommendationReason: {
          code: "followed_competition",
          label: "Because you follow Formula 1",
        },
      },
    ];
  }
  const sections: SportsHomeSection[] = [
    section("live_now", "live", liveOrdered),
    section("starting_soon", "fixtures", soonOrdered),
    section("featured", "fixtures", featuredOrdered),
    section(
      "because_you_follow",
      "fixtures",
      becauseYouFollow,
      profile === "personalized" ? "From your follows" : undefined
    ),
    section("continue_watching", "fixtures", [DEV_CONTINUE_LIVE]),
    section("popular_competitions", "competitions", buildDevCompetitions()),
    section("browse_sports", "sports", buildDevWorldCards()),
    section("browse_countries", "countries", buildDevCountries()),
    section("todays_schedule", "fixtures", schedule),
    section("trending", "fixtures", [
      { ...DEV_FOOTBALL_LIVE, fixtureOnly: true, badges: ["FIXTURE", "TRENDING"] },
    ]),
    section("recently_finished", "fixtures", finished),
    section("highlights", "videos", [DEV_HIGHLIGHT_VIDEO]),
    section("replays", "videos", [DEV_REPLAY_VIDEO]),
  ];

  // Empty sections omitted (including because_you_follow for anonymous).
  const cleaned = sections.filter((s) => s.items.length > 0);
  return {
    success: true,
    enabled: true,
    homeIaEnabled: true,
    personalizationEnabled: profile === "personalized",
    personalizationApplied: profile === "personalized",
    generatedAt: new Date().toISOString(),
    sections: cleaned,
    fixtureMode: true,
  };
}
export const ALL_DEV_FIXTURES: SportsMatchCard[] = [
  DEV_FOOTBALL_LIVE,
  DEV_BASKETBALL_LIVE,
  DEV_LIVE_EXTERNAL,
  DEV_LIVE_SCORE_ONLY,
  DEV_TENNIS_SOON,
  DEV_CRICKET_UPCOMING,
  DEV_MOTORSPORT_FEATURED,
  DEV_FINISHED_HIGHLIGHTS,
  DEV_REPLAY_MATCH,
  DEV_POSTPONED,
  DEV_UNAVAILABLE,
  DEV_CONTINUE_LIVE,
];
