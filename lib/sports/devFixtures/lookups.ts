import {
  ALL_DEV_FIXTURES,
  DEV_FINISHED_HIGHLIGHTS,
  DEV_FOOTBALL_LIVE,
  DEV_HIGHLIGHT_VIDEO,
  DEV_REPLAY_MATCH,
  DEV_REPLAY_VIDEO,
  buildDevCompetitions,
  buildDevSportsHome,
  buildDevWorldCards,
} from "./index";
import type {
  SportsCompetitionCard,
  SportsFixtureDetail,
  SportsHomeSection,
  SportsSearchResponse,
  SportsVideoCard,
  SportsWorldCard,
} from "../../../types/sports";
export function getDevFixtureDetail(
  fixtureId: string
): SportsFixtureDetail | null {
  const base = ALL_DEV_FIXTURES.find((f) => f.id === fixtureId);
  if (!base) return null;
  const related = ALL_DEV_FIXTURES.filter(
    (f) =>
      f.id !== fixtureId &&
      f.competition?.id &&
      f.competition.id === base.competition?.id
  ).slice(0, 4);
  const highlights: SportsVideoCard[] =
    base.id === DEV_FINISHED_HIGHLIGHTS.id ||
    base.status?.code === "highlights_available"
      ? [DEV_HIGHLIGHT_VIDEO]
      : [];
  const replays: SportsVideoCard[] =
    base.id === DEV_REPLAY_MATCH.id || base.status?.code === "replay_available"
      ? [DEV_REPLAY_VIDEO]
      : [];
  return {
    ...base,
    relatedFixtures: related,
    highlights,
    replays,
    timeline:
      base.status?.live || base.status?.finished
        ? [
            { id: "t1", minute: 12, label: "Goal", detail: "Home" },
            { id: "t2", minute: 44, label: "Goal", detail: "Away" },
            { id: "t3", minute: 68, label: "Goal", detail: "Home" },
          ]
        : [],
    broadcasts: base.watchability?.playable
      ? [
          {
            id: `dev-broadcast-${base.id}`,
            title: `${base.competition?.name || "Match"} broadcast`,
            broadcastType: "live",
            status: "available",
          },
        ]
      : base.id.includes("unavailable")
        ? [
            {
              id: `dev-broadcast-unavailable-${base.id}`,
              title: "Unavailable broadcast",
              status: "unavailable",
            },
          ]
        : [],
  };
}
export function getDevCompetition(competitionId: string): {
  competition: SportsCompetitionCard;
  fixtures: ReturnType<typeof ALL_DEV_FIXTURES.filter>;
  highlights: SportsVideoCard[];
  replays: SportsVideoCard[];
} | null {
  const competition = buildDevCompetitions().find((c) => c.id === competitionId);
  if (!competition) return null;
  const fixtures = ALL_DEV_FIXTURES.filter(
    (f) => f.competition?.id === competitionId
  );
  return {
    competition,
    fixtures,
    highlights: competitionId === "dev-comp-epl" ? [DEV_HIGHLIGHT_VIDEO] : [],
    replays: competitionId === "dev-comp-nba" ? [DEV_REPLAY_VIDEO] : [],
  };
}
export function getDevSportHub(sportSlug: string): {
  sport: SportsWorldCard | null;
  sections: SportsHomeSection[];
  fixtures: typeof ALL_DEV_FIXTURES;
} {
  const sport =
    buildDevWorldCards().find((s) => s.slug === sportSlug) || null;
  const fixtures = ALL_DEV_FIXTURES.filter((f) => f.sport?.slug === sportSlug);
  const competitions = buildDevCompetitions().filter(
    (c) => c.sportSlug === sportSlug
  );
  const live = fixtures.filter((f) => f.status?.live);
  const soon = fixtures.filter(
    (f) => String(f.status?.code || "") === "starting_soon"
  );
  return {
    sport,
    fixtures,
    sections: [
      {
        id: "live_now",
        type: "live",
        title: "Live Now",
        rank: 10,
        items: live,
      },
      {
        id: "starting_soon",
        type: "fixtures",
        title: "Starting Soon",
        rank: 20,
        items: soon,
      },
      {
        id: "popular_competitions",
        type: "competitions",
        title: "Featured competitions",
        rank: 60,
        items: competitions,
      },
      {
        id: "todays_schedule",
        type: "fixtures",
        title: "Today's Schedule",
        rank: 90,
        items: fixtures,
      },
      {
        id: "highlights",
        type: "videos",
        title: "Highlights",
        rank: 120,
        items:
          sportSlug === "football"
            ? [DEV_HIGHLIGHT_VIDEO]
            : [],
      },
      {
        id: "replays",
        type: "videos",
        title: "Replays",
        rank: 130,
        items: sportSlug === "basketball" ? [DEV_REPLAY_VIDEO] : [],
      },
    ].filter((s) => s.items.length > 0),
  };
}
export function searchDevSports(
  query: string,
  page = 1,
  limit = 40
): SportsSearchResponse {
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      success: true,
      enabled: true,
      query: "",
      groups: [],
      pagination: { page, limit, hasMore: false },
    };
  }
  const fixtures = ALL_DEV_FIXTURES.filter((f) => {
    const hay = [
      f.competition?.name,
      f.sport?.name,
      ...(f.participants || []).map((p) => p.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  const competitions = buildDevCompetitions().filter((c) =>
    `${c.name} ${c.sportName || ""}`.toLowerCase().includes(q)
  );
  const sports = buildDevWorldCards().filter((s) =>
    s.name.toLowerCase().includes(q)
  );
  const videos = [DEV_HIGHLIGHT_VIDEO, DEV_REPLAY_VIDEO].filter((v) =>
    v.title.toLowerCase().includes(q)
  );
  const groups = [
    { type: "fixtures", title: "Fixtures", items: fixtures },
    { type: "competitions", title: "Competitions", items: competitions },
    { type: "sports", title: "Sports", items: sports },
    { type: "videos", title: "Highlights & Replays", items: videos },
  ].filter((g) => g.items.length > 0);
  return {
    success: true,
    enabled: true,
    query,
    groups,
    pagination: { page, limit, hasMore: false },
    fixtureMode: true,
  } as SportsSearchResponse & { fixtureMode?: boolean };
}
export function assertDevFixturesNotInProduction(): boolean {
  if (typeof __DEV__ !== "undefined" && __DEV__) return true;
  // Production builds must never activate fixture mode through this module alone.
  return false;
}
// Keep football live hero reference for tests
export { DEV_FOOTBALL_LIVE, buildDevSportsHome };
