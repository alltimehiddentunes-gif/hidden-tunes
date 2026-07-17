/**
 * Frontend Sports experience tests — Phase 3.
 * Run: npx tsx scripts/test-sports-frontend.ts
 */
import assert from "assert/strict";

import {
  isSportsClientEnabled,
  isSportsDevFixturesEnabled,
  isSportsFullUiEnabled,
  SPORTS_CLIENT_FLAGS,
} from "../constants/sportsFlags";
import {
  ALL_DEV_FIXTURES,
  DEV_FOOTBALL_LIVE,
  DEV_POSTPONED,
  DEV_UNAVAILABLE,
  buildDevSportsHome,
} from "../lib/sports/devFixtures";
import { assertDevFixturesNotInProduction, searchDevSports } from "../lib/sports/devFixtures/lookups";
import { buildMatchAccessibilityLabel } from "../lib/sports/ui/buildAccessibilityLabel";
import {
  boundSectionItems,
  omitEmptySportsSections,
  pickSportsHero,
  sortSportsHomeSections,
  stableSportsKey,
  SPORTS_SECTION_LIMITS,
} from "../lib/sports/ui/homeSections";
import {
  canShowWatchAction,
  formatStatusLabel,
  primaryActionLabel,
} from "../lib/sports/ui/formatStatus";
import { formatMatchTitle, formatScore } from "../lib/sports/ui/formatScore";
import type { SportsHomeSection, SportsMatchCard } from "../types/sports";

function section(
  id: string,
  type: string,
  items: unknown[],
  rank: number
): SportsHomeSection {
  return { id, type, title: id, rank, items };
}

function main() {
  // --- Flags default false ---
  assert.equal(SPORTS_CLIENT_FLAGS.sports_enabled, false);
  assert.equal(SPORTS_CLIENT_FLAGS.sports_full_ui_enabled, false);
  assert.equal(SPORTS_CLIENT_FLAGS.sports_mobile_pilot_enabled, false);
  assert.equal(SPORTS_CLIENT_FLAGS.sports_home_ia_enabled, false);
  assert.equal(isSportsFullUiEnabled(), false);

  // Dev fixtures impossible without __DEV__ + env (env unset → false)
  assert.equal(isSportsDevFixturesEnabled(), false);

  // --- Home section ordering ---
  const unordered = [
    section("replays", "videos", [{ id: "r1" }], 130),
    section("live_now", "live", [{ id: "l1" }], 10),
    section("featured", "fixtures", [{ id: "f1" }], 30),
  ];
  const ordered = sortSportsHomeSections(unordered);
  assert.deepEqual(
    ordered.map((s) => s.id),
    ["live_now", "featured", "replays"]
  );

  // --- Empty section omission ---
  const withEmpty = omitEmptySportsSections([
    section("live_now", "live", [DEV_FOOTBALL_LIVE], 10),
    section("trending", "fixtures", [], 100),
    section("because_you_follow", "fixtures", [], 40),
    section("broken", "fixtures", [], 50),
  ]);
  // errored empty still kept if error set
  const withError = omitEmptySportsSections([
    { ...section("trending", "fixtures", [], 100), error: "failed" },
    section("live_now", "live", [DEV_FOOTBALL_LIVE], 10),
  ]);
  assert.equal(withEmpty.some((s) => s.id === "trending"), false);
  assert.equal(withEmpty.some((s) => s.id === "because_you_follow"), false);
  assert.equal(withError.some((s) => s.id === "trending"), true);
  assert.equal(withEmpty.length, 1);

  // --- Hero ---
  const home = buildDevSportsHome("anonymous");
  assert.ok(Array.isArray(home.sections));
  const hero = pickSportsHero(home.sections as SportsHomeSection[]);
  assert.ok(hero);
  assert.equal(hero!.status?.live || hero!.id.includes("fixture"), true);
  assert.ok(formatMatchTitle(hero!).length > 0);

  // Anonymous: no because_you_follow
  assert.equal(
    (home.sections as SportsHomeSection[]).some((s) => s.id === "because_you_follow"),
    false
  );

  // Personalized: because_you_follow present
  const personalized = buildDevSportsHome("personalized");
  assert.ok(
    (personalized.sections as SportsHomeSection[]).some(
      (s) => s.id === "because_you_follow" && s.items.length > 0
    )
  );

  // Football preference ordering
  const football = buildDevSportsHome("football");
  const liveFootball = (football.sections as SportsHomeSection[]).find(
    (s) => s.id === "live_now"
  );
  assert.equal(
    (liveFootball?.items[0] as SportsMatchCard).sport?.slug,
    "football"
  );

  // Basketball preference ordering
  const basketball = buildDevSportsHome("basketball");
  const liveBasketball = (basketball.sections as SportsHomeSection[]).find(
    (s) => s.id === "live_now"
  );
  assert.equal(
    (liveBasketball?.items[0] as SportsMatchCard).sport?.slug,
    "basketball"
  );

  // --- Live / starting soon / finished cards ---
  assert.equal(formatStatusLabel("live"), "LIVE");
  assert.equal(formatStatusLabel("starting_soon"), "STARTING SOON");
  assert.equal(formatStatusLabel("finished"), "FINAL");
  assert.equal(formatScore(DEV_FOOTBALL_LIVE), "2–1");
  assert.ok(canShowWatchAction(DEV_FOOTBALL_LIVE));
  assert.equal(primaryActionLabel(DEV_FOOTBALL_LIVE), "Watch");

  // Cancelled / postponed — no Watch
  assert.equal(canShowWatchAction(DEV_POSTPONED), false);
  assert.equal(primaryActionLabel(DEV_POSTPONED), null);
  assert.equal(canShowWatchAction(DEV_UNAVAILABLE), false);
  assert.equal(primaryActionLabel(DEV_UNAVAILABLE), null);

  // Replay / highlights actions
  const finishedHighlights = ALL_DEV_FIXTURES.find(
    (f) => f.id === "dev-fixture-finished-highlights"
  )!;
  assert.equal(primaryActionLabel(finishedHighlights), "Highlights");
  const replay = ALL_DEV_FIXTURES.find((f) => f.id === "dev-fixture-replay")!;
  assert.equal(primaryActionLabel(replay), "Replay");

  // Accessibility label
  const a11y = buildMatchAccessibilityLabel(DEV_FOOTBALL_LIVE);
  assert.match(a11y, /Arsenal/i);
  assert.match(a11y, /Chelsea/i);
  assert.match(a11y, /live/i);

  // Bounded rendering
  const many = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}` }));
  assert.equal(
    boundSectionItems(many, SPORTS_SECTION_LIMITS.horizontal).length,
    SPORTS_SECTION_LIMITS.horizontal
  );
  assert.equal(stableSportsKey("live_now", { id: "abc" }, 0), "live_now:abc");

  // Search grouped results
  const search = searchDevSports("arsenal");
  assert.ok((search.groups || []).length > 0);
  assert.ok(
    (search.groups || []).some((g) => g.type === "fixtures" && g.items.length > 0)
  );

  // No provider URLs in fixture cards
  for (const card of ALL_DEV_FIXTURES) {
    const json = JSON.stringify(card);
    assert.equal(/https?:\/\/(?!admin\.hiddentunes)/i.test(json), false);
    assert.equal(json.includes("embedHtml"), false);
    assert.equal(json.includes("scorebat"), false);
  }

  // Dev fixtures production guard helper
  assert.equal(typeof assertDevFixturesNotInProduction(), "boolean");

  // Fixture mode marker only on fixture homes
  assert.equal(home.fixtureMode, true);

  // Section error isolation: omitEmpty keeps errored sections
  const isolated = omitEmptySportsSections([
    section("live_now", "live", [DEV_FOOTBALL_LIVE], 10),
    { ...section("trending", "fixtures", [], 100), error: "Sports could not be loaded right now." },
  ]);
  assert.equal(isolated.length, 2);

  // Client flag reader still respects defaults
  assert.equal(isSportsClientEnabled("sports_enabled"), false);

  console.log("test-sports-frontend: all assertions passed");
}

main();
