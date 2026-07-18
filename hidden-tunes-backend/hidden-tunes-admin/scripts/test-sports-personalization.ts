/**
 * Sports Phase 2C personalization tests — pure domain (no DB).
 * Run: npx tsx scripts/test-sports-personalization.ts
 */

import assert from "node:assert/strict";

import { applyDiscoveryBalance } from "../lib/sports/personalization/applyDiscoveryBalance";
import { buildPreferenceProfileFromSignals } from "../lib/sports/personalization/buildPreferenceProfile";
import {
  applyRecencyDecay,
  decayFactorForAgeDays,
  isMeaningfulSportsWatch,
} from "../lib/sports/personalization/decay";
import {
  emptyPreferenceProfile,
  profileHasSignals,
} from "../lib/sports/personalization/profileHelpers";
import { personalizeSectionResult, rankMatchSection } from "../lib/sports/personalization/rankSection";
import { scoreMatchCard } from "../lib/sports/personalization/scoreMatchCard";
import { SPORTS_FEATURE_FLAG_DEFAULTS } from "../lib/sports/constants";
import { sportsBrowsePayloadLeaksSecrets } from "../lib/sports/home/matchCard";
import type { SportsMatchCard } from "../lib/sports/home/types";
import { SPORTS_EXPLICIT_WEIGHTS, SPORTS_IMPLICIT_WEIGHTS } from "../lib/sports/personalization/weights";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function card(over: Partial<SportsMatchCard> & { id: string; sportSlug?: string }): SportsMatchCard {
  const sportSlug = over.sportSlug || over.sport?.slug || "football";
  return {
    id: over.id,
    sport: over.sport || {
      id: sportSlug === "basketball" ? "sport-bb" : "sport-fb",
      slug: sportSlug,
      name: sportSlug === "basketball" ? "Basketball" : "Football",
    },
    competition: over.competition ?? {
      id: sportSlug === "basketball" ? "comp-nba" : "comp-epl",
      name: sportSlug === "basketball" ? "NBA" : "Premier League",
      shortName: sportSlug === "basketball" ? "NBA" : "EPL",
      countryCode: "US",
    },
    participants: over.participants || [
      {
        id: sportSlug === "basketball" ? "team-lakers" : "team-arsenal",
        type: "team",
        name: sportSlug === "basketball" ? "Lakers" : "Arsenal",
        side: "home",
      },
      {
        id: sportSlug === "basketball" ? "team-celtics" : "team-chelsea",
        type: "team",
        name: sportSlug === "basketball" ? "Celtics" : "Chelsea",
        side: "away",
      },
    ],
    status: over.status || {
      code: "scheduled",
      label: "Scheduled",
      live: false,
      finished: false,
    },
    timing: over.timing || {
      startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    },
    watchability: over.watchability || {
      state: "starting_soon",
      playable: false,
    },
    badges: over.badges,
    venue: over.venue,
  };
}

const inventory: SportsMatchCard[] = [
  card({ id: "fb-1", sportSlug: "football" }),
  card({ id: "bb-1", sportSlug: "basketball" }),
  card({
    id: "fb-live",
    sportSlug: "football",
    status: { code: "live", label: "Live", live: true, finished: false },
    watchability: { state: "watch", playable: true },
  }),
  card({
    id: "bb-live",
    sportSlug: "basketball",
    status: { code: "live", label: "Live", live: true, finished: false },
    watchability: { state: "watch", playable: true },
  }),
  card({ id: "fb-2", sportSlug: "football" }),
  card({ id: "bb-2", sportSlug: "basketball" }),
  card({
    id: "tennis-1",
    sportSlug: "tennis",
    sport: { id: "sport-ten", slug: "tennis", name: "Tennis" },
    competition: {
      id: "comp-wim",
      name: "Wimbledon",
      shortName: "WIM",
      countryCode: "GB",
    },
    participants: [
      { id: "ath-1", type: "athlete", name: "Player A", side: "home" },
      { id: "ath-2", type: "athlete", name: "Player B", side: "away" },
    ],
  }),
];

test("feature flag defaults personalization off", () => {
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_personalization_enabled, false);
  assert.equal(SPORTS_FEATURE_FLAG_DEFAULTS.sports_enabled, false);
});

test("followed team ranks higher", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.teamIds.add("team-arsenal");
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  const ids = ranked.map((c) => c.id);
  assert.ok(ids.indexOf("fb-1") < ids.indexOf("bb-1"));
});

test("followed athlete ranks higher", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.athleteIds.add("ath-1");
  const ranked = rankMatchSection(
    [card({ id: "x1", sportSlug: "football" }), inventory.find((c) => c.id === "tennis-1")!],
    { sectionId: "live_now", profile, personalizationEnabled: true }
  );
  assert.equal(ranked[0].id, "tennis-1");
});

test("followed competition ranks higher", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.competitionIds.add("comp-nba");
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.ok(ranked.findIndex((c) => c.competition?.id === "comp-nba") < ranked.findIndex((c) => c.competition?.id === "comp-epl"));
});

test("followed sport ranks higher", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.sportIds.add("sport-bb");
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.ok(
    ranked.findIndex((c) => c.sport.slug === "basketball") <
      ranked.findIndex((c) => c.sport.slug === "football")
  );
});

test("reminder-set fixture ranks higher", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.reminders.add("bb-2");
  const ranked = rankMatchSection(
    [card({ id: "fb-x", sportSlug: "football" }), card({ id: "bb-2", sportSlug: "basketball" })],
    { sectionId: "starting_soon", profile, personalizationEnabled: true }
  );
  assert.equal(ranked[0].id, "bb-2");
});

test("Continue Watching remains first / no discovery injection", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.teamIds.add("team-arsenal");
  const source = [
    card({ id: "cw-1", sportSlug: "basketball" }),
    card({ id: "cw-2", sportSlug: "football" }),
  ];
  const ranked = rankMatchSection(source, {
    sectionId: "continue_watching",
    profile,
    personalizationEnabled: true,
  });
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["cw-1", "cw-2"]
  );
});

test("meaningful watch history influences ranking", () => {
  const profile = buildPreferenceProfileFromSignals({
    userId: "u1",
    watchHistory: [
      {
        fixture_id: "bb-hist",
        sport_id: "sport-bb",
        competition_id: "comp-nba",
        team_ids: ["team-lakers"],
        position_ms: 120_000,
        duration_ms: 200_000,
        completed: false,
        last_watched_at: new Date().toISOString(),
      },
    ],
  });
  assert.ok(profileHasSignals(profile));
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.ok(
    ranked.findIndex((c) => c.sport.slug === "basketball") <
      ranked.findIndex((c) => c.sport.slug === "tennis")
  );
});

test("single tap has weak influence vs explicit follow", () => {
  const profile = buildPreferenceProfileFromSignals({
    userId: "u1",
    follows: [{ target_type: "team", target_id: "team-arsenal" }],
    watchHistory: [
      {
        fixture_id: "bb-1",
        sport_id: "sport-bb",
        team_ids: ["team-lakers"],
        position_ms: 5_000,
        duration_ms: 200_000,
        completed: false,
        last_watched_at: new Date().toISOString(),
      },
    ],
  });
  const { score: arsenalScore } = scoreMatchCard(
    inventory.find((c) => c.id === "fb-1")!,
    { profile }
  );
  const { score: lakersScore } = scoreMatchCard(
    inventory.find((c) => c.id === "bb-1")!,
    { profile }
  );
  assert.ok(arsenalScore.followedTeam >= SPORTS_EXPLICIT_WEIGHTS.followedTeam);
  assert.ok(arsenalScore.total > lakersScore.total);
  assert.ok(
    lakersScore.implicitAffinity <= SPORTS_IMPLICIT_WEIGHTS.singleFixtureOpen + 20
  );
});

test("explicit follow outranks weak implicit history", () => {
  const profile = buildPreferenceProfileFromSignals({
    userId: "u1",
    follows: [{ target_type: "sport", target_id: "sport-fb" }],
    watchHistory: Array.from({ length: 5 }, (_, i) => ({
      fixture_id: `bb-open-${i}`,
      sport_id: "sport-bb",
      position_ms: 3_000,
      last_watched_at: new Date().toISOString(),
    })),
  });
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.ok(
    ranked.findIndex((c) => c.sport.id === "sport-fb") <
      ranked.findIndex((c) => c.sport.id === "sport-bb")
  );
});

test("old activity decays", () => {
  assert.equal(decayFactorForAgeDays(3), 1);
  assert.equal(decayFactorForAgeDays(10), 0.75);
  assert.equal(decayFactorForAgeDays(45), 0.45);
  assert.equal(decayFactorForAgeDays(120), 0.2);
  assert.equal(decayFactorForAgeDays(200), 0.05);
  const recent = applyRecencyDecay(100, new Date().toISOString());
  const old = applyRecencyDecay(
    100,
    new Date(Date.now() - 200 * 24 * 60 * 60_000).toISOString()
  );
  assert.ok(recent > old);
});

test("meaningful session threshold", () => {
  assert.equal(isMeaningfulSportsWatch({ positionMs: 60_000 }), true);
  assert.equal(isMeaningfulSportsWatch({ completed: true }), true);
  assert.equal(
    isMeaningfulSportsWatch({ positionMs: 50, durationMs: 100 }),
    true
  );
  assert.equal(
    isMeaningfulSportsWatch({ positionMs: 5_000, durationMs: 200_000 }),
    false
  );
});

test("anonymous user receives neutral ranking", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const a = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile: null,
    personalizationEnabled: true,
    now,
  });
  const b = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile: null,
    personalizationEnabled: true,
    now,
  });
  assert.deepEqual(
    a.map((c) => c.id),
    b.map((c) => c.id)
  );
  // Live cards should surface ahead of scheduled under neutral.
  assert.ok(
    a.findIndex((c) => c.status.live) <
      a.findIndex((c) => !c.status.live)
  );
});

test("no-data user receives neutral ranking", () => {
  const empty = emptyPreferenceProfile("u-empty");
  assert.equal(profileHasSignals(empty), false);
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile: empty,
    personalizationEnabled: true,
  });
  assert.equal(ranked.length, inventory.length);
});

test("discovery inventory remains present / no eligible item disappears", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.sportIds.add("sport-fb");
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.equal(ranked.length, inventory.length);
  for (const item of inventory) {
    assert.ok(ranked.some((c) => c.id === item.id));
  }
});

test("no duplicates from discovery mixing", () => {
  const scored = inventory.map((item, i) => ({
    item,
    score: 100 - i,
    tieKey: item.id,
    breakdown: {
      continueWatching: 0,
      reminder: 0,
      followedTeam: i === 0 ? 120 : 0,
      followedAthlete: 0,
      followedCompetition: 0,
      preferredSport: 0,
      preferredCountry: 0,
      preferredLanguage: 0,
      implicitAffinity: 0,
      livePriority: item.status.live ? 40 : 0,
      freshness: 20,
      editorialPriority: 0,
      globalImportance: 15,
      discoveryAdjustment: 0,
      total: 100 - i,
    },
  }));
  const mixed = applyDiscoveryBalance(scored);
  const ids = mixed.map((m) => m.tieKey);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(ids.length, inventory.length);
});

test("Today's Schedule keeps chronological groups", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.sportIds.add("sport-bb");
  const now = new Date();
  const items = [
    card({
      id: "later-bb",
      sportSlug: "basketball",
      status: { code: "scheduled", label: "Scheduled", live: false, finished: false },
      timing: { startsAt: new Date(now.getTime() + 5 * 3600_000).toISOString() },
    }),
    card({
      id: "soon-fb",
      sportSlug: "football",
      status: {
        code: "starting_soon",
        label: "Starting Soon",
        live: false,
        finished: false,
      },
      timing: { startsAt: new Date(now.getTime() + 10 * 60_000).toISOString() },
    }),
    card({
      id: "live-fb",
      sportSlug: "football",
      status: { code: "live", label: "Live", live: true, finished: false },
    }),
    card({
      id: "fin-bb",
      sportSlug: "basketball",
      status: {
        code: "finished",
        label: "Finished",
        live: false,
        finished: true,
      },
    }),
  ];
  const ranked = rankMatchSection(items, {
    sectionId: "todays_schedule",
    profile,
    personalizationEnabled: true,
    now,
  });
  assert.equal(ranked[0].id, "live-fb");
  assert.equal(ranked[1].id, "soon-fb");
  assert.ok(ranked.findIndex((c) => c.id === "later-bb") < ranked.findIndex((c) => c.id === "fin-bb"));
});

test("Starting Soon respects start time", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.teamIds.add("team-arsenal");
  const now = new Date();
  const soon = card({
    id: "soon-bb",
    sportSlug: "basketball",
    timing: { startsAt: new Date(now.getTime() + 5 * 60_000).toISOString() },
  });
  const laterPreferred = card({
    id: "later-fb",
    sportSlug: "football",
    participants: [
      { id: "team-arsenal", type: "team", name: "Arsenal", side: "home" },
      { id: "team-chelsea", type: "team", name: "Chelsea", side: "away" },
    ],
    timing: { startsAt: new Date(now.getTime() + 2 * 3600_000).toISOString() },
  });
  const ranked = rankMatchSection([laterPreferred, soon], {
    sectionId: "starting_soon",
    profile,
    personalizationEnabled: true,
    now,
  });
  assert.equal(ranked[0].id, "soon-bb");
});

test("Trending remains trend-led (loader order)", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.sportIds.add("sport-fb");
  const source = [
    card({ id: "bb-trend", sportSlug: "basketball" }),
    card({ id: "fb-trend", sportSlug: "football" }),
  ];
  const ranked = rankMatchSection(source, {
    sectionId: "trending",
    profile,
    personalizationEnabled: true,
  });
  assert.deepEqual(
    ranked.map((c) => c.id),
    ["bb-trend", "fb-trend"]
  );
});

test("Featured remains editorial-led", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.sportIds.add("sport-bb");
  const featuredFb = card({
    id: "feat-fb",
    sportSlug: "football",
    badges: ["featured"],
  });
  const preferredBb = card({ id: "pref-bb", sportSlug: "basketball" });
  const ranked = rankMatchSection([preferredBb, featuredFb], {
    sectionId: "featured",
    profile,
    personalizationEnabled: true,
  });
  assert.equal(ranked[0].id, "feat-fb");
});

test("equal inputs produce stable order", () => {
  const profile = emptyPreferenceProfile("u1");
  const a = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  const b = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.deepEqual(
    a.map((c) => c.id),
    b.map((c) => c.id)
  );
});

test("source arrays are not mutated", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.sportIds.add("sport-bb");
  const source = [...inventory];
  const before = source.map((c) => c.id).join(",");
  rankMatchSection(source, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
  });
  assert.equal(source.map((c) => c.id).join(","), before);
});

test("disabled flag preserves Phase 2B output (identity)", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.sportIds.add("sport-bb");
  const out = personalizeSectionResult("live_now", "live", inventory, {
    profile,
    personalizationEnabled: false,
  }) as SportsMatchCard[];
  assert.deepEqual(
    out.map((c) => c.id),
    inventory.map((c) => c.id)
  );
});

test("profile-loading failure falls back (null profile = neutral, inventory intact)", () => {
  const out = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile: null,
    personalizationEnabled: true,
  });
  assert.equal(out.length, inventory.length);
});

test("provider / playback / private scores absent from cards", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.teamIds.add("team-arsenal");
  const ranked = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile,
    personalizationEnabled: true,
    attachReasons: true,
  });
  const json = JSON.stringify(ranked);
  assert.equal(/m3u8|\.mpd|source_url|api_key|Bearer/i.test(json), false);
  assert.equal(/"total":|"followedTeam":|"implicitAffinity":/i.test(json), false);
  for (const c of ranked) {
    assert.equal(sportsBrowsePayloadLeaksSecrets(c).length, 0);
  }
  const withReason = ranked.find((c) => c.recommendationReason);
  if (withReason?.recommendationReason) {
    assert.ok(withReason.recommendationReason.label);
    assert.equal("score" in withReason.recommendationReason, false);
  }
});

test("candidate scoring remains bounded", () => {
  const profile = emptyPreferenceProfile("u1");
  profile.explicit.teamIds.add("team-arsenal");
  profile.reminders.add("fb-1");
  profile.continueWatchingFixtureIds.add("fb-1");
  const { score } = scoreMatchCard(inventory.find((c) => c.id === "fb-1")!, {
    profile,
  });
  assert.ok(score.total <= 800);
  assert.ok(score.implicitAffinity <= 120);
});

test("Football vs Basketball vs Anonymous ordering examples", () => {
  const footballFan = emptyPreferenceProfile("fb-user");
  footballFan.explicit.sportIds.add("sport-fb");
  footballFan.explicit.competitionIds.add("comp-epl");
  footballFan.explicit.teamIds.add("team-arsenal");

  const basketballFan = emptyPreferenceProfile("bb-user");
  basketballFan.explicit.sportIds.add("sport-bb");
  basketballFan.explicit.competitionIds.add("comp-nba");
  basketballFan.explicit.teamIds.add("team-lakers");

  const fbOrder = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile: footballFan,
    personalizationEnabled: true,
  }).map((c) => c.sport.slug);

  const bbOrder = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile: basketballFan,
    personalizationEnabled: true,
  }).map((c) => c.sport.slug);

  const anonOrder = rankMatchSection(inventory, {
    sectionId: "live_now",
    profile: null,
    personalizationEnabled: true,
  }).map((c) => c.id);

  // Same inventory length
  assert.equal(fbOrder.length, inventory.length);
  assert.equal(bbOrder.length, inventory.length);
  assert.equal(anonOrder.length, inventory.length);

  // Football fan: first non-live preference should lean football
  const fbFirstPreferred = fbOrder.find((s) => s === "football" || s === "basketball");
  assert.equal(fbFirstPreferred, "football");

  const bbFirstPreferred = bbOrder.find((s) => s === "football" || s === "basketball");
  assert.equal(bbFirstPreferred, "basketball");

  // Orders differ between profiles
  assert.notDeepEqual(fbOrder, bbOrder);

  console.log(
    JSON.stringify({
      example: "same inventory, different order",
      footballFanTop3: rankMatchSection(inventory, {
        sectionId: "live_now",
        profile: footballFan,
        personalizationEnabled: true,
      })
        .slice(0, 3)
        .map((c) => c.id),
      basketballFanTop3: rankMatchSection(inventory, {
        sectionId: "live_now",
        profile: basketballFan,
        personalizationEnabled: true,
      })
        .slice(0, 3)
        .map((c) => c.id),
      anonymousTop3: anonOrder.slice(0, 3),
    })
  );
});

console.log(`\n${passed} passed`);
