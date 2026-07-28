/**
 * Unit checks for Sports public eligibility (no network).
 * Run: npx tsx scripts/sports/testPublicEligibility.ts
 */
import {
  isPublicSportsCompetitionEligible,
  isPublicSportsFixtureEligible,
} from "../../lib/sports/publicEligibility";
import type { SportsMatchCard } from "../../lib/sports/home/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const baseCard = (over: Partial<SportsMatchCard>): SportsMatchCard =>
  ({
    id: "f1",
    sport: { id: "s1", slug: "football", name: "Football" },
    competition: {
      id: "c1",
      slug: "bundesliga",
      name: "Bundesliga",
    },
    participants: [
      { id: "t1", type: "team", name: "Bayern", side: "home", score: 2 },
      { id: "t2", type: "team", name: "Dortmund", side: "away", score: 1 },
    ],
    status: {
      code: "finished",
      label: "Final",
      live: false,
      finished: true,
    },
    timing: { startsAt: "2026-07-19T15:00:00.000Z" },
    watchability: { state: "unavailable", playable: false },
    ...over,
  }) as SportsMatchCard;

assert(
  !isPublicSportsCompetitionEligible({
    name: "iptv-org Country Sports — Multi-Sport",
    slug: "ww-iptv-org-country-sports-de",
  }),
  "iptv competition must be rejected"
);

assert(
  isPublicSportsCompetitionEligible({
    name: "Bundesliga",
    slug: "bundesliga",
  }),
  "Bundesliga must be eligible"
);

assert(
  !isPublicSportsFixtureEligible(
    baseCard({
      competition: {
        id: "c",
        name: "TV Catalog Sports Bridge",
        slug: "tv-catalog-sports-bridge",
      },
      participants: [],
    })
  ),
  "TV Catalog fixture must be rejected"
);

assert(
  !isPublicSportsFixtureEligible(
    baseCard({
      participants: [],
      title: "Pluto TV Snooker 900 (720p)",
    })
  ),
  "channel title without teams must be rejected"
);

assert(
  !isPublicSportsFixtureEligible(
    baseCard({
      participants: [
        { id: "a", type: "team", name: "TBD", side: "home" },
        { id: "b", type: "team", name: "TBD", side: "away" },
      ],
      status: {
        code: "finished",
        label: "Final",
        live: false,
        finished: true,
      },
    })
  ),
  "TBD vs TBD finished must be rejected"
);

assert(
  isPublicSportsFixtureEligible(baseCard({})),
  "real finished fixture with scores must pass"
);

console.log("publicEligibility tests passed");
